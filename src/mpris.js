import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';
const OBJECT_PATH = '/org/mpris/MediaPlayer2';
const MAX_RECENT_PER_PLAYER = 5;
const MAX_RECENT_TOTAL = 20;
const PROPERTY_REFRESH_DELAY_MS = 150;

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

export function youtubeVideoIdFromUri(parsed) {
    if (parsed.get_scheme() !== 'http' && parsed.get_scheme() !== 'https')
        return null;
    const host = parsed.get_host()?.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
        const id = parsed.get_path().split('/').filter(Boolean)[0];
        return validId(id) ? id : null;
    }
    if (host === 'youtube.com' || host?.endsWith('.youtube.com')) {
        const params = GLib.Uri.parse_params(parsed.get_query() ?? '', -1, '&', GLib.UriParamsFlags.NONE);
        const id = params.v ?? parsed.get_path().match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)?.[1];
        return validId(id) ? id : null;
    }
    return null;
}

function youtubeUrlFromUri(parsed) {
    const id = youtubeVideoIdFromUri(parsed);
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

function youtubeUrl(value) {
    if (typeof value !== 'string' || !value)
        return null;
    try {
        return youtubeUrlFromUri(GLib.Uri.parse(value, GLib.UriFlags.NONE));
    } catch (_) {
        return null;
    }
}

function mediaUrl(value) {
    if (typeof value !== 'string')
        return null;
    try {
        const normalized = value.trim();
        const parsed = GLib.Uri.parse(normalized, GLib.UriFlags.NONE);
        const youtube = youtubeUrlFromUri(parsed);
        if (youtube)
            return youtube;
        if ((parsed.get_scheme() === 'http' || parsed.get_scheme() === 'https') && parsed.get_host())
            return normalized;
    } catch (_) {
    }
    return null;
}

function youtubeUrlFromArtwork(value) {
    if (typeof value !== 'string')
        return null;
    const match = value.match(/(?:^|\/)vi(?:_webp)?\/([\w-]{11})(?:\/|$)/);
    return match ? `https://www.youtube.com/watch?v=${match[1]}` : null;
}

function validId(value) {
    return typeof value === 'string' && /^[\w-]{11}$/.test(value);
}

export class MprisMonitor {
    constructor(onVideosChanged, onInitialScanComplete = () => {}) {
        this._onVideosChanged = onVideosChanged;
        this._onInitialScanComplete = onInitialScanComplete;
        this._cancellable = new Gio.Cancellable();
        this._subscriptions = [];
        this._refreshSources = new Map();
        this._recent = new Map();
        this._busNames = new Set();
        this._owners = new Map();
        this._initialScanComplete = false;
        this._initialScanPending = 0;
    }

    start() {
        this._subscriptions.push(Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
            '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _interface, _signal, parameters) => {
                const [name, oldOwner, newOwner] = parameters.deepUnpack();
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
                    this._markInactive(name);
                }
                this._publishVideos();
            }));
        this._subscriptions.push(Gio.DBus.session.signal_subscribe(
            null, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
            OBJECT_PATH, null, Gio.DBusSignalFlags.NONE,
            (_connection, sender, _path, _interface, _signal, parameters) => {
                const [changedInterface] = parameters.deepUnpack();
                const name = this._owners.get(sender);
                if (changedInterface === MPRIS_PLAYER_INTERFACE && name)
                    this._scheduleRefresh(name);
            }));
        this._listNames();
    }

    destroy() {
        this._cancellable.cancel();
        for (const id of this._refreshSources.values())
            GLib.Source.remove(id);
        this._refreshSources.clear();
        for (const id of this._subscriptions)
            Gio.DBus.session.signal_unsubscribe(id);
        this._subscriptions = [];
        this._recent.clear();
        this._busNames.clear();
        this._owners.clear();
        this._onVideosChanged = null;
        this._onInitialScanComplete = null;
    }

    _listNames() {
        Gio.DBus.session.call(
            'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'ListNames', null, new GLib.VariantType('(as)'), Gio.DBusCallFlags.NONE,
            3000, this._cancellable, (connection, result) => {
                if (this._cancellable.is_cancelled())
                    return;
                try {
                    const [names] = connection.call_finish(result).deepUnpack();
                    const players = names.filter(name => name.startsWith(MPRIS_PREFIX));
                    this._initialScanPending = players.length;
                    if (players.length === 0) {
                        this._finishInitialScan();
                        return;
                    }
                    for (const name of players) {
                        this._busNames.add(name);
                        this._watchOwner(name);
                        this._refresh(name, () => {
                            this._initialScanPending--;
                            if (this._initialScanPending === 0)
                                this._finishInitialScan();
                        });
                    }
                } catch (_) {
                    this._finishInitialScan();
                }
            });
    }

    refresh(busName, callback = null) {
        this._refresh(busName, callback);
    }

    _finishInitialScan() {
        if (this._initialScanComplete || this._cancellable.is_cancelled())
            return;
        this._initialScanComplete = true;
        this._onInitialScanComplete?.();
    }

    _watchOwner(busName) {
        Gio.DBus.session.call(
            'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'GetNameOwner', new GLib.Variant('(s)', [busName]),
            new GLib.VariantType('(s)'), Gio.DBusCallFlags.NONE, 1000,
            this._cancellable, (connection, result) => {
                if (this._cancellable.is_cancelled() || !this._busNames.has(busName))
                    return;
                try {
                    const [owner] = connection.call_finish(result).deepUnpack();
                    this._owners.set(owner, busName);
                } catch (_) {
                }
            });
    }

    _scheduleRefresh(busName) {
        if (this._cancellable.is_cancelled() || this._refreshSources.has(busName))
            return;
        const id = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, PROPERTY_REFRESH_DELAY_MS, () => {
                this._refreshSources.delete(busName);
                this._refresh(busName);
                return GLib.SOURCE_REMOVE;
            });
        this._refreshSources.set(busName, id);
    }

    _refresh(busName, callback = null) {
        if (this._cancellable.is_cancelled())
            return;
        Gio.DBus.session.call(
            busName, OBJECT_PATH, 'org.freedesktop.DBus.Properties', 'GetAll',
            new GLib.Variant('(s)', ['org.mpris.MediaPlayer2.Player']),
            new GLib.VariantType('(a{sv})'), Gio.DBusCallFlags.NONE,
            1000, this._cancellable, (connection, result) => {
                if (this._cancellable.is_cancelled())
                    return;
                try {
                    const [properties] = connection.call_finish(result).deepUnpack();
                    const video = parseMprisProperties(properties, busName);
                    if (video)
                        this._remember(video);
                    else
                        this._markInactive(busName);
                    callback?.(video);
                } catch (_) {
                    this._markInactive(busName);
                    callback?.(null);
                }
                this._publishVideos();
            });
    }

    _publishVideos() {
        if (this._cancellable.is_cancelled())
            return;
        const videos = [...this._recent.values()];
        videos.sort((a, b) => Number(b.current && b.status === 'Playing') - Number(a.current && a.status === 'Playing')
            || Number(b.current) - Number(a.current));
        this._onVideosChanged?.(videos);
    }

    _remember(video) {
        const key = `${video.busName}\n${video.url}`;
        for (const [entryKey, entry] of this._recent) {
            if (entry.busName === video.busName)
                this._recent.set(entryKey, {...entry, current: false, status: 'Previous'});
        }
        this._recent.delete(key);
        this._recent.set(key, {...video, current: true});

        const playerEntries = [...this._recent]
            .filter(([, entry]) => entry.busName === video.busName)
            .map(([entryKey]) => entryKey);
        while (playerEntries.length > MAX_RECENT_PER_PLAYER)
            this._recent.delete(playerEntries.shift());
        while (this._recent.size > MAX_RECENT_TOTAL)
            this._recent.delete(this._recent.keys().next().value);
    }

    _markInactive(busName) {
        for (const [key, entry] of this._recent) {
            if (entry.busName === busName)
                this._recent.set(key, {...entry, current: false, status: 'Previous'});
        }
    }
}

export {mediaUrl, youtubeUrl};
