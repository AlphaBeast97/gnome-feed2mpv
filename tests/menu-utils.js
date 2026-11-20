import {MENU_TITLE_LIMIT, menuTitle} from '../src/menu-utils.js';

const longTitle = 'x'.repeat(MENU_TITLE_LIMIT + 20);
const shortened = menuTitle(longTitle);
if (Array.from(shortened).length !== MENU_TITLE_LIMIT || !shortened.endsWith('…'))
    throw new Error('long titles should be shortened with an ellipsis');

if (menuTitle('  Short title  ') !== 'Short title')
    throw new Error('short titles should be preserved and trimmed');

print('Menu title checks passed');
