import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ClipboardHistory, readClipboardUrl} from './src/clipboard-history.js';
import {MediaMenu} from './src/media-menu.js';
import {MprisMonitor} from './src/mpris.js';
import {MpvIpcMonitor} from './src/mpv-ipc.js';
import {openInMpv} from './src/player.js';
import {VideoTitleResolver} from './src/video-title.js';
import {menuTitle, videoKey} from './src/menu-utils.js';

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
    _clipboardReadGeneration = 0;

    enable() {
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
        this._lifetime = new Gio.Cancellable();
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
        this._menu = new MediaMenu(this.uuid, this.metadata.name,
            busName => this._playerName(busName), {
                refreshClipboardHistory: () => this._refreshClipboardHistory(true),
                selectedAction: action => this._selectedAction(action),
                clipboardAction: () => this._openClipboard(video => this._playVideo(video)),
                togglePause: () => this._mpvMonitor.togglePause(),
                stopPlayback: () => this._mpvMonitor.stopPlayback(),
                play: video => this._playVideo(video),
                selectVideo: video => this._selectVideo(video),
            });

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

        this._refreshClipboardHistory(false);
        this._mpvMonitor.start();
        this._monitor.start();
        this._updateUi();
    }

    disable() {
        this._clipboardReadGeneration++;
        this._lifetime.cancel();
        this._clearPlaybackErrorTimer();
        this._monitor.destroy();
        this._mpvMonitor.destroy();
        this._clipboardHistory.destroy();
        this._videoTitleResolver.destroy();
        this._menu.destroy();
        this._monitor = null;
        this._mpvMonitor = null;
        this._clipboardHistory = null;
        this._videoTitleResolver = null;
        this._menu = null;
        this._lifetime = null;
        this._clipboard = null;
        this._videos = [];
        this._clipboardItems = [];
        this._selectedVideo = null;
        this._mpvTitle = null;
        this._pendingPlaybackError = '';
        this._playbackStarted = false;
        this._lastPlaybackErrorAt = 0;
    }

    _selectedAction(action) {
        const handlers = {
            play: video => this._playVideo(video),
            audio: video => this._playVideo(video, {audioOnly: true}),
        };
        const handler = handlers[action];
        this._withSelectedVideo(handler, () => this._openClipboard(handler));
    }

    _selectVideo(video) {
        this._selectedVideo = video;
        this._withSelectedVideo(selected => this._playVideo(selected),
            () => this._playVideo(video));
    }

    _withSelectedVideo(onSelected, onClipboard) {
        const selected = this._selectedVideo;
        if (!selected) {
            onClipboard();
            return;
        }
        this._monitor.refresh(selected.busName, refreshed => {
            onSelected(refreshed?.url === selected.url ? refreshed : selected);
        });
    }

    _playVideo(video, options = {}) {
        this._clearPlaybackErrorTimer();
        this._lastPlaybackErrorAt = 0;
        this._playbackStarted = false;
        this._mpvTitle = video.title;
        this._mpvMonitor.expectLoad();
        if (!openInMpv(video, options, detail => this._onMpvLaunchFailure(detail), this._lifetime)) {
            this._mpvMonitor.cancelLoad();
            this._mpvTitle = null;
            Main.notify(this.metadata.name, 'Could not start MPV. Make sure mpv is installed and available on PATH.');
        }
    }

    _handleMpvPlaybackError(detail, source) {
        if (source !== 'launch' || this._playbackStarted) {
            this._notifyPlaybackError(detail);
            return;
        }
        if (this._lastPlaybackErrorAt)
            return;
        this._schedulePlaybackError(detail);
    }

    _onMpvLaunchFailure(detail) {
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
        this._lastPlaybackErrorAt = GLib.get_monotonic_time();
        const title = this._mpvTitle && this._mpvTitle !== 'Clipboard video'
            ? menuTitle(this._mpvTitle)
            : 'this link';
        this._mpvTitle = null;
        this._mpvMonitor.cancelLoad();
        this._updateUi();
        const reason = detail && detail !== 'loading failed'
            ? detail
            : 'the site may block playback, the link may be broken, or yt-dlp may not support it';
        Main.notify(this.metadata.name, `MPV could not play ${title}: ${reason}`);
    }

    _openClipboard(onVideo) {
        const generation = this._clipboardReadGeneration;
        readClipboardUrl(this._clipboard, video => {
            if (generation !== this._clipboardReadGeneration)
                return;
            if (video)
                onVideo(video);
            else
                Main.notify(this.metadata.name, 'The clipboard does not contain a valid HTTP(S) URL.');
        });
    }

    _refreshClipboardHistory(resolveMissingTitles = false) {
        this._clipboardHistory.refresh(videos => {
            this._clipboardItems = videos;
            this._enrichClipboardTitles(resolveMissingTitles);
            this._updateUi();
        });
    }

    _onVideosChanged(videos) {
        const selectedKey = this._videoKey(this._selectedVideo);
        this._videos = videos;
        const playing = videos.find(video => video.current && video.status === 'Playing');
        this._selectedVideo = playing
            ?? videos.find(video => this._videoKey(video) === selectedKey)
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
        return videoKey(video);
    }

    _playerName(busName) {
        const id = busName.replace(/^org\.mpris\.MediaPlayer2\./, '').split(/[._]/)[0].toLowerCase();
        return PLAYER_NAMES[id] ?? (id || 'Browser');
    }

    _updateUi() {
        this._menu.render({
            videos: this._videos,
            selectedVideo: this._selectedVideo,
            clipboardItems: this._clipboardItems,
            scanComplete: this._scanComplete,
            mpvState: this._mpvState,
            mpvTitle: this._mpvTitle,
        });
    }
}
