import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {mediaUrl} from './mpris.js';

const HISTORY_LIMIT = 5;
const HISTORY_SCAN_LIMIT = 50;

function runCommand(argv, input, cancellable, callback) {
    let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE;
    if (input !== null)
        flags |= Gio.SubprocessFlags.STDIN_PIPE;

    let process;
    try {
        process = Gio.Subprocess.new(argv, flags);
    } catch (_) {
        callback(null);
        return;
    }

    process.communicate_utf8_async(input, cancellable, (subprocess, result) => {
        try {
            const [communicated, stdout] = subprocess.communicate_utf8_finish(result);
            callback(communicated && subprocess.get_successful() ? stdout : null);
        } catch (_) {
            callback(null);
        }
    });
}

export function parseCliphistRows(output) {
    if (!output)
        return [];
    return output.split(/\r?\n/).filter(Boolean).slice(0, HISTORY_SCAN_LIMIT).flatMap(line => {
        const separator = line.indexOf('\t');
        if (separator <= 0)
            return [];
        const preview = line.slice(separator + 1).trim();
        if (!/^https?:\/\//i.test(preview))
            return [];
        return [{id: line.slice(0, separator), line}];
    });
}

function videoFromHistory(text, id) {
    const url = mediaUrl(text?.trim());
    if (!url)
        return null;
    try {
        const parsed = GLib.Uri.parse(url, GLib.UriFlags.NONE);
        return {
            url,
            title: parsed.get_host() ?? 'Clipboard URL',
            position: 0,
            status: 'Stopped',
            source: 'clipboard-history',
            historyId: id,
        };
    } catch (_) {
        return null;
    }
}

export class ClipboardHistory {
    constructor() {
        this._generation = 0;
        this._cancellable = null;
    }

    refresh(callback) {
        this._cancellable?.cancel();
        this._cancellable = new Gio.Cancellable();
        const generation = ++this._generation;
        const cancellable = this._cancellable;
        runCommand(['cliphist', 'list'], null, cancellable, output => {
            if (generation !== this._generation)
                return;
            const rows = parseCliphistRows(output);
            const videos = [];
            const seen = new Set();
            const decodeNext = index => {
                if (generation !== this._generation)
                    return;
                if (index >= rows.length || videos.length >= HISTORY_LIMIT) {
                    callback(videos);
                    return;
                }
                const row = rows[index];
                runCommand(['cliphist', 'decode'], `${row.line}\n`, cancellable, decoded => {
                    const video = videoFromHistory(decoded, row.id);
                    if (video && !seen.has(video.url)) {
                        seen.add(video.url);
                        videos.push(video);
                    }
                    decodeNext(index + 1);
                });
            };
            decodeNext(0);
        });
    }

    destroy() {
        this._generation++;
        this._cancellable?.cancel();
        this._cancellable = null;
    }
}
