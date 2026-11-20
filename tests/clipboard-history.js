import {parseIsleItems} from '../clipboard-history.js';

const items = parseIsleItems(JSON.stringify([
    {id: 18, kind: 'link', preview: 'https://youtu.be/abcdefghijk', at_ms: 300},
    {id: 17, kind: 'text', preview: 'Watch this https://example.com/video', at_ms: 200},
    {id: 16, kind: 'image', preview: 'https://example.com/not-a-link-entry'},
    {id: 15, kind: 'link', preview: 'https://example.com/watch…', at_ms: 100},
    {id: 14, kind: 'link', preview: 'https://example.com/pinned-old', pinned: true, at_ms: 10},
]));

if (items.length !== 4)
    throw new Error(`expected four URL-bearing Isle entries, got ${items.length}`);
if (items[0].id !== 18 || items[1].id !== 17 || items[3].id !== 14)
    throw new Error('Isle clipboard history was not ordered by newest copy time');
if (parseIsleItems('not JSON').length !== 0)
    throw new Error('malformed Isle data should produce an empty history');

print('Isle clipboard history checks passed');
