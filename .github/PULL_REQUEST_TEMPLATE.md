## What changed


## Why


## Checks

- [ ] `gjs -m tests/mpris.js`
- [ ] `gjs -m tests/mpv-ipc.js`
- [ ] `gjs -m tests/clipboard-history.js`
- [ ] `gjs -m tests/menu-utils.js`
- [ ] `python3 -m json.tool metadata.json >/dev/null`
- [ ] Packaged the extension with `gnome-extensions pack . --extra-source=src --out-dir=/tmp`

GNOME Shell versions checked:


## Checklist

- [ ] Updated documentation when behavior changed.
- [ ] Added or updated a focused test where practical.
- [ ] Removed private URLs, usernames, and personal information from screenshots and logs.
