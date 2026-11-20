import GLib from 'gi://GLib';

import {mediaUrl, parseMprisProperties, youtubeUrl} from '../mpris.js';

function assertEqual(actual, expected, name) {
    if (actual !== expected)
        throw new Error(`${name}: expected ${expected}, got ${actual}`);
}

assertEqual(
    mediaUrl('https://example.org/watch?id=42'),
    'https://example.org/watch?id=42',
    'generic HTTPS media URL');
assertEqual(
    youtubeUrl('https://youtu.be/abcdefghijk'),
    'https://www.youtube.com/watch?v=abcdefghijk',
    'short YouTube URL');
assertEqual(
    youtubeUrl('https://www.youtube.com/shorts/abcdefghijk'),
    'https://www.youtube.com/watch?v=abcdefghijk',
    'YouTube Shorts URL');
assertEqual(mediaUrl('file:///tmp/video.mp4'), null, 'non-web URL');
assertEqual(youtubeUrl('file://youtube.com/watch?v=abcdefghijk'), null, 'non-web YouTube URL');

const metadata = new GLib.Variant('a{sv}', {
    'xesam:url': new GLib.Variant('s', ''),
    'mpris:artUrl': new GLib.Variant('s', 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'),
    'xesam:title': new GLib.Variant('s', 'Example video'),
});
const video = parseMprisProperties({
    Metadata: metadata,
    PlaybackStatus: new GLib.Variant('s', 'Playing'),
    Position: new GLib.Variant('x', 123456789),
}, 'org.mpris.MediaPlayer2.chromium');

assertEqual(video.url, 'https://www.youtube.com/watch?v=abcdefghijk', 'thumbnail URL fallback');
assertEqual(video.title, 'Example video', 'MPRIS title');
assertEqual(video.status, 'Playing', 'MPRIS playback status');
assertEqual(video.position, 123, 'MPRIS position conversion');

print('MPRIS parsing checks passed');
