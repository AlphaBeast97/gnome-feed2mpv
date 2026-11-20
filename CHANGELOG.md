# Changelog

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
