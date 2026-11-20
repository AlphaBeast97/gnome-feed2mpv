import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {mediaUrl} from './mpris.js';
import {MPV_SOCKET} from './mpv-ipc.js';

function describeFailure(lines) {
    const meaningful = lines
        .map(line => line.trim())
        .filter(line => line && !/^Exiting\.\.\./.test(line))
        .map(line => line.replace(/^\[[^\]]+\]\s*/, '').replace(/^ERROR:\s*/, ''));
    const specific = meaningful.find(line =>
        /\b(error|failed|cannot|unable|unsupported|unavailable|invalid|not found)\b/i.test(line));
    const text = (specific ?? meaningful.at(-1) ?? '').replace(/\s+/g, ' ');
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

function launch(args, onError) {
    let process;
    try {
        process = Gio.Subprocess.new(args,
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
    } catch (_) {
        return false;
    }

    const lines = [];
    const stdout = Gio.DataInputStream.new(process.get_stdout_pipe());
    const readLine = () => {
        stdout.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, result) => {
            let line = null;
            try {
                [line] = stream.read_line_finish_utf8(result);
            } catch (_) {
                return;
            }
            if (line === null)
                return;
            if (line.trim()) {
                lines.push(line);
                if (lines.length > 40)
                    lines.shift();
            }
            readLine();
        });
    };
    readLine();

    process.wait_async(null, (subprocess, result) => {
        let successful = false;
        try {
            subprocess.wait_finish(result);
            successful = subprocess.get_successful();
        } catch (_) {
        }
        if (!successful)
            onError(describeFailure(lines));
    });
    return true;
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
    args.push('--terminal=yes', '--term-status-msg=', '--input-ipc-server=' + MPV_SOCKET);
    if (audioOnly)
        args.push('--no-video');
    args.push(video.url);
    return args;
}

export function openInMpv(video, options = {}, onError = () => {}) {
    pauseBrowser(video);
    return launch(argumentsFor(video, options), onError);
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
