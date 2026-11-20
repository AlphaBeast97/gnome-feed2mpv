# YouTube to MPV

A GNOME Shell extension for opening the current browser media URL in MPV. YouTube is supported through page URLs and, for Chromium based browsers, thumbnail metadata. Other sites work when the browser publishes their HTTP(S) page URL through MPRIS. It uses `yt-dlp` through MPV's built-in integration and leaves the user's MPV configuration untouched.

## Requirements

- GNOME Shell 46 through 51
- MPV and yt-dlp available on `PATH`
- A browser that publishes media through MPRIS, or an HTTP(S) media URL on the clipboard

Firefox and Zen can expose the page URL through `xesam:url`. Chromium based browsers can expose the YouTube video ID through the thumbnail URL in `mpris:artUrl`. Support for other sites depends on the browser publishing its page URL in the media session.

## Use

The panel menu lists detected media by title and browser, so choose the item you want to watch. Selecting an item opens it in MPV, pauses that browser session if it is playing, and starts at the reported playback position. The menu status and panel tooltip show when media is being scanned, nothing is detected, MPV is loading, or MPV is playing or paused. Queue, audio only, and explicit clipboard actions are also available. Queueing uses MPV's IPC socket at `/tmp/mpvsocket`; when no socket is available, the extension starts MPV with the selected video.

The extension does not set `ytdl-format` or other playback preferences. MPV reads the user's existing configuration normally.

## Install from a local checkout

Run `gnome-extensions pack . --extra-source=mpris.js --extra-source=player.js --extra-source=mpv-ipc.js` in this directory, then install the resulting ZIP with GNOME Extensions or `gnome-extensions install`. Enable the extension from the Extensions app or with:

```sh
gnome-extensions enable youtube-to-mpv@alphabeast97.github.io
```

## Development

The entry point and menu live in `extension.js`. Browser media discovery and URL parsing live in `mpris.js`; MPV launching and clipboard handling live in `player.js`; MPV IPC playback state is managed in `mpv-ipc.js`. Run the checks with `gjs -m tests/mpris.js` and `gjs -m tests/mpv-ipc.js`.
