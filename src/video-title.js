import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {youtubeVideoId} from './clipboard-utils.js';

const FAILURE_TTL_SECONDS = 600;

export function parseOEmbedTitle(body) {
    try {
        const response = JSON.parse(body);
        return typeof response.title === 'string' && response.title.trim()
            ? response.title.trim()
            : null;
    } catch (_) {
        return null;
    }
}

export class VideoTitleResolver {
    constructor() {
        this._session = new Soup.Session();
        this._session.timeout = 8;
        this._cache = new Map();
        this._failures = new Map();
        this._pending = new Map();
    }

    resolve(url, callback) {
        const id = youtubeVideoId(url);
        if (!id)
            return;
        if (this._cache.has(id)) {
            callback(this._cache.get(id));
            return;
        }
        const failedAt = this._failures.get(id);
        if (failedAt && Date.now() - failedAt < FAILURE_TTL_SECONDS * 1000) {
            callback(null);
            return;
        }
        if (this._pending.has(id)) {
            this._pending.get(id).callbacks.push(callback);
            return;
        }

        const requestUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
            `https://www.youtube.com/watch?v=${id}`)}&format=json`;
        const request = Soup.Message.new('GET', requestUrl);
        const cancellable = new Gio.Cancellable();
        const pending = {callbacks: [callback], cancellable};
        this._pending.set(id, pending);
        this._session.send_and_read_async(
            request,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (session, result) => {
                let title = null;
                try {
                    const bytes = session.send_and_read_finish(result);
                    if (request.get_status() === Soup.Status.OK)
                        title = parseOEmbedTitle(new TextDecoder().decode(bytes.get_data()));
                } catch (_) {
                }

                const current = this._pending.get(id);
                this._pending.delete(id);
                if (!current)
                    return;
                if (title)
                    this._cache.set(id, title);
                else
                    this._failures.set(id, Date.now());
                for (const done of current.callbacks)
                    done(title);
            });
    }

    destroy() {
        for (const {cancellable} of this._pending.values())
            cancellable.cancel();
        this._pending.clear();
        this._cache.clear();
        this._failures.clear();
        this._session.abort();
        this._session = null;
    }
}
