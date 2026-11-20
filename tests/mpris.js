import GLib from 'gi://GLib';

import {mediaUrl, MprisMonitor, parseMprisProperties, youtubeUrl} from '../mpris.js';

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
const webpVideo = parseMprisProperties({
    Metadata: new GLib.Variant('a{sv}', {
        'mpris:artUrl': new GLib.Variant('s', 'https://i.ytimg.com/vi_webp/lmnopqrstuv/hqdefault.webp'),
    }),
}, 'org.mpris.MediaPlayer2.brave');
assertEqual(webpVideo.url, 'https://www.youtube.com/watch?v=lmnopqrstuv', 'WebP thumbnail URL fallback');

let recentVideos = [];
const monitor = new MprisMonitor(videos => recentVideos = videos);
monitor._remember({
    busName: 'org.mpris.MediaPlayer2.brave',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    title: 'First video',
    status: 'Playing',
    position: 10,
});
monitor._remember({
    busName: 'org.mpris.MediaPlayer2.brave',
    url: 'https://www.youtube.com/watch?v=lmnopqrstuv',
    title: 'Second video',
    status: 'Playing',
    position: 20,
});
monitor._publishVideos();
assertEqual(recentVideos.length, 2, 'recent items from one browser player');
assertEqual(recentVideos[0].current, true, 'latest browser item is marked current');
assertEqual(recentVideos[1].status, 'Previous', 'older browser item is retained as recent');
monitor.destroy();

print('MPRIS parsing checks passed');
