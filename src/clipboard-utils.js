import GLib from 'gi://GLib';

import {mediaUrl} from './mpris.js';

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

const STREAMING_HOSTS = [
    'bandcamp.com',
    'bilibili.com',
    'bitchute.com',
    'dailymotion.com',
    'media.ccc.de',
    'nicovideo.jp',
    'odysee.com',
    'rumble.com',
    'soundcloud.com',
    'twitch.tv',
    'vimeo.com',
];

const MEDIA_EXTENSIONS = new Set([
    '3gp', 'aac', 'avi', 'flac', 'flv', 'm3u8', 'm4a', 'm4v', 'mkv', 'mov',
    'mp3', 'mp4', 'mpd', 'oga', 'ogg', 'ogv', 'opus', 'wav', 'webm', 'wma',
]);

export function urlFromText(text) {
    const match = String(text ?? '').match(URL_PATTERN);
    if (!match)
        return null;
    return mediaUrl(match[0].replace(/[),.;!?\]}]+$/, ''));
}

function youtubeVideoIdFromUri(uri) {
    const host = uri.get_host()?.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
        const id = uri.get_path().split('/').filter(Boolean)[0];
        return validYouTubeId(id) ? id : null;
    }
    if (host !== 'youtube.com' && !host?.endsWith('.youtube.com'))
        return null;
    const params = GLib.Uri.parse_params(uri.get_query() ?? '', -1, '&', GLib.UriParamsFlags.NONE);
    const id = params.v ?? uri.get_path().match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)?.[1];
    return validYouTubeId(id) ? id : null;
}

export function youtubeVideoId(url) {
    try {
        return youtubeVideoIdFromUri(GLib.Uri.parse(url, GLib.UriFlags.NONE));
    } catch (_) {
        return null;
    }
}

export function videoFromUrl(url, copiedAt = Date.now()) {
    const uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
    const host = uri.get_host()?.replace(/^www\./, '') ?? 'Copied link';
    const id = youtubeVideoIdFromUri(uri);
    return {
        url,
        title: id ? `YouTube video (${id})` : host,
        titleSource: 'fallback',
        position: 0,
        status: 'Stopped',
        source: 'clipboard-history',
        copiedAt,
    };
}

export function isStreamableUrl(url) {
    try {
        const uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
        if (uri.get_scheme() !== 'http' && uri.get_scheme() !== 'https')
            return false;
        const host = uri.get_host()?.toLowerCase().replace(/^www\./, '');
        if (!host)
            return false;
        if (youtubeVideoIdFromUri(uri))
            return true;
        if (STREAMING_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`)))
            return true;
        return hasMediaExtension(uri.get_path() ?? '');
    } catch (_) {
        return false;
    }
}

function hasMediaExtension(path) {
    const basename = path.slice(path.lastIndexOf('/') + 1);
    const dot = basename.lastIndexOf('.');
    if (dot <= 0)
        return false;
    return MEDIA_EXTENSIONS.has(basename.slice(dot + 1).toLowerCase());
}

function validYouTubeId(value) {
    return typeof value === 'string' && /^[\w-]{11}$/.test(value);
}
