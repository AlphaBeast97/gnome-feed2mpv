import {itemTime, parseItems} from '../src/history-providers/shell-daemon.js';

const items = parseItems(JSON.stringify([
    {id: 1, kind: 'text', preview: 'copied text https://youtu.be/abcdefghijk', at: 1000},
    {id: 2, kind: 'link', preview: 'https://example.org/newer.mp4', at: 3000},
    {id: 3, kind: 'image', preview: 'https://example.org/picture', at: 9000},
    {id: 4, kind: 'text', preview: 'no link in this entry', at: 9500},
    {id: 5, kind: 'text', preview: 'https://example.org/blog/post-about-a-video', at: 8000},
]));

if (items.length !== 2)
    throw new Error(`expected only streamable text and link items, got ${items.length}`);
if (items[0].id !== 2 || items[1].id !== 1)
    throw new Error('items should be ordered newest first using the daemon "at" field');
if (itemTime(items[0]) !== 3000)
    throw new Error(`unexpected item timestamp: ${itemTime(items[0])}`);
if (itemTime({at_ms: 42}) !== 42)
    throw new Error('legacy at_ms timestamps should still be read');
if (parseItems('not JSON').length !== 0)
    throw new Error('invalid daemon data should produce an empty list');

print('History provider checks passed');
