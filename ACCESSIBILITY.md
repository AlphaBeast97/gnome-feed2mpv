# Accessibility

The extension uses GNOME Shell's native panel button and popup menu so the entry point and menu actions follow Shell keyboard navigation and focus behavior. The panel icon has an accessible name that reports the current media or MPV state.

Long video titles are shortened visually in menu rows to keep the popup manageable. The full title is kept in each row's accessible name and tooltip, and the video URL is included in the tooltip. State is communicated with both the icon and the accessible status text rather than color alone.

If you encounter a keyboard, screen-reader, contrast, scaling, or other access issue, open an issue using the Accessibility report form and include your GNOME Shell version and steps to reproduce. Please do not include private clipboard contents or media URLs.
