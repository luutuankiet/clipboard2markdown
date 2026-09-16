---
title: Conversion pipeline
covers: how content is converted between HTML and Markdown, the two directions
verified: 2026-09-16
---

# Conversion pipeline

Two directions, each with its own library and pipeline.

## HTML to Markdown (Turndown)

Entry: `src/converter.js:89` (`convert` function).

Pipeline:
1. `sanitizeHTML(html)` -- parses to DOM, runs all platform sanitizers via
   `src/platforms/index.js`. Each platform's `sanitizer(doc)` mutates the DOM
   in-place (e.g. Jira fixes table structures, Slack extracts thread metadata).
2. `turndownService.turndown(sanitizedHtml)` -- converts DOM to Markdown using
   GFM plugin and all platform-specific Turndown rules.
3. `escape(str)` -- post-processing: smart quote normalization, placeholder
   replacement (`{{TABLE_BR}}`, `{{PIPE}}`, `{{GS_*}}`), whitespace cleanup.

The escape function also undoes Turndown's default underscore escaping (line ~37)
because underscores mid-word don't trigger emphasis in CommonMark.

## Markdown to HTML (Marked)

Entry: `src/md-to-html.js:157` (`convertMdToHtml` function).

Pipeline:
1. `escapeXmlLikeTags(markdown)` -- escapes non-standard HTML tags so
   `<current_mode>` renders as literal text.
2. `marked.parse(escapedMd)` -- parses Markdown to HTML with GFM enabled.
3. `preserveNewlinesInHtml` -- converts `\n` to `<br>` in text nodes outside
   of `<pre>`, `<code>`, `<table>`, `<ol>`, `<ul>`, `<li>`.
4. `preserveWhitespaceAfterBr` -- converts spaces after `<br>` to `&nbsp;`.
5. `fixNestedListsForGoogleDocs` -- adds inline styles for nested list display.
6. `applyGoogleDocsTableStyles` -- blue headers, 0.5pt borders, padding.

The output is HTML with inline styles specifically for Google Docs paste
compatibility. The web app writes it to the clipboard as both `text/html` and
`text/plain`; the CLI writes both `public.html` and `public.utf8-plain-text`.

## Adding a new platform

1. Create `src/platforms/<name>.js` exporting `{ rules: [...], sanitizer: fn }`.
2. Import and register in `src/platforms/index.js`.
3. Add fixture pairs in `tests/fixtures/<name>/`.

See `src/platforms/jira.js` (~300 lines) for a complete example of sanitizer +
rules working together.
