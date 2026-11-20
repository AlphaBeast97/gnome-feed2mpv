import {isStreamableUrl, urlFromText, videoFromUrl, youtubeVideoId} from '../src/clipboard-utils.js';
import {parseOEmbedTitle} from '../src/video-title.js';

const copiedUrl = urlFromText('Watch this: https://youtu.be/abcdefghijk).');
if (copiedUrl !== 'https://www.youtube.com/watch?v=abcdefghijk')
    throw new Error(`unexpected normalized YouTube URL: ${copiedUrl}`);

if (youtubeVideoId(copiedUrl) !== 'abcdefghijk')
    throw new Error('YouTube video ID was not recognized');

const video = videoFromUrl(copiedUrl, 1234);
if (video.title !== 'YouTube video (abcdefghijk)' || video.copiedAt !== 1234)
    throw new Error('clipboard fallback video metadata was not created');

if (urlFromText('copied plain text') !== null)
    throw new Error('plain text should not be treated as a video URL');

if (parseOEmbedTitle('{"title":"A video title"}') !== 'A video title' ||
    parseOEmbedTitle('not JSON') !== null)
    throw new Error('YouTube title metadata was not parsed safely');

for (const url of [
    'https://www.youtube.com/watch?v=abcdefghijk',
    'https://youtu.be/abcdefghijk',
    'https://vimeo.com/123456789',
    'https://cdn.example.org/live/index.m3u8',
    'https://cdn.example.org/audio/track.flac?token=abc',
    'https://media.example.org/clip.MP4',
]) {
    if (!isStreamableUrl(url))
        throw new Error(`expected a streamable link: ${url}`);
}

for (const url of [
    'https://example.org/blog/post-about-a-video',
    'https://github.com/alphabeast97/gnome-feed2mpv',
    'https://example.org/src/main.ts',
    'https://www.youtube.com/feed/subscriptions',
    'file:///tmp/video.mp4',
]) {
    if (isStreamableUrl(url))
        throw new Error(`expected a non-streamable link: ${url}`);
}

print('Clipboard URL checks passed');
