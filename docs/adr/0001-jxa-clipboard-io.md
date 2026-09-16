# JXA for CLI clipboard I/O instead of pbcopy/pbpaste

The CLI uses `osascript -l JavaScript` (JXA) to read and write the macOS
clipboard instead of the simpler `pbcopy`/`pbpaste` commands. `pbcopy` and
`pbpaste` only handle `public.utf8-plain-text` -- they cannot read or write
`public.html`, which is required for detecting whether the clipboard contains
rich HTML (for the HTML-to-Markdown direction) and for writing styled HTML that
apps like Slack and Google Docs can paste as formatted content.

The cost is macOS-only, more complex code, and the JXA bridge's quirks around
nil handling (see `docs/traps/NIL_HTML_CLIPBOARD_TYPE.md`).
