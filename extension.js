import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {MprisMonitor} from './mpris.js';
import {openInMpv, queueInMpv, readClipboardUrl} from './player.js';

export default class YouTubeToMpvExtension extends Extension {
    enable() {
        this._monitor = new MprisMonitor(video => {
            this._video = video;
            this._updateIndicator();
        });
        this._video = null;
        this._clipboard = St.Clipboard.get_default();
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._icon = new St.Icon({
            icon_name: 'media-playback-start-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(this._icon);
        this._indicator.accessible_name = this.metadata.name;
        this._buildMenu();
        this._buttonSignal = this._indicator.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;

            this._openCurrent();
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._monitor.start();
        this._updateIndicator();
    }

    disable() {
        this._monitor?.destroy();
        this._monitor = null;
        if (this._indicator) {
            if (this._buttonSignal)
                this._indicator.disconnect(this._buttonSignal);
            this._indicator.menu.removeAll();
            this._indicator.destroy();
        }
        this._indicator = null;
        this._icon = null;
        this._clipboard = null;
        this._video = null;
        this._buttonSignal = 0;
    }

    _buildMenu() {
        const open = new PopupMenu.PopupMenuItem('Open in MPV');
        open.connect('activate', () => this._openCurrent());
        this._indicator.menu.addMenuItem(open);

        const queue = new PopupMenu.PopupMenuItem('Queue in Running MPV');
        queue.connect('activate', () => {
            if (this._video) {
                const video = this._video;
                queueInMpv(video, () => this._launch(video));
            } else {
                this._openClipboard(false);
            }
        });
        this._indicator.menu.addMenuItem(queue);

        const audio = new PopupMenu.PopupMenuItem('Open Audio Only');
        audio.connect('activate', () => {
            if (this._video)
                this._launch(this._video, {audioOnly: true});
            else
                this._openClipboard(true);
        });
        this._indicator.menu.addMenuItem(audio);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const clipboard = new PopupMenu.PopupMenuItem('Open Clipboard URL in MPV');
        clipboard.connect('activate', () => this._openClipboard(false));
        this._indicator.menu.addMenuItem(clipboard);
    }

    _openCurrent() {
        if (this._video) {
            this._monitor.refresh(this._video.busName, video => {
                if (video)
                    this._launch(video);
                else
                    this._openClipboard(false);
            });
        } else {
            this._openClipboard(false);
        }
    }

    _openClipboard(audioOnly) {
        readClipboardUrl(this._clipboard, video => {
            if (video)
                this._launch(video, {audioOnly});
            else
                Main.notify(this.metadata.name, 'No browser media is available and the clipboard has no valid HTTP(S) media URL.');
        });
    }

    _launch(video, options = {}) {
        if (!openInMpv(video, options))
            Main.notify(this.metadata.name, 'Could not start MPV. Make sure mpv is installed and available on PATH.');
    }

    _updateIndicator() {
        if (!this._indicator)
            return;
        const active = Boolean(this._video);
        if (active)
            this._indicator.add_style_class_name('youtube-to-mpv-active');
        else
            this._indicator.remove_style_class_name('youtube-to-mpv-active');
        this._indicator.accessible_name = active
            ? `${this.metadata.name}: ${this._video.title}`
            : this.metadata.name;
        this._icon.icon_name = active
            ? 'media-playback-start-symbolic'
            : 'multimedia-player-symbolic';
        this._icon.set_style(active ? 'color: #ff4e45;' : null);
    }
}
