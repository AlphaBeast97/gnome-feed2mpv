import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const MPV_SOCKET = '/tmp/mpvsocket';
const RETRY_SECONDS = 1;
const LOAD_TIMEOUT_SECONDS = 30;

export class MpvIpcMonitor {
    constructor(onStateChanged) {
        this._onStateChanged = onStateChanged;
        this._cancellable = new Gio.Cancellable();
        this._connection = null;
        this._input = null;
        this._retrySource = 0;
        this._loadTimeout = 0;
        this._state = 'idle';
        this._idle = null;
        this._paused = null;
        this._destroyed = false;
    }

    start() {
        this._connect();
    }

    get state() {
        return this._state;
    }

    expectLoad() {
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
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._cancellable.cancel();
        if (this._retrySource)
            GLib.Source.remove(this._retrySource);
        this._clearLoadTimeout();
        this._connection?.close(null);
        this._connection = null;
        this._input = null;
        this._onStateChanged = null;
    }

    _connect() {
        if (this._destroyed || this._connection)
            return;
        const client = new Gio.SocketClient();
        const address = new Gio.UnixSocketAddress({path: MPV_SOCKET});
        client.connect_async(address, this._cancellable, (socketClient, result) => {
            if (this._destroyed)
                return;
            try {
                this._connection = socketClient.connect_finish(result);
            } catch (_) {
                this._scheduleRetry();
                return;
            }
            this._input = Gio.DataInputStream.new(this._connection.get_input_stream());
            this._sendCommands([
                ['observe_property', 1, 'idle-active'],
                ['observe_property', 2, 'pause'],
                ['observe_property', 3, 'media-title'],
            ]);
            this._readNextLine();
        });
    }

    _sendCommands(commands) {
        if (!this._connection)
            return;
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
        if (this._destroyed || !this._input)
            return;
        this._input.read_line_async(
            GLib.PRIORITY_DEFAULT, this._cancellable, (stream, result) => {
                if (this._destroyed)
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
        if (this._state === 'playing' || this._state === 'paused')
            this._setState('idle');
        this._scheduleRetry();
    }

    _scheduleRetry() {
        if (this._destroyed || this._retrySource)
            return;
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
