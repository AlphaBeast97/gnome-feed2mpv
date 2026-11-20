import GLib from 'gi://GLib';

import {mediaUrl} from './mpris.js';

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

export function urlFromText(text) {
    const match = String(text ?? '').match(URL_PATTERN);
    if (!match)
        return null;
    return mediaUrl(match[0].replace(/[),.;!?\]}]+$/, ''));
}

export function youtubeVideoId(url) {
    try {
        const uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
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
    } catch (_) {
        return null;
    }
}

export function videoFromUrl(url, copiedAt = Date.now()) {
    const host = GLib.Uri.parse(url, GLib.UriFlags.NONE).get_host()?.replace(/^www\./, '')
        ?? 'Copied link';
    const id = youtubeVideoId(url);
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

function validYouTubeId(value) {
    return typeof value === 'string' && /^[\w-]{11}$/.test(value);
}
