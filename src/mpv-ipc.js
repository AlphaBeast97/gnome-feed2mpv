import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const RETRY_SECONDS = 1;
const MAX_RETRIES = 3;
const LOAD_TIMEOUT_SECONDS = 30;

export const MPV_SOCKET = GLib.build_filenamev([
    GLib.get_user_runtime_dir(),
    'mpvsocket',
]);

export class MpvIpcMonitor {
    constructor(onStateChanged, onPlaybackError = null) {
        this._onStateChanged = onStateChanged;
        this._onPlaybackError = onPlaybackError;
        this._loadSource = null;
        this._cancellable = new Gio.Cancellable();
        this._connection = null;
        this._connectAttempt = null;
        this._input = null;
        this._retrySource = 0;
        this._retryAttempts = 0;
        this._loadTimeout = 0;
        this._socketMonitor = null;
        this._socketMonitorSignal = 0;
        this._state = 'idle';
        this._idle = null;
        this._paused = null;
    }

    start() {
        this._watchSocketDirectory();
        this._connect();
    }

    get state() {
        return this._state;
    }

    expectLoad(source = 'launch') {
        if (this._cancellable.is_cancelled())
            return;
        this._loadSource = source;
        this._retryAttempts = 0;
        if (this._state !== 'playing' && this._state !== 'paused')
            this._setState('loading');
        if (this._loadTimeout)
            GLib.Source.remove(this._loadTimeout);
        this._loadTimeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, LOAD_TIMEOUT_SECONDS, () => {
                this._loadTimeout = 0;
                if (this._state === 'loading')
                    this._setState('idle');
                return GLib.SOURCE_REMOVE;
            });
    }

    cancelLoad() {
        this._clearLoadTimeout();
        if (this._state === 'loading')
            this._setState('idle');
    }

    togglePause() {
        this._sendPlayerCommand(['cycle', 'pause']);
    }

    stopPlayback() {
        this._sendPlayerCommand(['stop']);
    }

    destroy() {
        this._cancellable.cancel();
        if (this._retrySource)
            GLib.Source.remove(this._retrySource);
        this._retrySource = 0;
        this._connectAttempt = null;
        this._stopWatchingSocketDirectory();
        this._clearLoadTimeout();
        this._connection?.close(null);
        this._connection = null;
        this._input = null;
        this._loadSource = null;
        this._onStateChanged = null;
        this._onPlaybackError = null;
    }

    _connect() {
        if (this._cancellable.is_cancelled() || this._connection || this._connectAttempt)
            return;
        const attempt = {};
        this._connectAttempt = attempt;
        const client = new Gio.SocketClient();
        const address = new Gio.UnixSocketAddress({path: MPV_SOCKET});
        client.connect_async(address, this._cancellable, (socketClient, result) => {
            if (this._connectAttempt !== attempt)
                return;
            this._connectAttempt = null;
            if (this._cancellable.is_cancelled())
                return;
            try {
                this._connection = socketClient.connect_finish(result);
            } catch (_) {
                this._scheduleRetry();
                return;
            }
            this._retryAttempts = 0;
            this._input = Gio.DataInputStream.new(this._connection.get_input_stream());
            this._sendCommands([
                ['observe_property', 1, 'idle-active'],
                ['observe_property', 2, 'pause'],
            ]);
            this._readNextLine();
        });
    }

    _sendCommands(commands) {
        const payload = commands.map(command => JSON.stringify({command}) + '\n').join('');
        const bytes = new TextEncoder().encode(payload);
        this._connection.get_output_stream().write_all_async(
            bytes, GLib.PRIORITY_DEFAULT, this._cancellable, (stream, result) => {
                try {
                    stream.write_all_finish(result);
                } catch (_) {
                    this._disconnect();
                }
            });
    }

    _sendPlayerCommand(command) {
        const write = (connection, closeWhenDone = false) => {
            const bytes = new TextEncoder().encode(`${JSON.stringify({command})}\n`);
            connection.get_output_stream().write_all_async(
                bytes, GLib.PRIORITY_DEFAULT, this._cancellable, (stream, result) => {
                    try {
                        stream.write_all_finish(result);
                    } catch (_) {
                    }
                    if (closeWhenDone)
                        connection.close(null);
                });
        };

        if (this._connection) {
            write(this._connection);
            return;
        }

        const client = new Gio.SocketClient();
        const address = new Gio.UnixSocketAddress({path: MPV_SOCKET});
        client.connect_async(address, this._cancellable, (socketClient, result) => {
            try {
                const connection = socketClient.connect_finish(result);
                write(connection, true);
            } catch (_) {
            }
        });
    }

    _readNextLine() {
        if (this._cancellable.is_cancelled() || !this._input)
            return;
        this._input.read_line_async(
            GLib.PRIORITY_DEFAULT, this._cancellable, (stream, result) => {
                if (this._cancellable.is_cancelled())
                    return;
                try {
                    const [line] = stream.read_line_finish_utf8(result);
                    if (line === null) {
                        this._disconnect();
                        return;
                    }
                    this._handleMessage(JSON.parse(line));
                } catch (_) {
                    this._disconnect();
                    return;
                }
                this._readNextLine();
            });
    }

    _handleMessage(message) {
        if (message.event === 'playback-restart') {
            this._clearLoadTimeout();
            this._setState('playing');
            return;
        }
        if (message.event === 'end-file') {
            this._clearLoadTimeout();
            if (message.reason === 'error')
                this._onPlaybackError?.(message.file_error ?? 'loading failed', this._loadSource);
            this._loadSource = null;
            this._idle = true;
            this._setState('idle');
            return;
        }
        if (message.event === 'shutdown') {
            this._disconnect();
            return;
        }
        if (message.event !== 'property-change')
            return;

        if (message.name === 'idle-active')
            this._idle = message.data;
        else if (message.name === 'pause')
            this._paused = message.data;
        else
            return;

        if (this._idle === false && this._paused === false) {
            this._clearLoadTimeout();
            this._setState('playing');
        } else if (this._idle === false && this._paused === true) {
            this._clearLoadTimeout();
            this._setState('paused');
        } else if (this._idle === true && this._state !== 'loading') {
            this._setState('idle');
        }
    }

    _disconnect() {
        this._connection?.close(null);
        this._connection = null;
        this._input = null;
        this._idle = null;
        this._paused = null;
        this._retryAttempts = 0;
        if (this._state === 'playing' || this._state === 'paused')
            this._setState('idle');
        this._scheduleRetry();
    }

    _watchSocketDirectory() {
        const socketFile = Gio.File.new_for_path(MPV_SOCKET);
        try {
            this._socketMonitor = socketFile.get_parent().monitor_directory(
                Gio.FileMonitorFlags.WATCH_MOVES, null);
        } catch (_) {
            this._socketMonitor = null;
            return;
        }
        const basename = socketFile.get_basename();
        this._socketMonitorSignal = this._socketMonitor.connect('changed', (_monitor, file) => {
            if (!this._cancellable.is_cancelled() && file.get_basename() === basename) {
                this._retryAttempts = 0;
                this._connect();
            }
        });
    }

    _stopWatchingSocketDirectory() {
        if (this._socketMonitorSignal)
            this._socketMonitor.disconnect(this._socketMonitorSignal);
        this._socketMonitor?.cancel();
        this._socketMonitor = null;
        this._socketMonitorSignal = 0;
    }

    _scheduleRetry() {
        if (this._cancellable.is_cancelled() || this._retrySource || this._retryAttempts >= MAX_RETRIES)
            return;
        this._retryAttempts++;
        this._retrySource = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, RETRY_SECONDS, () => {
                this._retrySource = 0;
                this._connect();
                return GLib.SOURCE_REMOVE;
            });
    }

    _clearLoadTimeout() {
        if (this._loadTimeout)
            GLib.Source.remove(this._loadTimeout);
        this._loadTimeout = 0;
    }

    _setState(state) {
        if (this._state === state)
            return;
        this._state = state;
        this._onStateChanged?.(state);
    }
}
