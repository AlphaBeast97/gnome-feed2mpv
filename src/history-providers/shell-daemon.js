import Gio from 'gi://Gio';

import {urlFromText, videoFromUrl} from '../clipboard-utils.js';

const BUS_NAME = 'io.github.zickrian.isle.Daemon';
const OBJECT_PATH = '/io/github/zickrian/isle/Daemon';
const SCAN_LIMIT = 30;
const RESULT_LIMIT = 5;
const PROXY_XML = `<node><interface name="io.github.zickrian.isle.Clipboard1">
    <method name="GetText"><arg name="id" type="t" direction="in"/><arg type="s" direction="out"/></method>
    <property name="Items" type="s" access="read"/>
</interface></node>`;

export function itemTime(item) {
    return Number(item.at ?? item.at_ms ?? 0);
}

export function parseItems(serialized) {
    try {
        const items = JSON.parse(serialized ?? '[]');
        if (!Array.isArray(items))
            return [];
        return items.filter(item =>
            item && (item.kind === 'link' || item.kind === 'text') && item.id !== undefined &&
            urlFromText(item.preview))
            .sort((left, right) => itemTime(right) - itemTime(left))
            .slice(0, SCAN_LIMIT);
    } catch (_) {
        return [];
    }
}

export class ShellHistoryProvider {
    constructor() {
        this._destroyed = false;
        this._proxy = null;
        this._generation = 0;
        const Proxy = Gio.DBusProxy.makeProxyWrapper(PROXY_XML);
        new Proxy(Gio.DBus.session, BUS_NAME, OBJECT_PATH, (proxy, error) => {
            if (!this._destroyed && !error)
                this._proxy = proxy;
        });
    }

    refresh(callback) {
        const generation = ++this._generation;
        if (this._destroyed || !this._proxy) {
            callback([]);
            return;
        }

        const items = parseItems(this._proxy.Items);
        const videos = [];
        const seen = new Set();
        const readNext = index => {
            if (this._destroyed || generation !== this._generation)
                return;
            if (index >= items.length || videos.length >= RESULT_LIMIT) {
                callback(videos);
                return;
            }

            const item = items[index];
            const previewUrl = urlFromText(item.preview);
            this._proxy.GetTextRemote(item.id, (result, error) => {
                if (this._destroyed || generation !== this._generation)
                    return;
                const url = error ? previewUrl : urlFromText(result?.[0]) ?? previewUrl;
                if (url && !seen.has(url)) {
                    const video = videoFromUrl(url, itemTime(item));
                    video.source = 'clipboard-history-provider';
                    seen.add(url);
                    videos.push(video);
                }
                readNext(index + 1);
            });
        };
        readNext(0);
    }

    destroy() {
        this._destroyed = true;
        this._generation++;
        this._proxy = null;
    }
}
