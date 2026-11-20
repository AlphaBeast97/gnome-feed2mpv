import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {MprisMonitor} from './mpris.js';
import {MpvIpcMonitor} from './mpv-ipc.js';
import {openInMpv, queueInMpv, readClipboardUrl} from './player.js';

const PLAYER_NAMES = {
    brave: 'Brave',
    chrome: 'Chrome',
    chromium: 'Chromium',
    edge: 'Edge',
    epiphany: 'Epiphany',
    firefox: 'Firefox',
    floorp: 'Floorp',
    librewolf: 'LibreWolf',
    opera: 'Opera',
    vivaldi: 'Vivaldi',
    zen: 'Zen',
};

export default class YouTubeToMpvExtension extends Extension {
    enable() {
        this._videos = [];
        this._selectedVideo = null;
        this._scanComplete = false;
        this._mpvState = 'idle';
        this._menuSignature = '';
        this._clipboard = St.Clipboard.get_default();

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._icon = new St.Icon({
            icon_name: 'multimedia-player-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(this._icon);
        this._indicator.accessible_name = this.metadata.name;
        this._buttonSignal = this._indicator.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;
            this._openSelected();
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._buildMenu();
        this._mpvMonitor = new MpvIpcMonitor(state => {
            this._mpvState = state;
            this._updateUi();
        });
        this._monitor = new MprisMonitor(
            videos => this._onVideosChanged(videos),
            () => {
                this._scanComplete = true;
                this._updateUi();
            });
        this._mpvMonitor.start();
        this._monitor.start();
        this._updateUi();
    }

    disable() {
        this._monitor?.destroy();
        this._mpvMonitor?.destroy();
        this._monitor = null;
        this._mpvMonitor = null;
        if (this._indicator) {
            if (this._buttonSignal)
                this._indicator.disconnect(this._buttonSignal);
            this._indicator.menu.removeAll();
            this._indicator.destroy();
        }
        this._indicator = null;
        this._icon = null;
        this._statusItem = null;
        this._clipboard = null;
        this._videos = [];
        this._selectedVideo = null;
        this._buttonSignal = 0;
    }

    _buildMenu() {
        this._indicator.menu.removeAll();
        this._statusItem = new PopupMenu.PopupMenuItem(this._statusText());
        this._statusItem.setSensitive(false);
        this._indicator.menu.addMenuItem(this._statusItem);

        if (this._videos.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(
                this._scanComplete ? 'No browser media detected' : 'Searching for browser media…');
            empty.setSensitive(false);
            this._indicator.menu.addMenuItem(empty);
        } else {
            this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            for (const video of this._videos) {
                const row = new PopupMenu.PopupMenuItem(
                    `${video.title}  ·  ${this._playerName(video.busName)}${video.status === 'Playing' ? '  ·  Playing' : ''}`);
                row.tooltip_text = video.url;
                row.connect('activate', () => {
                    this._selectedVideo = video;
                    this._updateUi();
                    this._playVideo(video);
                });
                this._indicator.menu.addMenuItem(row);
            }
        }

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._addAction('Open Selected in MPV', () => this._withSelectedVideo(
            video => this._playVideo(video), video => this._openClipboard(video => this._playVideo(video))));
        this._addAction('Queue Selected in Running MPV', () => this._withSelectedVideo(
            video => this._queueVideo(video), video => this._openClipboard(video => this._queueVideo(video))));
        this._addAction('Open Selected Audio Only', () => this._withSelectedVideo(
            video => this._playVideo(video, {audioOnly: true}),
            video => this._openClipboard(video => this._playVideo(video, {audioOnly: true}))));
        this._addAction('Open Clipboard URL in MPV', () => this._openClipboard(video => this._playVideo(video)));
    }

    _addAction(label, callback) {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', callback);
        this._indicator.menu.addMenuItem(item);
    }

    _withSelectedVideo(onSelected, onClipboard) {
        const selected = this._selectedVideo;
        if (!selected) {
            onClipboard();
            return;
        }
        this._monitor.refresh(selected.busName, refreshed => {
            const video = refreshed?.url === selected.url ? refreshed : selected;
            onSelected(video);
        });
    }

    _openSelected() {
        this._withSelectedVideo(
            video => this._playVideo(video),
            () => this._openClipboard(video => this._playVideo(video)));
    }

    _playVideo(video, options = {}) {
        this._mpvMonitor.expectLoad();
        if (!openInMpv(video, options)) {
            this._mpvMonitor.cancelLoad();
            Main.notify(this.metadata.name, 'Could not start MPV. Make sure mpv is installed and available on PATH.');
        }
    }

    _queueVideo(video) {
        this._mpvMonitor.expectLoad();
        queueInMpv(
            video,
            () => this._playVideo(video),
            () => this._mpvMonitor.expectLoad());
    }

    _openClipboard(onVideo) {
        readClipboardUrl(this._clipboard, video => {
            if (video)
                onVideo(video);
            else
                Main.notify(this.metadata.name, 'The clipboard does not contain a valid HTTP(S) URL.');
        });
    }

    _onVideosChanged(videos) {
        const selectedKey = this._videoKey(this._selectedVideo);
        this._videos = videos;
        this._selectedVideo = videos.find(video => this._videoKey(video) === selectedKey)
            ?? videos[0]
            ?? null;
        this._updateUi();
    }

    _videoKey(video) {
        return video ? `${video.busName}\n${video.url}` : '';
    }

    _playerName(busName) {
        const id = busName.replace(/^org\.mpris\.MediaPlayer2\./, '').split(/[._]/)[0].toLowerCase();
        return PLAYER_NAMES[id] ?? (id || 'Browser');
    }

    _state() {
        if (this._mpvState === 'loading' || this._mpvState === 'playing' || this._mpvState === 'paused')
            return this._mpvState;
        if (!this._scanComplete)
            return 'searching';
        if (this._videos.length === 0)
            return 'empty';
        if (this._selectedVideo?.status === 'Playing')
            return 'browser-playing';
        return 'ready';
    }

    _statusText() {
        const state = this._state();
        if (state === 'searching')
            return 'Searching for browser media…';
        if (state === 'empty')
            return 'Nothing detected';
        if (state === 'loading')
            return `MPV is loading ${this._selectedVideo?.title ?? 'media'}…`;
        if (state === 'playing')
            return `MPV is playing ${this._selectedVideo?.title ?? 'media'}`;
        if (state === 'paused')
            return `MPV is paused on ${this._selectedVideo?.title ?? 'media'}`;
        if (state === 'browser-playing')
            return `Playing in ${this._playerName(this._selectedVideo.busName)}`;
        return `${this._videos.length} item${this._videos.length === 1 ? '' : 's'} ready`;
    }

    _updateUi() {
        if (!this._indicator)
            return;
        const state = this._state();
        const icons = {
            searching: 'view-refresh-symbolic',
            empty: 'multimedia-player-symbolic',
            ready: 'media-playback-start-symbolic',
            'browser-playing': 'media-playback-start-symbolic',
            loading: 'view-refresh-symbolic',
            playing: 'media-playback-start-symbolic',
            paused: 'media-playback-pause-symbolic',
        };
        const colors = {
            ready: '#e6a700',
            'browser-playing': '#4caf50',
            loading: '#e6a700',
            playing: '#4caf50',
            paused: '#8a8a8a',
        };
        this._icon.icon_name = icons[state];
        this._icon.set_style(colors[state] ? `color: ${colors[state]};` : null);
        this._indicator.accessible_name = `${this.metadata.name}: ${this._statusText()}`;

        const signature = JSON.stringify({
            state,
            selected: this._videoKey(this._selectedVideo),
            videos: this._videos.map(video => [video.busName, video.url, video.title, video.status]),
        });
        if (signature !== this._menuSignature) {
            this._menuSignature = signature;
            this._buildMenu();
        } else {
            this._statusItem.label.set_text(this._statusText());
        }
    }
}
