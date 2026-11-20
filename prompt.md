Build a GNOME Shell extension (targeting GNOME Shell 46 to 51 [if possible] on Wayland) that detects when YouTube is open/playing in a browser and lets me open the video directly in `mpv` (using `yt-dlp`). It will live in the top bar of gnome. Design it cleanly so it can be expanded later with IPC controls, quality presets, and shortcuts.

Follow a strict two-phase workflow:

### Phase 1: Environment & D-Bus MPRIS Discovery (Run First)

Before creating any files, inspect my local environment and report your findings:

1. Check `gnome-shell --version`, `mpv --version`, and `yt-dlp --version`.
2. Check `~/.local/share/gnome-shell/extensions/` to see any existing custom extensions I have installed and match their ESM structure and conventions.
3. Read `~/.config/mpv/mpv.conf` (if it exists) so the extension does not conflict with or override my existing `mpv` / `ytdl-format` settings.
4. Inspect live session D-Bus MPRIS interfaces (`busctl --user list | grep -i mpris` and `gdbus introspect` / `Properties.GetAll` on `org.mpris.MediaPlayer2.Player`) to verify what metadata properties (`xesam:url`, `mpris:artUrl`, `xesam:title`, `Position`, `PlaybackStatus`) active browsers expose on this system.
5. Present a brief summary of what you found and confirm the file layout before writing the implementation.

### Phase 2: Implementation Requirements

Once discovery is complete, build the extension with these exact specifications:

- **Modern ESM Architecture:** Target `"shell-version": ["46", ..., "51"]` in `metadata.json`. Use standard GNOME 45+ ESM imports (`gi://Gio`, `gi://GLib`, `gi://St`, `resource:///org/gnome/shell/...`). Write clean, modular, comment-free code.
- use youtube as a starting point support everything that is possible tho
- **Cross-Browser YouTube Detection (MPRIS + Clipboard Fallback):**
  - Watch `org.freedesktop.DBus` (`NameOwnerChanged`) and `org.freedesktop.DBus.Properties` (`PropertiesChanged`) for browser MPRIS players (`org.mpris.MediaPlayer2.*`).
  - Extract the YouTube URL from `xesam:url` (Firefox/Zen) when matching `youtube.com` or `youtu.be`.
  - For Chromium-based browsers (Chrome/Brave) where `xesam:url` is often empty, parse the 11-character video ID from `mpris:artUrl` (`i.ytimg.com/vi/<ID>/...`) and reconstruct `https://www.youtube.com/watch?v=<ID>`.
  - Read `Position` (microseconds -> integer seconds) so playback resumes at the exact timestamp.
  - Include a clipboard fallback (`St.Clipboard`) if no active YouTube MPRIS session is found when triggered.
- **Top Panel Indicator & Extensible Menu (`PanelMenu.Button`):**
  - Place a clean icon in the top panel that visually highlights/activates when a watchable YouTube video is detected.
  - **Primary Click / Action:** Call `.Pause()` asynchronously on the browser's MPRIS interface so the tab stops playing, then spawn `mpv` asynchronously via `Gio.Subprocess` with `--start=<seconds>` (if `> 0`) and `--input-ipc-server=/tmp/mpvsocket`.
  - **Dropdown Menu (built for future expansion):** Include items for:
    - *Open in MPV* (default video playback)
    - *Queue in Running MPV* (send `{"command": ["loadfile", url, "append-play"]}` to `/tmp/mpvsocket` via `Gio.SocketClient` if the socket is active, otherwise launch `mpv`)
    - *Open Audio Only* (`--no-video`)
    - *Open Clipboard URL in MPV*
    - others that suite it
- **Compositor Safety:** Never use synchronous/blocking I/O or `GLib.spawn_command_line_sync` inside `gnome-shell`. Disconnect all D-Bus signals and destroy UI elements cleanly in `disable()`.

### Phase 3: Install & Verification

1. Install the extension into `~/.local/share/gnome-shell/extensions/<uuid>` and verify `gnome-extensions info <uuid>` parses cleanly without errors.
2. do proper testing i will do the final verification when it is installed on my system 

NOTE: Start a git repo with every commit being scopped 
