# Project brief

GNOME Feed2MPV is a GNOME Shell extension for choosing browser media sessions and recent copied HTTP(S) links from the Shell menu, then playing them in MPV.

## Integration

- Run as a GNOME Shell extension using the GNOME 45+ ES module API.
- Launch MPV directly from GNOME Shell. Do not require a browser extension, native-messaging host, or per-browser helper.
- Discover browser media through MPRIS and use copied URLs as a browser-independent fallback.
- Treat MPRIS metadata as optional and incomplete: only advertise automatic detection when a player provides a usable URL or supported YouTube artwork metadata.
- Keep YouTube-specific behavior limited to optional artwork URL recovery and exact-URL title lookup. Playback of copied HTTP(S) URLs is not YouTube-specific.

## Playback

- Require MPV; require `yt-dlp` for streaming-site playback.
- Support starting selected media, audio-only playback, and MPV controls from the extension menu.
- Pause a matching playing browser session before handoff and resume from its reported position when available.
- Preserve the user's MPV configuration and avoid blocking I/O in GNOME Shell.

## Compatibility and lifecycle

- Metadata currently declares GNOME Shell 46–51; only claim runtime-tested versions after checking them on those Shell releases.
- Disconnect D-Bus and clipboard signals, cancel outstanding work, and destroy UI objects in `disable()`.
- Keep clipboard tracking manager-independent, limited to URLs, and in memory while the extension is enabled.
