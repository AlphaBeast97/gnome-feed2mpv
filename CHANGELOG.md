# Changelog

## Unreleased

- Explain that the GNOME Shell extension launches MPV directly and does not need a separate browser helper.
- Guard asynchronous MPV and clipboard callbacks so nothing runs after the extension is disabled.
- Read the history service's `at` timestamp so imported links keep their recency order, and add a GJS check for it.
- Defer menu rebuilds while the popup is open so keyboard focus and scroll position are kept.
- Watch the MPV socket directory instead of retrying the connection every second, and move the socket to `$XDG_RUNTIME_DIR/mpvsocket`.
- Remove non-functional row tooltips; full titles remain in each row's accessible name.
- Declare clipboard reading and the YouTube title request in the extension description.
- Follow the Shell theme instead of setting hardcoded icon colors, and silence MPV's inherited standard output.
- Package `LICENSE` with the extension and remove a duplicated CI check.
- Remove the pre-rename `youtube-to-mpv@alphabeast97.github.io` install in the new install script, and warn when it is still present, so both builds cannot run as two panel icons.
- List only copied links that point at media files or recognized streaming sites, so ordinary web links stay out of the clipboard history.

## 1.0.2

- Rename the project and extension to GNOME Feed2MPV.
- Change the extension UUID to `gnome-feed2mpv@alphabeast97.github.io`. Existing installs under the old UUID must be disabled or removed, then the renamed extension installed and enabled.
- Clarify that browser media detection and copied-link playback are general; YouTube is used only for optional artwork URL recovery and exact-link title lookup.

## 1.0.1

- Keep long menu titles visually concise while preserving full accessible names.
- Complete repository contribution, conduct, security, issue, pull request, and accessibility guidance.
- Explain the intended MPV use case in the README.

## 1.0.0

- Detect browser media through MPRIS and show multiple current and recently seen streams.
- Open selected media in MPV, queue it into a running player, and control audio-only playback.
- Track the five most recently copied HTTP(S) links while enabled, independent of clipboard manager choice.
- Resolve missing YouTube titles from exact video URLs and cap displayed menu titles at 48 characters.
- Declare GNOME Shell 46 through 51 in extension metadata.
- Add GJS checks through GitHub Actions.
