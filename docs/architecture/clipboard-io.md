---
title: Clipboard I/O
covers: how the web app and CLI read and write the system clipboard
verified: 2026-09-16
---

# Clipboard I/O

The web app and CLI read the clipboard through fundamentally different
mechanisms. Understanding the difference matters because they behave differently
when apps register clipboard types without populating the data.

## Web app

The browser handles clipboard reading via the paste event on a `contenteditable`
div (`index.html:274`). The browser's paste handler is robust -- it falls through
clipboard types automatically. In HTML-to-MD mode, the pasted HTML is read from
`pastebin.innerHTML`. In MD-to-HTML mode, the visible text is read from
`pastebin.innerText`.

For writing, the "Copy for Google Docs" button (`clipboard2markdown.js:630`)
uses the Clipboard API to write both `text/html` and `text/plain` as a
`ClipboardItem`. This dual-type write is required because many apps only consume
plain text from the clipboard.

## CLI (macOS JXA)

`bin/cli.js` reads and writes the clipboard directly via JXA (`osascript -l
JavaScript`) calling AppKit's `NSPasteboard` API.

**Reading** (`readClipboard`, line ~20): checks the pasteboard types array for
`public.html`. If present AND the data is non-nil and non-empty, returns
`{ type: "html", content }`. Otherwise falls back to `public.utf8-plain-text`
and returns `{ type: "text", content }`.

The nil-check fallback is critical. Some apps (VS Code, TickTick) register
`public.html` as an available type but leave the data nil. Without the fallback,
the CLI reads empty content and silently exits.

**Writing HTML** (`writeHtmlToClipboard`, line ~68): writes the HTML string to a
temp file, then uses JXA to read it and write to the pasteboard as both
`public.html` and `public.utf8-plain-text`. Both types must be set -- writing
only `public.html` causes Cmd+V to produce nothing in most apps.

**Writing text** (`writeTextToClipboard`, line ~50): same temp-file pattern,
writes only `public.utf8-plain-text`.

## Direction detection

`detectDirection(clipboardType, forceToMd, forceToHtml)` at line ~97:
- `--to-md` flag forces HTML-to-Markdown
- `--to-html` flag forces Markdown-to-HTML
- Auto-detect: `public.html` with data -> `to-md`, plain text -> `to-html`
