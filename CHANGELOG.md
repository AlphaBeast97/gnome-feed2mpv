# Changelog

## 1.2.0

- Align extension architecture with GNOME Extension Review Guidelines.
- Extract media menu UI logic into a dedicated module (`MediaMenu`).
- Replace boolean destruction flags with `Gio.Cancellable` propagation and generation tracking.
- Isolate clipboard reading from background player logic and defer YouTube oEmbed title lookups until the menu opens.
- Remove the MPV queue action in favor of clean single-player playback and playback controls.
- Prioritize actively playing browser sessions on MPRIS updates so the current video is selected automatically.
- Maintain full compatibility with Zen Browser and other MPRIS players.

## 1.1.5

- Parse media URLs once during clipboard and MPRIS processing.

## 1.1.4

- Remove redundant state guards where initialization and teardown already guarantee the required objects.
- Drop an unreachable playback-status label and simplify clipboard URL handling.

## 1.1.2

- Correct the clipboard explanation: text is read through `St.Clipboard` and changes are detected through `Meta.Selection`'s `owner-changed` signal, rather than through a single Shell API.
- Disclose the title lookup's network request in the README: when the menu opens, copied YouTube links without a known title are sent to `www.youtube.com/oembed`, with no cookies, credentials, or other clipboard contents.

## 1.1.1

- Destroy the panel icon and status row explicitly in `disable()` to satisfy extension review cleanup checks.
- Document the extension's read-only clipboard access for extension reviewers.

## 1.1.0

- Guard asynchronous MPV and clipboard callbacks so nothing runs after the extension is disabled.
- Read the history service's `at` timestamp so imported links keep their recency order, and add a GJS check for it.
- Defer menu rebuilds while the popup is open so keyboard focus and scroll position are kept.
- Watch the MPV socket directory instead of retrying the connection every second, and move the socket to `$XDG_RUNTIME_DIR/mpvsocket`.
- Remove non-functional row tooltips; full titles remain in each row's accessible name.
- Declare clipboard reading and the YouTube title request in the extension description.
- Follow the Shell theme instead of setting hardcoded icon colors, and capture MPV's output instead of inheriting it.
- Package `LICENSE` with the extension and remove a duplicated CI check.
- List only copied links that point at media files or recognized streaming sites, so ordinary web links stay out of the clipboard history.
- Show MPV's own error in a notification when a launched or queued link cannot be played, instead of failing without feedback.

## 1.0.3

- Explain that the GNOME Shell extension launches MPV directly and does not need a separate browser helper.

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
