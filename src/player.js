import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

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

function launch(args, onError, cancellable = null) {
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
        stdout.read_line_async(GLib.PRIORITY_DEFAULT, cancellable, (stream, result) => {
            if (cancellable?.is_cancelled())
                return;
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

    process.wait_async(cancellable, (subprocess, result) => {
        if (cancellable?.is_cancelled())
            return;
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

export function openInMpv(video, options = {}, onError = () => {}, cancellable = null) {
    pauseBrowser(video);
    return launch(argumentsFor(video, options), onError, cancellable);
}

export function queueInMpv(video, onUnavailable, onQueued = () => {}, cancellable = null) {
    pauseBrowser(video);
    const client = new Gio.SocketClient();
    const address = new Gio.UnixSocketAddress({path: MPV_SOCKET});
    client.connect_async(address, cancellable, (socketClient, result) => {
        if (cancellable?.is_cancelled())
            return;
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
            bytes, GLib.PRIORITY_DEFAULT, cancellable, (stream, writeResult) => {
                if (cancellable?.is_cancelled()) {
                    connection.close(null);
                    return;
                }
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
