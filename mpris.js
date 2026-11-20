import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';
const OBJECT_PATH = '/org/mpris/MediaPlayer2';

function unwrap(value) {
    while (value instanceof GLib.Variant)
        value = value.deepUnpack();
    return value;
}

export function parseMprisProperties(properties, busName) {
    const rawMetadata = unwrap(properties.Metadata) ?? {};
    const metadata = Object.fromEntries(
        Object.entries(rawMetadata).map(([key, value]) => [key, unwrap(value)]));
    const rawUrl = metadata['xesam:url'] ?? '';
    const artUrl = metadata['mpris:artUrl'] ?? '';
    let url = mediaUrl(rawUrl);
    if (!url)
        url = youtubeUrlFromArtwork(artUrl);
    if (!url)
        return null;

    const position = Number(unwrap(properties.Position) ?? 0);
    return {
        busName,
        url,
        title: String(metadata['xesam:title'] ?? 'Browser media'),
        status: String(unwrap(properties.PlaybackStatus) ?? 'Stopped'),
        position: Number.isFinite(position) && position > 0 ? Math.floor(position / 1_000_000) : 0,
    };
}

function youtubeUrl(value) {
    if (typeof value !== 'string' || !value)
        return null;
    try {
        const parsed = GLib.Uri.parse(value, GLib.UriFlags.NONE);
        if (parsed.get_scheme() !== 'http' && parsed.get_scheme() !== 'https')
            return null;
        const host = parsed.get_host()?.toLowerCase().replace(/^www\./, '');
        if (host === 'youtu.be') {
            const id = parsed.get_path().split('/').filter(Boolean)[0];
            return validId(id) ? `https://www.youtube.com/watch?v=${id}` : null;
        }
        if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
            const params = GLib.Uri.parse_params(parsed.get_query() ?? '', -1, '&', GLib.UriParamsFlags.NONE);
            const id = params.v;
            if (validId(id))
                return `https://www.youtube.com/watch?v=${id}`;
            const match = parsed.get_path().match(/^\/(?:shorts|live|embed)\/([\w-]{11})/);
            return match ? `https://www.youtube.com/watch?v=${match[1]}` : null;
        }
    } catch (_) {
        return null;
    }
    return null;
}

function mediaUrl(value) {
    const youtube = youtubeUrl(value);
    if (youtube)
        return youtube;
    if (typeof value !== 'string')
        return null;
    try {
        const normalized = value.trim();
        const parsed = GLib.Uri.parse(normalized, GLib.UriFlags.NONE);
        if ((parsed.get_scheme() === 'http' || parsed.get_scheme() === 'https') && parsed.get_host())
            return normalized;
    } catch (_) {
    }
    return null;
}

function youtubeUrlFromArtwork(value) {
    if (typeof value !== 'string')
        return null;
    const match = value.match(/(?:^|\/)vi\/([\w-]{11})\//);
    return match ? `https://www.youtube.com/watch?v=${match[1]}` : null;
}

function validId(value) {
    return typeof value === 'string' && /^[\w-]{11}$/.test(value);
}

export class MprisMonitor {
    constructor(onVideoChanged) {
        this._onVideoChanged = onVideoChanged;
        this._cancellable = new Gio.Cancellable();
        this._subscriptions = [];
        this._players = new Map();
        this._busNames = new Set();
        this._owners = new Map();
        this._destroyed = false;
    }

    start() {
        this._subscriptions.push(Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
            '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _interface, _signal, parameters) => {
                const [name, _oldOwner, newOwner] = parameters.deepUnpack();
                if (!name.startsWith(MPRIS_PREFIX))
                    return;
                if (oldOwner)
                    this._owners.delete(oldOwner);
                if (newOwner) {
                    this._busNames.add(name);
                    this._owners.set(newOwner, name);
                    this._refresh(name);
                } else {
                    this._busNames.delete(name);
                    this._players.delete(name);
                }
                this._publishBest();
            }));
        this._subscriptions.push(Gio.DBus.session.signal_subscribe(
            null, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
            OBJECT_PATH, null, Gio.DBusSignalFlags.NONE,
            (_connection, sender, _path, _interface, _signal, parameters) => {
                const [changedInterface] = parameters.deepUnpack();
                const name = this._owners.get(sender);
                if (changedInterface === MPRIS_PLAYER_INTERFACE && name)
                    this._refresh(name);
            }));
        this._listNames();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._cancellable.cancel();
        for (const id of this._subscriptions)
            Gio.DBus.session.signal_unsubscribe(id);
        this._subscriptions = [];
        this._players.clear();
        this._busNames.clear();
        this._owners.clear();
        this._onVideoChanged = null;
    }

    _listNames() {
        Gio.DBus.session.call(
            'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'ListNames', null, new GLib.VariantType('(as)'), Gio.DBusCallFlags.NONE,
            3000, this._cancellable, (connection, result) => {
                if (this._destroyed)
                    return;
                try {
                    const [names] = connection.call_finish(result).deepUnpack();
                    for (const name of names) {
                        if (name.startsWith(MPRIS_PREFIX)) {
                            this._busNames.add(name);
                            this._watchOwner(name);
                            this._refresh(name);
                        }
                    }
                } catch (_) {
                    this._publishBest();
                }
            });
    }

    refresh(busName, callback = null) {
        this._refresh(busName, callback);
    }

    _watchOwner(busName) {
        Gio.DBus.session.call(
            'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'GetNameOwner', new GLib.Variant('(s)', [busName]),
            new GLib.VariantType('(s)'), Gio.DBusCallFlags.NONE, 1000,
            this._cancellable, (connection, result) => {
                if (this._destroyed || !this._busNames.has(busName))
                    return;
                try {
                    const [owner] = connection.call_finish(result).deepUnpack();
                    this._owners.set(owner, busName);
                } catch (_) {
                }
            });
    }

    _refresh(busName, callback = null) {
        if (this._destroyed)
            return;
        Gio.DBus.session.call(
            busName, OBJECT_PATH, 'org.freedesktop.DBus.Properties', 'GetAll',
            new GLib.Variant('(s)', ['org.mpris.MediaPlayer2.Player']),
            new GLib.VariantType('(a{sv})'), Gio.DBusCallFlags.NONE,
            1000, this._cancellable, (connection, result) => {
                if (this._destroyed)
                    return;
                try {
                    const [properties] = connection.call_finish(result).deepUnpack();
                    const video = parseMprisProperties(properties, busName);
                    if (video)
                        this._players.set(busName, video);
                    else
                        this._players.delete(busName);
                    callback?.(video);
                } catch (_) {
                    this._players.delete(busName);
                    callback?.(null);
                }
                this._publishBest();
            });
    }

    _publishBest() {
        if (this._destroyed)
            return;
        const videos = [...this._players.values()];
        videos.sort((a, b) => Number(b.status === 'Playing') - Number(a.status === 'Playing'));
        this._onVideoChanged?.(videos[0] ?? null);
    }
}

export {mediaUrl, youtubeUrl};
