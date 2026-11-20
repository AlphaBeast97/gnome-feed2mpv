# YouTube to MPV

A GNOME Shell panel extension for finding browser media sessions and opening their URLs in MPV. You can choose among detected sessions and recently seen media, open a copied URL, queue another URL in an already running MPV, and control MPV playback from the extension menu.

The panel indicator is icon-only. Its icon changes for searching, no detected media, ready media, MPV loading, playback, and pause. The menu provides the corresponding status text and media choices.

## Compatibility

### GNOME Shell

The extension declares GNOME Shell **46, 47, 48, 49, 50, and 51** in `metadata.json`. It uses the GNOME 45+ ES module extension API and Shell UI components, plus Gio D-Bus and subprocess APIs. The development machine used for this release work is GNOME Shell 51.1; the older declared versions still need a runtime check on their respective Shell releases before claiming release-tested support.

### Browsers

There is no Linux API that lets a Shell extension enumerate every browser's tabs. Automatic detection depends on a browser publishing a media session on the desktop's MPRIS D-Bus interface. Browsers vary in whether they publish it and which metadata they include. This table describes the detection path, not a guarantee for every browser release or configuration.

| Browser family | Detection path | Limit |
| --- | --- | --- |
| Firefox, Zen, Floorp, and LibreWolf | MPRIS `xesam:url`, when supplied | A browser or site can omit the page URL. |
| Chromium, Chrome, Brave, Edge, Vivaldi, Opera | MPRIS page URL when supplied; for YouTube, a video ID can sometimes be recovered from the MPRIS artwork thumbnail | Chromium-family sessions may publish a title and artwork without `xesam:url`. Artwork fallback is YouTube-specific. A browser that publishes no MPRIS player cannot be detected automatically. |
| Epiphany and other Linux browsers | MPRIS `xesam:url`, when supplied | Support depends on that browser's MPRIS implementation and metadata. |

For any browser, use **Open Current Clipboard URL** or a recent Isle clipboard URL when automatic discovery is unavailable. The extension reads the current desktop clipboard only after you activate an action that needs it. It reads recent Isle history through Isle's read-only D-Bus API when Isle is running and its clipboard history is available. It does not write to the clipboard or call Isle's history mutation methods. Without Isle, recent-history entries are unavailable; current clipboard playback is still available.

## What the extension detects

The extension monitors MPRIS players and presents current media sessions together with up to five recently seen URLs per player (up to twenty recent entries overall). When a browser publishes a usable page URL, selecting the session opens that URL in MPV. It pauses the browser session when it reports `Playing` and starts MPV at the reported position when available.

Some Chromium-family browser builds expose YouTube's thumbnail URL as `mpris:artUrl` but omit `xesam:url`. In that case, the thumbnail's video ID can identify the YouTube video. It cannot recover a general website URL from a title or artist name.

### About title and artist search on YouTube

Querying YouTube for every MPRIS title and artist is technically possible with asynchronous libsoup requests, but it is not a dependable automatic fallback. Search results can select a different upload, edit, live version, or cover. YouTube's result-page markup is not a stable extension API and may vary with consent pages, localization, and anti-bot behavior. The request would also send media titles from arbitrary apps to YouTube. For these reasons, this extension does **not** perform that lookup automatically. A deliberate, disclosed “Search YouTube for this title” action could be considered later, with clear user initiation and a reliable supported search interface.

The proposed Tier 2 approach also cannot fix a browser that does not publish an MPRIS session at all: it needs the session's title and artist as input. It is useful only for sessions that exist but lack `xesam:url`, and remains a best-effort identification method.

## MPV behavior

- **Open Selected in MPV** starts the selected URL in MPV.
- **Queue Selected in Running MPV** appends the selected URL through MPV's IPC socket when available. If no socket is available, it opens the URL in a new MPV process.
- **Open Selected Audio Only** starts MPV with video disabled. Pause/resume and stop controls remain available in the extension menu even though MPV has no visible window.
- **Open Current Clipboard URL** reads the current clipboard on activation and opens its HTTP(S) URL.
- Recent Isle clipboard URLs appear in the menu when Isle's D-Bus service is available. Choosing one opens it in MPV.

MPV is launched with its normal user configuration. The extension does not change `ytdl-format` or other MPV preferences. YouTube playback generally requires a working `yt-dlp` installation configured for MPV.

The default MPV IPC socket path is `/tmp/mpvsocket`. If another process uses that path or MPV is configured with a different socket, queueing may not connect; opening in MPV remains available.

## Requirements

- GNOME Shell 46–51
- MPV on `PATH`
- `yt-dlp` for sites that MPV cannot play directly
- Isle for recent Isle clipboard-history entries (optional)
- A browser with MPRIS support for automatic browser-media detection

## Install from a checkout

From this directory, package the extension:

```sh
gnome-extensions pack . \
  --extra-source=mpris.js \
  --extra-source=player.js \
  --extra-source=mpv-ipc.js \
  --extra-source=clipboard-history.js
```

Install the generated ZIP using the GNOME Extensions app, or:

```sh
gnome-extensions install youtube-to-mpv@alphabeast97.github.io.shell-extension.zip
gnome-extensions enable youtube-to-mpv@alphabeast97.github.io
```

Replace the ZIP filename with the generated filename if it differs. Log out and back in if the Shell version requires a session restart to load a newly installed extension.

## Troubleshooting

### A browser is missing from the menu

Check whether the browser exposes an `org.mpris.MediaPlayer2.*` player while media is playing. The extension can only list sessions it receives on D-Bus. If there is no MPRIS player, copy the page URL and use the clipboard action or select it from Isle history.

If a player appears but its title has no URL and the media is not a YouTube video with a recognizable thumbnail, the browser has not provided enough information for this extension to form a playback URL.

### Clipboard history is empty

The history section reads Isle's `io.github.zickrian.isle.Daemon` service and only inspects recent link and text entries containing HTTP(S) URLs. Isle must be running and its clipboard-history feature must be enabled. This is separate from tools such as `cliphist`; those histories are not read. The current clipboard action does not depend on Isle.

### MPV does not start or cannot play a URL

Confirm that `mpv` is available on `PATH`. For YouTube and many streaming sites, confirm that MPV can find a current `yt-dlp` executable. Try the URL directly in MPV to distinguish an extension detection issue from a site or extractor issue.

## Development and checks

The source is split by responsibility:

- `extension.js` owns the panel button, menu, selection, and lifecycle cleanup.
- `mpris.js` discovers MPRIS players, parses media metadata, and retains recent URLs.
- `player.js` starts MPV, queues URLs, pauses the source browser, and reads the current clipboard on request.
- `mpv-ipc.js` tracks MPV state and sends pause, resume, and stop commands.
- `clipboard-history.js` reads recent Isle URL entries without modifying Isle's history.

Run the focused checks with GJS:

```sh
gjs -m tests/mpris.js
gjs -m tests/mpv-ipc.js
gjs -m tests/clipboard-history.js
```

Before release, also package and install on each GNOME Shell major version listed in `metadata.json`, then check enable/disable cleanup, the panel icon and menu, MPRIS discovery, clipboard actions, and MPV controls. Browser behavior should be checked against the exact browser builds being advertised because MPRIS metadata differs between builds.

## License

This extension is distributed under **GPL-2.0-or-later**. See [LICENSE](LICENSE).
