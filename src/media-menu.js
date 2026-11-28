import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {menuTitle, videoKey} from './menu-utils.js';

export class MediaMenu {
    constructor(uuid, name, playerName, actions) {
        this._name = name;
        this._playerName = playerName;
        this._actions = actions;
        this._model = null;
        this._menuOpen = false;
        this._menuDirty = false;
        this._menuSignature = '';
        this._statusItem = null;
        this._indicator = new PanelMenu.Button(0.0, name, false);
        this._icon = new St.Icon({
            icon_name: 'media-playback-stop-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(this._icon);
        this._indicator.accessible_name = name;
        Main.panel.addToStatusArea(uuid, this._indicator);
        this._menuSignal = this._indicator.menu.connect('open-state-changed', (_menu, isOpen) => {
            this._menuOpen = isOpen;
            if (isOpen)
                this._actions.refreshClipboardHistory();
        });
        this._menuClosedSignal = this._indicator.menu.connect('menu-closed', () => {
            if (this._menuDirty)
                this._buildMenu();
        });
    }

    render(model) {
        this._model = model;
        const state = this._state();
        const status = this._statusText(state);
        const icons = {
            searching: 'view-refresh-symbolic',
            empty: 'media-playback-stop-symbolic',
            ready: 'media-playback-start-symbolic',
            'browser-playing': 'media-playback-start-symbolic',
            loading: 'view-refresh-symbolic',
            playing: 'media-playback-start-symbolic',
            paused: 'media-playback-pause-symbolic',
        };
        this._icon.icon_name = icons[state];
        this._indicator.accessible_name = `${this._name}: ${status}`;

        const signature = JSON.stringify({
            state,
            selected: videoKey(model.selectedVideo),
            videos: model.videos.map(video => [video.busName, video.url, video.title, video.status]),
            clipboardItems: model.clipboardItems.map(video => [video.url, video.title]),
        });
        if (signature !== this._menuSignature) {
            this._menuSignature = signature;
            if (this._menuOpen) {
                this._menuDirty = true;
                if (this._statusItem)
                    this._statusItem.label.set_text(status);
            } else {
                this._buildMenu();
            }
        } else if (this._statusItem) {
            this._statusItem.label.set_text(status);
        }
    }

    destroy() {
        const indicator = this._indicator;
        indicator.menu.disconnect(this._menuSignal);
        indicator.menu.disconnect(this._menuClosedSignal);
        this._icon.destroy();
        indicator.menu.removeAll();
        indicator.destroy();
        this._indicator = null;
        this._icon = null;
        this._statusItem = null;
        this._model = null;
        this._actions = null;
        this._playerName = null;
        this._name = null;
    }

    _state() {
        const model = this._model;
        if (model.mpvState === 'loading' || model.mpvState === 'playing' || model.mpvState === 'paused')
            return model.mpvState;
        if (!model.scanComplete)
            return 'searching';
        if (model.videos.filter(video => video.current).length === 0)
            return 'empty';
        if (model.selectedVideo?.current && model.selectedVideo.status === 'Playing')
            return 'browser-playing';
        return 'ready';
    }

    _statusText(state) {
        const model = this._model;
        const title = model.mpvTitle ?? model.selectedVideo?.title ?? 'media';
        if (state === 'searching')
            return 'Searching for browser media…';
        if (state === 'empty')
            return 'Nothing detected';
        if (state === 'loading')
            return `MPV is loading ${menuTitle(title)}…`;
        if (state === 'playing')
            return `MPV is playing ${menuTitle(title)}`;
        if (state === 'paused')
            return `MPV is paused on ${menuTitle(title)}`;
        if (state === 'browser-playing')
            return `Playing in ${this._playerName(model.selectedVideo.busName)}`;
        const count = model.videos.filter(video => video.current).length;
        return `${count} item${count === 1 ? '' : 's'} ready`;
    }

    _buildMenu() {
        const model = this._model;
        this._menuDirty = false;
        this._indicator.menu.removeAll();
        this._statusItem = new PopupMenu.PopupMenuItem(this._statusText(this._state()));
        this._statusItem.setSensitive(false);
        this._indicator.menu.addMenuItem(this._statusItem);

        if (model.videos.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(model.scanComplete
                ? 'No browser media detected'
                : 'Searching for browser media…');
            empty.setSensitive(false);
            this._indicator.menu.addMenuItem(empty);
        } else {
            const current = model.videos.filter(video => video.current);
            const recent = model.videos.filter(video => !video.current);
            if (current.length > 0) {
                this._addHeading('Detected Browser Media');
                for (const video of current)
                    this._addVideo(video, video.status === 'Playing' ? 'Playing' : 'Available');
            }
            if (recent.length > 0) {
                this._addHeading('Recently Seen');
                for (const video of recent.slice(0, 5))
                    this._addVideo(video, 'Recent');
            }
        }

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._addAction('Open Selected in MPV', () => this._actions.selectedAction('play'));
        this._addAction('Open Selected Audio Only', () => this._actions.selectedAction('audio'));
        this._addAction('Open Current Clipboard URL', () => this._actions.clipboardAction());

        if (model.mpvState === 'playing' || model.mpvState === 'paused') {
            this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._addAction(model.mpvState === 'paused' ? 'Resume MPV' : 'Pause MPV',
                () => this._actions.togglePause());
            this._addAction('Stop MPV', () => this._actions.stopPlayback());
        } else if (model.mpvState === 'loading') {
            this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._addAction('Stop MPV', () => this._actions.stopPlayback());
        }

        this._addHeading('Recent Clipboard URLs');
        if (model.clipboardItems.length === 0) {
            const history = new PopupMenu.PopupMenuItem('No recent copied media links');
            history.setSensitive(false);
            this._indicator.menu.addMenuItem(history);
        } else {
            for (const video of model.clipboardItems) {
                const item = new PopupMenu.PopupMenuItem(
                    `${menuTitle(video.title)}  ·  Clipboard history`);
                item.accessible_name = `${video.title}, clipboard history`;
                item.connect('activate', () => this._actions.play(video));
                this._indicator.menu.addMenuItem(item);
            }
        }
    }

    _addHeading(label) {
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const heading = new PopupMenu.PopupMenuItem(label);
        heading.setSensitive(false);
        this._indicator.menu.addMenuItem(heading);
    }

    _addVideo(video, availability) {
        const player = this._playerName(video.busName);
        const row = new PopupMenu.PopupMenuItem(
            `${menuTitle(video.title)}  ·  ${player}  ·  ${availability}`);
        row.accessible_name = `${video.title}, ${player}, ${availability}`;
        row.connect('activate', () => this._actions.selectVideo(video));
        this._indicator.menu.addMenuItem(row);
    }

    _addAction(label, callback) {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', callback);
        this._indicator.menu.addMenuItem(item);
    }
}
