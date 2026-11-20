import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {mediaUrl} from './mpris.js';
import {MPV_SOCKET} from './mpv-ipc.js';

function launch(args) {
    try {
        const process = Gio.Subprocess.new(args,
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
        process.wait_async(null, (subprocess, result) => {
            try {
                subprocess.wait_finish(result);
            } catch (_) {
            }
        });
        return true;
    } catch (_) {
        return false;
    }
}

function pauseBrowser(video) {
    if (video.status !== 'Playing')
        return;
    Gio.DBus.session.call(
        video.busName, '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2.Player',
        'Pause', null, null, Gio.DBusCallFlags.NONE, 1000, null, () => {});
}

function argumentsFor(video, {audioOnly = false} = {}) {
    const args = ['mpv'];
    if (video.position > 0)
        args.push(`--start=${video.position}`);
    args.push('--input-ipc-server=' + MPV_SOCKET);
    if (audioOnly)
        args.push('--no-video');
    args.push(video.url);
    return args;
}

export function openInMpv(video, options = {}) {
    pauseBrowser(video);
    return launch(argumentsFor(video, options));
}

export function queueInMpv(video, onUnavailable, onQueued = () => {}) {
    pauseBrowser(video);
    const client = new Gio.SocketClient();
    const address = new Gio.UnixSocketAddress({path: MPV_SOCKET});
    client.connect_async(address, null, (socketClient, result) => {
        let connection;
        try {
            connection = socketClient.connect_finish(result);
        } catch (_) {
            onUnavailable();
            return;
        }

        const payload = JSON.stringify({command: ['loadfile', video.url, 'append-play']}) + '\n';
        const bytes = new TextEncoder().encode(payload);
        connection.get_output_stream().write_all_async(
            bytes, GLib.PRIORITY_DEFAULT, null, (stream, writeResult) => {
                try {
                    stream.write_all_finish(writeResult);
                    connection.close(null);
                    onQueued();
                } catch (_) {
                    connection.close(null);
                    onUnavailable();
                }
            });
    });
}

export function readClipboardUrl(clipboard, callback) {
    clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
        if (!text) {
            callback(null);
            return;
        }
        try {
            const url = mediaUrl(text.trim());
            if (url) {
                callback({url, title: 'Clipboard video', position: 0, status: 'Stopped'});
                return;
            }
        } catch (_) {
        }
        callback(null);
    });
}
