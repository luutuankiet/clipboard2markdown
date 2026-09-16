---
symptom: "CLI says it converted but Cmd+V pastes nothing into the target app"
area: clipboard I/O
verified: 2026-09-16
---

# MISSING_PLAIN_TEXT_FALLBACK

When converting Markdown to HTML, the CLI wrote only `public.html` to the
pasteboard. Most macOS apps require `public.utf8-plain-text` to be present for
Cmd+V to work. With only `public.html` set, the paste target saw no content it
could consume and pasted nothing.

The web app did not have this problem because the "Copy for Google Docs" button
used the Clipboard API to write both `text/html` and `text/plain`.

**Fix:** `writeHtmlToClipboard()` now sets both `public.html` and
`public.utf8-plain-text` on the pasteboard. The plain text fallback contains the
raw HTML string, which apps that support rich paste will ignore in favor of the
`public.html` type. See `bin/cli.js:77`.

**How to verify:** Run the CLI on plain text content, then Cmd+V into any app.
The converted HTML should paste as rich text in apps that support it (Slack,
Google Docs) and as raw HTML string in plain text fields.
