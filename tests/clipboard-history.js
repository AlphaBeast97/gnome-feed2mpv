import {urlFromText, videoFromUrl, youtubeVideoId} from '../src/clipboard-utils.js';
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

print('Clipboard URL checks passed');
