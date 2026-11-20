import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {mediaUrl} from './mpris.js';

const ISLE_BUS_NAME = 'io.github.zickrian.isle.Daemon';
const ISLE_OBJECT_PATH = '/io/github/zickrian/isle/Daemon';
const HISTORY_LIMIT = 5;
const HISTORY_SCAN_LIMIT = 30;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const ISLE_CLIPBOARD_XML = `<node><interface name="io.github.zickrian.isle.Clipboard1">
    <method name="GetText"><arg name="id" type="t" direction="in"/><arg type="s" direction="out"/></method>
    <property name="Items" type="s" access="read"/>
</interface></node>`;

function extractUrl(text) {
    const match = String(text ?? '').match(URL_PATTERN);
    if (!match)
        return null;
    return mediaUrl(match[0].replace(/[),.;!?\]}]+$/, ''));
}

function videoFromHistory(url, id) {
    try {
        const parsed = GLib.Uri.parse(url, GLib.UriFlags.NONE);
        return {
            url,
            title: parsed.get_host() ?? 'Clipboard URL',
            position: 0,
            status: 'Stopped',
            source: 'isle-clipboard-history',
            historyId: id,
        };
    } catch (_) {
        return null;
    }
}

export function parseIsleItems(serialized) {
    try {
        const items = JSON.parse(serialized ?? '[]');
        if (!Array.isArray(items))
            return [];
        return items.filter(item =>
            item && (item.kind === 'link' || item.kind === 'text') && item.id !== undefined &&
            extractUrl(item.preview))
            .sort((left, right) => Number(right.at_ms ?? 0) - Number(left.at_ms ?? 0))
            .slice(0, HISTORY_SCAN_LIMIT);
    } catch (_) {
        return [];
    }
}

export class ClipboardHistory {
    constructor() {
        this._destroyed = false;
        this._proxy = null;
        this._generation = 0;
        const Proxy = Gio.DBusProxy.makeProxyWrapper(ISLE_CLIPBOARD_XML);
        new Proxy(Gio.DBus.session, ISLE_BUS_NAME, ISLE_OBJECT_PATH, (proxy, error) => {
            if (this._destroyed || error)
                return;
            this._proxy = proxy;
        });
    }

    refresh(callback) {
        const generation = ++this._generation;
        if (this._destroyed || !this._proxy) {
            callback([]);
            return;
        }

        const items = parseIsleItems(this._proxy.Items);
        const videos = [];
        const seen = new Set();
        const decodeNext = index => {
            if (this._destroyed || generation !== this._generation)
                return;
            if (index >= items.length || videos.length >= HISTORY_LIMIT) {
                callback(videos);
                return;
            }

            const item = items[index];
            const addUrl = url => {
                const video = videoFromHistory(url, item.id);
                if (video && !seen.has(video.url)) {
                    seen.add(video.url);
                    videos.push(video);
                }
                decodeNext(index + 1);
            };

            const previewUrl = extractUrl(item.preview);
            this._proxy.GetTextRemote(item.id, (result, error) => {
                if (this._destroyed || generation !== this._generation)
                    return;
                addUrl(error ? previewUrl : extractUrl(result?.[0]) ?? previewUrl);
            });
        };
        decodeNext(0);
    }

    destroy() {
        this._destroyed = true;
        this._generation++;
        this._proxy = null;
    }
}
