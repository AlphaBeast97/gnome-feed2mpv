# Contributing

Bug reports, accessibility feedback, documentation fixes, and focused code changes are welcome.

## Before opening an issue

- Search existing issues for the same problem.
- For a bug, include your GNOME Shell version, browser and version, playback site, and steps to reproduce.
- Do not include private video URLs, account details, clipboard contents, or unredacted logs.
- Report security issues privately using the instructions in [SECURITY.md](SECURITY.md).

## Changes

1. Fork the repository and create a branch for your change.
2. Keep each change focused and update the README or other documentation when behavior changes.
3. Run the checks from the repository root:

   ```sh
   gjs -m tests/mpris.js
   gjs -m tests/mpv-ipc.js
   gjs -m tests/clipboard-history.js
   gjs -m tests/menu-utils.js
   python3 -m json.tool metadata.json >/dev/null
   gnome-extensions pack . --extra-source=src --out-dir=/tmp
   ```

4. Open a pull request with the problem, the change, and the checks you ran.

The code targets GNOME Shell 46–51. Please state which Shell versions you tested; do not add a version to `metadata.json` based only on static inspection.
