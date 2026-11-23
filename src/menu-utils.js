export const MENU_TITLE_LIMIT = 48;

export function menuTitle(title) {
    const characters = Array.from(String(title ?? '').trim());
    if (characters.length <= MENU_TITLE_LIMIT)
        return characters.join('');
    return `${characters.slice(0, MENU_TITLE_LIMIT - 1).join('')}…`;
}

export function videoKey(video) {
    return video ? `${video.busName}\n${video.url}` : '';
}
