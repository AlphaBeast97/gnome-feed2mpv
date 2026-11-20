import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const CHECK_TIMEOUT_SECONDS = 15;
const MAX_CONCURRENT_CHECKS = 2;
const CACHE_LIMIT = 64;
const CACHE_TTL_MS = 10 * 60 * 1000;

function hasPlayableFormat(info) {
    if (!info || typeof info !== 'object' || info._type === 'playlist')
        return false;

    const formats = [
        ...(Array.isArray(info.formats) ? info.formats : []),
        ...(Array.isArray(info.requested_formats) ? info.requested_formats : []),
    ];
    if (info.url)
        formats.push(info);

    return formats.some(format => {
        if (!format || typeof format.url !== 'string' || !format.url)
            return false;
        const hasVideo = typeof format.vcodec === 'string' && format.vcodec !== 'none';
        const hasAudio = typeof format.acodec === 'string' && format.acodec !== 'none';
        return hasVideo || hasAudio;
    });
}

export class StreamabilityChecker {
    constructor() {
        this._cache = new Map();
        this._pending = new Map();
        this._queue = [];
        this._activeChecks = 0;
        this._destroyed = false;
    }

    check(url, callback) {
        if (this._destroyed)
            return;

        const cached = this._cache.get(url);
        if (cached && cached.expiresAt > Date.now()) {
            callback(cached.streamable);
            return;
        }
        this._cache.delete(url);

        const pending = this._pending.get(url);
        if (pending) {
            pending.callbacks.push(callback);
            return;
        }

        const request = {
            callbacks: [callback],
            cancellable: new Gio.Cancellable(),
            process: null,
            started: false,
            timeoutId: 0,
            timedOut: false,
        };
        this._pending.set(url, request);
        this._queue.push({url, request});
        this._pumpQueue();
    }

    _pumpQueue() {
        while (!this._destroyed && this._activeChecks < MAX_CONCURRENT_CHECKS &&
            this._queue.length > 0) {
            const {url, request} = this._queue.shift();
            if (this._pending.get(url) === request)
                this._startRequest(url, request);
        }
    }

    _startRequest(url, request) {
        try {
            request.process = Gio.Subprocess.new([
                'yt-dlp',
                '--ignore-config',
                '--no-warnings',
                '--no-progress',
                '--no-playlist',
                '--simulate',
                '--dump-single-json',
                url,
            ], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (_) {
            this._finish(url, false);
            return;
        }
        request.started = true;
        this._activeChecks++;

        request.timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            CHECK_TIMEOUT_SECONDS,
            () => {
                request.timeoutId = 0;
                request.timedOut = true;
                request.process.force_exit();
                request.cancellable.cancel();
                return GLib.SOURCE_REMOVE;
            });

        request.process.communicate_utf8_async(null, request.cancellable, (process, result) => {
            if (request.timeoutId) {
                GLib.source_remove(request.timeoutId);
                request.timeoutId = 0;
            }

            let streamable = false;
            try {
                const [stdout] = process.communicate_utf8_finish(result);
                if (!request.timedOut && process.get_successful())
                    streamable = hasPlayableFormat(JSON.parse(stdout ?? ''));
            } catch (_) {
                streamable = false;
            }
            this._finish(url, streamable);
        });
    }

    destroy() {
        this._destroyed = true;
        for (const request of this._pending.values()) {
            if (request.timeoutId)
                GLib.source_remove(request.timeoutId);
            request.process?.force_exit();
            request.cancellable.cancel();
        }
        this._pending.clear();
        this._queue = [];
        this._activeChecks = 0;
        this._cache.clear();
    }

    _finish(url, streamable) {
        const request = this._pending.get(url);
        if (!request)
            return;
        this._pending.delete(url);
        if (request.started)
            this._activeChecks--;

        if (this._destroyed)
            return;

        this._cache.delete(url);
        this._cache.set(url, {streamable, expiresAt: Date.now() + CACHE_TTL_MS});
        while (this._cache.size > CACHE_LIMIT)
            this._cache.delete(this._cache.keys().next().value);

        this._pumpQueue();
        for (const callback of request.callbacks)
            callback(streamable);
    }
}
