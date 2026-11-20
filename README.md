# GNOME Feed2MPV

<p align="center">
  <img src="gnome-feed2mpv.svg" alt="GNOME Feed2MPV logo" width="112">
</p>

[![Checks](https://github.com/alphabeast97/gnome-feed2mpv/actions/workflows/checks.yml/badge.svg)](https://github.com/alphabeast97/gnome-feed2mpv/actions/workflows/checks.yml)

A GNOME Shell extension for handing browser media to MPV from one GNOME menu. It runs in GNOME Shell, so you do not need to install a browser extension, native-messaging host, or separate helper for each browser. The panel indicator stays icon-only. Open it to choose a detected player, a recent copied video link, or a playback action.

## Why use MPV?

This extension is for people who already use MPV and want web media in the same player setup as their local media: their playback configuration, key bindings, and scripts. Open the GNOME menu to choose a browser session, then play or queue it in MPV, continue from the reported position, or use audio-only playback. MPV and `yt-dlp` are required for streaming-site playback. The extension starts MPV itself; there is no browser-side extension or native-messaging helper to install and configure.

## What it does

- Detects media sessions published on MPRIS and lists the current and recently seen media.
- Opens a selected URL in MPV, optionally starts audio-only playback, or queues a URL in an existing MPV process.
- Shows MPV loading, playing, paused, and stopped controls in the extension menu.
- Keeps up to five copied HTTP(S) URLs in memory while the extension is enabled. It listens to GNOME Shell's clipboard selection change signal and reads only copied text that contains a URL. It neither changes the clipboard nor depends on a particular clipboard manager.
- Can read existing recent URL entries from a compatible local GNOME history service. This is an optional source; live URL tracking works without it or any clipboard-history extension.
- Uses the active MPRIS title when the copied URL matches a detected session. For YouTube links without a matching title, it requests the title for that exact URL from YouTube's public oEmbed endpoint. It does not search by title or artist. Other URL titles fall back to the host name.
- Shortens menu titles to 48 characters so long video names do not make the popup excessively wide. The full title and URL remain available in the row tooltip.

Only URLs are kept by the session tracker, in memory, and the list resets when the extension is disabled or GNOME Shell restarts. The optional history service can provide links copied before the extension was enabled. The extension does not read or import the private databases of individual clipboard manager applications, so it does not need separate integrations for each one.

## Browser support

No browser add-on or native-messaging helper is required. Automatic detection uses MPRIS, so a browser must publish a media player and enough metadata for the extension to identify its URL. Linux has no standard API for a Shell extension to enumerate every browser's tabs, and browser MPRIS implementations vary. A browser that publishes no MPRIS player cannot be detected automatically.

| Browser family | Detection path | Limit |
| --- | --- | --- |
| Firefox, Zen, Floorp, LibreWolf | MPRIS `xesam:url`, when supplied | Some browser/site combinations omit the URL. |
| Chromium, Chrome, Brave, Edge, Vivaldi, Opera | MPRIS page URL when supplied; YouTube video ID may be recovered from artwork metadata | Some sessions publish title and artwork without `xesam:url`. Artwork recovery works only for YouTube links. |
| Epiphany and other Linux browsers | MPRIS `xesam:url`, when supplied | Support depends on the browser's MPRIS implementation and metadata. |

When automatic detection is unavailable, copy a page URL while the extension is enabled, then choose it from the menu. The current clipboard can also be opened directly from the menu.

### YouTube title lookup

If MPRIS did not provide a title, the extension can request metadata for a copied YouTube URL from YouTube's oEmbed endpoint. The lookup uses the exact video URL, so it does not guess among search results. It may not return a title for private, unavailable, or restricted videos. The request is made when the extension menu is used and is limited to YouTube URLs. [YouTube oEmbed endpoint](https://www.youtube.com/oembed)

## GNOME Shell compatibility

`metadata.json` targets GNOME Shell 46 through 51. The code uses the GNOME 45+ ES module extension API and Shell UI components. The development environment used for this work is GNOME Shell 51.1. The other declared Shell versions still need runtime checks on their respective releases before claiming release-tested support.

## Requirements

- GNOME Shell 46–51
- MPV on `PATH`
- `yt-dlp` for streaming-site playback
- A browser publishing MPRIS for automatic media detection
- An internet connection to resolve a missing title for a YouTube link

You do not need to install a separate browser extension, native-messaging host, or per-browser helper. The GNOME Shell extension launches MPV directly. Direct media files may play without `yt-dlp`; streaming-site playback requires it.

Clipboard history tracking and playback control do not require a clipboard manager. Existing older history is optional and depends on whether a compatible local history service is installed.

## Playback behavior

- **Open Selected in MPV** starts the selected URL.
- **Queue Selected in Running MPV** appends the URL through MPV's IPC socket when available. If there is no socket, the extension starts another MPV process.
- **Open Selected Audio Only** starts MPV with video disabled. Pause/resume and stop remain available in the extension menu.
- **Open Current Clipboard URL** reads the clipboard on activation and opens its HTTP(S) URL.
- Selecting a recent copied URL opens it in MPV.

When a browser session reports `Playing`, the extension pauses it before opening the same item in MPV. If MPRIS provides a playback position, MPV starts there. MPV's normal user configuration remains in effect; the extension does not change `ytdl-format` or other preferences.

The default MPV IPC socket is `/tmp/mpvsocket`. If another process uses this path or MPV uses a different socket path, queueing may not connect. Opening a URL in MPV remains available.

## Install from a checkout

Run this from the repository root:

```sh
gnome-extensions pack . --extra-source=src
```

Install the generated ZIP with the GNOME Extensions app or the command line:

```sh
gnome-extensions install gnome-feed2mpv@alphabeast97.github.io.shell-extension.zip
gnome-extensions enable gnome-feed2mpv@alphabeast97.github.io
```

Use the actual ZIP filename printed by `gnome-extensions pack`. Depending on the GNOME Shell version, a logout and login may be needed before the updated extension is loaded.

## Troubleshooting

### A browser is missing from the menu

Check whether the browser exposes an `org.mpris.MediaPlayer2.*` player while media is playing. The extension can list only sessions it receives over D-Bus. If there is no MPRIS player, copy the page URL while the extension is enabled and choose it from the recent links.

If a player is present but provides neither a page URL nor a recognizable YouTube artwork URL, there may not be enough metadata to build a playback URL.

### A recent link has no video title

The menu uses a title from a matching MPRIS session when one exists. Otherwise, YouTube's exact-link metadata lookup may take a moment or may not return a title for restricted videos. For other sites, the fallback label is the host name because clipboard URLs do not include page titles.

### MPV does not start or cannot play a URL

Confirm that `mpv` is available on `PATH`. For YouTube and many streaming sites, confirm that MPV can find a current `yt-dlp` executable. Try the URL directly in MPV to distinguish a detection issue from a site or extractor issue.

## Project layout

```text
extension.js                 GNOME Shell entry point, panel button, and menu
metadata.json                Extension ID, description, and supported Shell versions
src/
  clipboard-history.js       Manager-independent clipboard URL tracking
  clipboard-utils.js         URL extraction and media labels
  history-providers/         Optional local history service adapters
  mpris.js                   Browser media discovery and recent sessions
  mpv-ipc.js                 MPV state and playback controls
  player.js                  MPV launching, queueing, and current clipboard action
  video-title.js             YouTube title lookup for exact video URLs
tests/                       Focused GJS checks for parsers and state handling
```

## Development and checks

Run the focused checks with GJS:

```sh
gjs -m tests/mpris.js
gjs -m tests/mpv-ipc.js
gjs -m tests/clipboard-history.js
gjs -m tests/menu-utils.js
```

GitHub Actions runs these checks and validates `metadata.json` on pushes, pull requests, and version tags.

Before release, package and install on each GNOME Shell version listed in `metadata.json`, then check enable/disable cleanup, the icon and menu, MPRIS discovery, copied-link tracking, title lookup, and MPV controls. Browser behavior should be checked against the exact browser builds being advertised because MPRIS metadata differs by browser and build.

## License

This extension is distributed under **GPL-2.0-or-later**. See [LICENSE](LICENSE).
