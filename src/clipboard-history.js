import Meta from 'gi://Meta';
import St from 'gi://St';

import {ShellHistoryProvider} from './history-providers/shell-daemon.js';
import {isStreamableUrl, urlFromText, videoFromUrl} from './clipboard-utils.js';

const HISTORY_LIMIT = 5;

export class ClipboardHistory {
    constructor(clipboard, onChanged) {
        this._clipboard = clipboard;
        this._onChanged = onChanged;
        this._items = [];
        this._destroyed = false;
        this._captureGeneration = 0;
        this._selection = global.display.get_selection();
        this._ownerChanged = this._selection.connect('owner-changed', (_selection, type) => {
            if (!this._destroyed && type === Meta.SelectionType.SELECTION_CLIPBOARD)
                this._captureClipboard();
        });
        this._provider = new ShellHistoryProvider();
    }

    _captureClipboard() {
        if (this._destroyed)
            return;
        const generation = ++this._captureGeneration;
        this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
            if (this._destroyed || generation !== this._captureGeneration)
                return;
            const url = urlFromText(text);
            if (!url || !isStreamableUrl(url))
                return;
            const existing = this._items.find(item => item.url === url);
            const video = videoFromUrl(url);
            if (existing?.titleSource === 'mpris' || existing?.titleSource === 'oembed') {
                video.title = existing.title;
                video.titleSource = existing.titleSource;
            }
            this._items = [video, ...this._items.filter(item => item.url !== url)]
                .slice(0, HISTORY_LIMIT);
            this._onChanged(this._items.map(item => ({...item})));
        });
    }

    refresh(callback) {
        this._provider.refresh(previous => {
            if (this._destroyed)
                return;
            const merged = new Map();
            for (const item of [...this._items, ...previous]) {
                const old = merged.get(item.url);
                if (!old || Number(item.copiedAt) > Number(old.copiedAt))
                    merged.set(item.url, item);
            }
            const items = [...merged.values()]
                .sort((left, right) => Number(right.copiedAt) - Number(left.copiedAt))
                .slice(0, HISTORY_LIMIT);
            for (const item of items) {
                const local = this._items.find(other => other.url === item.url);
                if (local && local.titleSource !== 'fallback') {
                    item.title = local.title;
                    item.titleSource = local.titleSource;
                }
            }
            this._items = items;
            callback(this._items.map(item => ({...item})));
        });
    }

    destroy() {
        this._destroyed = true;
        this._captureGeneration++;
        this._selection.disconnect(this._ownerChanged);
        this._selection = null;
        this._ownerChanged = 0;
        this._provider.destroy();
        this._provider = null;
        this._clipboard = null;
        this._onChanged = null;
        this._items = [];
    }
}
