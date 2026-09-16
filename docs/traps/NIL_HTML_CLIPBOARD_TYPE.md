---
symptom: "CLI prints nothing and exits, clipboard unchanged, after copying from VS Code or TickTick"
area: clipboard I/O
verified: 2026-09-16
---

# NIL_HTML_CLIPBOARD_TYPE

Some macOS apps register `public.html` as an available pasteboard type without
actually populating the data. VS Code's Markdown editor and TickTick sticky
notes both do this. The pasteboard's `types` array includes `public.html`, but
`dataForType("public.html")` returns nil.

**Mechanism:** The CLI's `readClipboard()` checked `types.indexOf("public.html")
!= -1` and committed to reading HTML. With nil data,
`NSString.alloc.initWithDataEncoding(nil, ...)` returned nil, content became
empty string, and the empty-clipboard guard exited with code 1. No error, no
output.

The web app was unaffected because the browser's paste handler falls through
clipboard types automatically -- if `public.html` data is nil, the browser reads
`public.utf8-plain-text` instead.

**Fix:** `readClipboard()` now checks `!data.isNil()` and validates the decoded
string is non-empty before committing to the HTML path. If either check fails,
it falls through to `public.utf8-plain-text`. See `bin/cli.js:25-38`.

**How to verify:** Copy text from VS Code's Markdown editor, run the CLI. The
stderr output should show `c2m: text -> html (N chars)`, confirming it fell back
to plain text and converted successfully.
