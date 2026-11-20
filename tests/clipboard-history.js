import {parseCliphistRows} from '../clipboard-history.js';

const rows = parseCliphistRows([
    '14\thttps://youtu.be/abcdefghijk',
    '13\tplain text',
    '12\thttps://example.com/watch?id=2…',
    '11\t[image/png]',
    '10\thttps://example.com/older',
    '9\thttps://example.com/oldest-in-scan',
].join('\n'));

if (rows.length !== 4)
    throw new Error(`expected 4 URL previews in the scan window, got ${rows.length}`);
if (rows[0].id !== '14' || rows[3].id !== '9')
    throw new Error('clipboard history order was not preserved');

print('Clipboard history checks passed');
