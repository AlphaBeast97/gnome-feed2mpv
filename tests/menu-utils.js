import {MENU_TITLE_LIMIT, menuTitle, videoKey} from '../src/menu-utils.js';

const longTitle = 'x'.repeat(MENU_TITLE_LIMIT + 20);
const shortened = menuTitle(longTitle);
if (Array.from(shortened).length !== MENU_TITLE_LIMIT || !shortened.endsWith('…'))
    throw new Error('long titles should be shortened with an ellipsis');

if (menuTitle('  Short title  ') !== 'Short title')
    throw new Error('short titles should be preserved and trimmed');

if (videoKey(null) !== '')
    throw new Error('null video should have empty key');

if (videoKey({busName: 'org.mpris.MediaPlayer2.zen', url: 'https://example.org'}) !== 'org.mpris.MediaPlayer2.zen\nhttps://example.org')
    throw new Error('videoKey should produce busName and url composite key');

print('Menu title checks passed');
