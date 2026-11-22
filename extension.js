import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {ClipboardHistory} from './src/clipboard-history.js';
import {MprisMonitor} from './src/mpris.js';
import {MpvIpcMonitor} from './src/mpv-ipc.js';
import {openInMpv, queueInMpv, readClipboardUrl} from './src/player.js';
import {VideoTitleResolver} from './src/video-title.js';
import {menuTitle} from './src/menu-utils.js';

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
export default class Feed2MpvExtension extends Extension {
    enable() {
        this._destroyed = false;
        this._menuOpen = false;
        this._menuDirty = false;
        this._videos = [];
        this._selectedVideo = null;
        this._clipboardItems = [];
        this._scanComplete = false;
        this._mpvState = 'idle';
        this._mpvTitle = null;
        this._playbackStarted = false;
        this._loadErrorTimer = 0;
        this._pendingPlaybackError = '';
        this._lastPlaybackErrorAt = 0;
        this._menuSignature = '';
        // Reading copied links is the main feature: St.Clipboard supplies the
        // clipboard text, and ClipboardHistory watches Meta.Selection's
        // owner-changed signal to know when to read it. Access is read-only
        // and happens only on selection changes and explicit menu actions.
        // Copied YouTube links may be sent to YouTube's oEmbed endpoint for a
        // title when the menu opens; nothing else from the clipboard is sent.
        this._clipboard = St.Clipboard.get_default();
        this._videoTitleResolver = new VideoTitleResolver();
        this._clipboardHistory = new ClipboardHistory(
            this._clipboard,
            videos => {
                this._clipboardItems = videos;
                this._enrichClipboardTitles();
                this._updateUi();
            });
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._icon = new St.Icon({
            icon_name: 'media-playback-stop-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(this._icon);
        this._indicator.accessible_name = this.metadata.name;
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._mpvMonitor = new MpvIpcMonitor(state => {
            this._mpvState = state;
            if (state === 'playing')
                this._playbackStarted = true;
            this._updateUi();
        }, (detail, source) => this._handleMpvPlaybackError(detail, source));
        this._monitor = new MprisMonitor(
            videos => this._onVideosChanged(videos),
            () => {
                this._scanComplete = true;
                this._updateUi();
            });
        this._menuSignal = this._indicator.menu.connect('open-state-changed', (_menu, isOpen) => {
            this._menuOpen = isOpen;
            if (isOpen)
                this._refreshClipboardHistory();
        });
        this._menuClosedSignal = this._indicator.menu.connect('menu-closed', () => {
            if (this._menuDirty)
                this._buildMenu();
        });

        this._buildMenu();
        this._refreshClipboardHistory();
        this._mpvMonitor.start();
        this._monitor.start();
        this._updateUi();
    }

    disable() {
        this._destroyed = true;
        this._clearPlaybackErrorTimer();
        this._monitor?.destroy();
        this._mpvMonitor?.destroy();
        this._clipboardHistory?.destroy();
        this._videoTitleResolver?.destroy();
        if (this._indicator) {
            if (this._menuSignal)
                this._indicator.menu.disconnect(this._menuSignal);
            if (this._menuClosedSignal)
                this._indicator.menu.disconnect(this._menuClosedSignal);
            this._icon?.destroy();
            this._icon = null;
            this._statusItem?.destroy();
            this._statusItem = null;
            this._indicator.menu.removeAll();
            this._indicator.destroy();
        }
        this._monitor = null;
        this._mpvMonitor = null;
        this._clipboardHistory = null;
        this._videoTitleResolver = null;
        this._indicator = null;
        this._clipboard = null;
        this._videos = [];
        this._clipboardItems = [];
        this._selectedVideo = null;
        this._menuSignal = 0;
        this._menuClosedSignal = 0;
        this._menuOpen = false;
        this._menuDirty = false;
        this._menuSignature = '';
        this._playbackStarted = false;
        this._lastPlaybackErrorAt = 0;
    }

    _buildMenu() {
        if (!this._indicator)
            return;
        this._menuDirty = false;
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
            const current = this._videos.filter(video => video.current);
            const recent = this._videos.filter(video => !video.current);
            if (current.length > 0) {
                this._addHeading('Detected Browser Media');
                for (const video of current)
                    this._addVideo(video, video.status === 'Playing' ? 'Playing' : 'Available');
            }
            if (recent.length > 0) {
                this._addHeading('Recently Seen');
                for (const video of recent)
                    this._addVideo(video, 'Recent');
            }
        }

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._addAction('Open Selected in MPV', () => this._withSelectedVideo(
            video => this._playVideo(video),
            () => this._openClipboard(video => this._playVideo(video))));
        this._addAction('Queue Selected in Running MPV', () => this._withSelectedVideo(
            video => this._queueVideo(video),
            () => this._openClipboard(video => this._queueVideo(video))));
        this._addAction('Open Selected Audio Only', () => this._withSelectedVideo(
            video => this._playVideo(video, {audioOnly: true}),
            () => this._openClipboard(video => this._playVideo(video, {audioOnly: true}))));
        this._addAction('Open Current Clipboard URL', () => this._openClipboard(
            video => this._playVideo(video)));

        if (this._mpvState === 'playing' || this._mpvState === 'paused') {
            this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._addAction(this._mpvState === 'paused' ? 'Resume MPV' : 'Pause MPV',
                () => this._mpvMonitor.togglePause());
            this._addAction('Stop MPV', () => this._mpvMonitor.stopPlayback());
        } else if (this._mpvState === 'loading') {
            this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._addAction('Stop MPV', () => this._mpvMonitor.stopPlayback());
        }

        this._addHeading('Recent Clipboard URLs');
        if (this._clipboardItems.length === 0) {
            const history = new PopupMenu.PopupMenuItem(
                'No recent copied media links');
            history.setSensitive(false);
            this._indicator.menu.addMenuItem(history);
        } else {
            for (const video of this._clipboardItems) {
                const item = new PopupMenu.PopupMenuItem(
                    `${menuTitle(video.title)}  ·  Clipboard history`);
                item.accessible_name = `${video.title}, clipboard history`;
                item.connect('activate', () => this._playVideo(video));
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
        const playing = video.current && video.status === 'Playing' && availability !== 'Playing'
            ? '  ·  Playing'
            : '';
        const row = new PopupMenu.PopupMenuItem(
            `${menuTitle(video.title)}  ·  ${this._playerName(video.busName)}  ·  ${availability}${playing}`);
        row.accessible_name = `${video.title}, ${this._playerName(video.busName)}, ${availability}`;
        row.connect('activate', () => {
            this._selectedVideo = video;
            this._withSelectedVideo(selected => this._playVideo(selected),
                () => this._playVideo(video));
        });
        this._indicator.menu.addMenuItem(row);
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
            if (this._destroyed)
                return;
            onSelected(refreshed?.url === selected.url ? refreshed : selected);
        });
    }

    _playVideo(video, options = {}) {
        if (this._destroyed || !this._mpvMonitor)
            return;
        this._clearPlaybackErrorTimer();
        this._lastPlaybackErrorAt = 0;
        this._playbackStarted = false;
        this._mpvTitle = video.title;
        this._mpvMonitor.expectLoad();
        if (!openInMpv(video, options, detail => this._onMpvLaunchFailure(detail))) {
            this._mpvMonitor.cancelLoad();
            this._mpvTitle = null;
            Main.notify(this.metadata.name, 'Could not start MPV. Make sure mpv is installed and available on PATH.');
        }
    }

    _queueVideo(video) {
        if (this._destroyed || !this._mpvMonitor)
            return;
        this._clearPlaybackErrorTimer();
        this._lastPlaybackErrorAt = 0;
        this._mpvTitle = video.title;
        this._mpvMonitor.expectLoad('queue');
        queueInMpv(video, () => this._playVideo(video));
    }

    _handleMpvPlaybackError(detail, source) {
        if (this._destroyed)
            return;
        if (source !== 'launch' || this._playbackStarted) {
            this._notifyPlaybackError(detail);
            return;
        }
        if (this._lastPlaybackErrorAt)
            return;
        this._schedulePlaybackError(detail);
    }

    _onMpvLaunchFailure(detail) {
        if (this._destroyed)
            return;
        this._clearPlaybackErrorTimer();
        if (this._playbackStarted)
            return;
        this._notifyPlaybackError(detail);
    }

    _schedulePlaybackError(detail) {
        this._clearPlaybackErrorTimer();
        this._pendingPlaybackError = detail;
        this._loadErrorTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._loadErrorTimer = 0;
            this._notifyPlaybackError(this._pendingPlaybackError);
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearPlaybackErrorTimer() {
        if (this._loadErrorTimer)
            GLib.Source.remove(this._loadErrorTimer);
        this._loadErrorTimer = 0;
        this._pendingPlaybackError = '';
    }

    _notifyPlaybackError(detail) {
        if (this._destroyed)
            return;
        this._lastPlaybackErrorAt = GLib.get_monotonic_time();
        const title = this._mpvTitle && this._mpvTitle !== 'Clipboard video'
            ? menuTitle(this._mpvTitle)
            : 'this link';
        this._mpvTitle = null;
        this._mpvMonitor?.cancelLoad();
        this._updateUi();
        const reason = detail && detail !== 'loading failed'
            ? detail
            : 'the site may block playback, the link may be broken, or yt-dlp may not support it';
        Main.notify(this.metadata.name, `MPV could not play ${title}: ${reason}`);
    }

    _openClipboard(onVideo) {
        if (this._destroyed || !this._clipboard)
            return;
        readClipboardUrl(this._clipboard, video => {
            if (this._destroyed)
                return;
            if (video)
                onVideo(video);
            else
                Main.notify(this.metadata.name, 'The clipboard does not contain a valid HTTP(S) URL.');
        });
    }

    _refreshClipboardHistory() {
        if (this._destroyed || !this._clipboardHistory)
            return;
        this._clipboardHistory.refresh(videos => {
            if (this._destroyed)
                return;
            this._clipboardItems = videos;
            this._enrichClipboardTitles(true);
            this._updateUi();
        });
    }

    _onVideosChanged(videos) {
        if (this._destroyed)
            return;
        const selectedKey = this._videoKey(this._selectedVideo);
        this._videos = videos;
        this._selectedVideo = videos.find(video => this._videoKey(video) === selectedKey)
            ?? videos[0]
            ?? null;
        this._enrichClipboardTitles();
        this._updateUi();
    }

    _enrichClipboardTitles(resolveMissingTitles = false) {
        for (const item of this._clipboardItems) {
            const media = this._videos.find(video => video.url === item.url &&
                video.title && video.title !== 'Browser media');
            if (media) {
                item.title = media.title;
                item.titleSource = 'mpris';
                continue;
            }
            if (!resolveMissingTitles || item.titleSource === 'oembed')
                continue;
            this._videoTitleResolver.resolve(item.url, title => {
                if (this._destroyed)
                    return;
                const current = this._clipboardItems.find(video => video.url === item.url);
                if (!current || !title)
                    return;
                current.title = title;
                current.titleSource = 'oembed';
                this._updateUi();
            });
        }
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
        const currentCount = this._videos.filter(video => video.current).length;
        if (currentCount === 0)
            return 'empty';
        if (this._selectedVideo?.current && this._selectedVideo.status === 'Playing')
            return 'browser-playing';
        return 'ready';
    }

    _statusText() {
        const title = this._mpvTitle ?? this._selectedVideo?.title ?? 'media';
        const state = this._state();
        if (state === 'searching')
            return 'Searching for browser media…';
        if (state === 'empty')
            return 'Nothing detected';
        if (state === 'loading')
            return `MPV is loading ${title}…`;
        if (state === 'playing')
            return `MPV is playing ${title}`;
        if (state === 'paused')
            return `MPV is paused on ${title}`;
        if (state === 'browser-playing')
            return `Playing in ${this._playerName(this._selectedVideo.busName)}`;
        const count = this._videos.filter(video => video.current).length;
        return `${count} item${count === 1 ? '' : 's'} ready`;
    }

    _updateUi() {
        if (!this._indicator)
            return;
        const state = this._state();
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
        this._indicator.accessible_name = `${this.metadata.name}: ${this._statusText()}`;

        const signature = JSON.stringify({
            state,
            selected: this._videoKey(this._selectedVideo),
            videos: this._videos.map(video => [video.busName, video.url, video.title, video.status]),
            clipboardItems: this._clipboardItems.map(video => [video.url, video.title]),
        });
        if (signature !== this._menuSignature) {
            this._menuSignature = signature;
            if (this._menuOpen) {
                this._menuDirty = true;
                this._statusItem?.label.set_text(this._statusText());
            } else {
                this._buildMenu();
            }
        } else {
            this._statusItem?.label.set_text(this._statusText());
        }
    }
}
