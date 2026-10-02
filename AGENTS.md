# clipboard2markdown

Bidirectional clipboard converter: HTML-to-Markdown (Turndown) and
Markdown-to-HTML (Marked). Runs client-side as a web app and as a
macOS CLI for Alfred integration. A third mode and a second CLI turn
excalidraw.com share links into Mermaid and edit canvases by link. Fork of
euangoddard/clipboard2markdown with platform-specific rules for Jira,
Confluence, Slack, Google Docs/Sheets/Chat.

## Hard constraints

- **Client-side only; pasted content never leaves.** No server of our own, and
  nothing the user pastes is ever sent anywhere. The HTML -> MD and MD -> HTML
  modes make no network requests at all. The single exception is the
  MD -> MD (diagrams) mode: read-only `GET`s to the Excalidraw backend named in
  each pasted share link, loaded lazily so other modes never pull that code.
  Uploading exists only in `bin/diagrams.js`. See
  `docs/adr/0002-diagrams-mode-network-reads.md`. This is a
  trust property the README promises users.
- **Platform rules are additive.** Each platform module exports `rules` and a
  `sanitizer`; new platforms never modify existing ones. Register in
  `src/platforms/index.js`.
- **The CLI uses JXA for clipboard I/O.** macOS-only. It reads/writes
  `public.html` and `public.utf8-plain-text` pasteboard types via `osascript`.
  Both types must be written for paste to work in most apps.
- **Fixture-based tests.** Add `.html`/`.md` pairs under `tests/fixtures/` --
  the runner discovers them automatically. No test code needed.

## Directory layout

```
bin/cli.js                  CLI entry point (Alfred workflow)
bin/diagrams.js             Diagram CLI for agents: expand, strip, show, edit
clipboard2markdown.js       Web UI controller (paste events, preview, copy)
index.html                  Web app shell
src/converter.js            HTML-to-MD pipeline (Turndown + post-processing)
src/md-to-html.js           MD-to-HTML pipeline (Marked + Google Docs styling)
src/diagrams/               Excalidraw share links <-> Mermaid, shared by page and CLI
src/platforms/              Platform-specific sanitizers and Turndown rules
  index.js                  Aggregator -- imports all platforms
  jira.js                   Jira rules and sanitizer
  confluence.js             Confluence rules and sanitizer
  slack.js                  Slack rules and sanitizer
  google-docs.js            Google Docs rules and sanitizer
  google-sheets.js          Google Sheets rules and sanitizer
  google-chat.js            Google Chat rules and sanitizer
  common.js                 Cross-platform rules and sanitizer
tests/                      Fixture-based regression suite
  conversion.test.js        HTML-to-MD fixture runner
  md-to-html.test.js        MD-to-HTML fixture runner
  cli.test.js               CLI unit tests (detectDirection)
  fixtures/                 Per-platform HTML/MD fixture pairs
  fixtures-md-to-html/      MD/HTML fixture pairs for reverse direction
  diagrams/                 Diagram tests: scene fixtures, Markdown, edit, CLI
  fixtures-diagrams/        Synthetic .excalidraw scenes + expected .mmd
  fixtures-diagram-md/      <name>.input.md / <name>.expected.md pairs
docs/                       Project documentation
scripts/gen-docs-index.sh   Regenerates docs/README.md index
```

## Build and check

```bash
npm run dev                # Vite dev server with HMR
npm run build              # Production build to dist/
npm test                   # vitest -- fixture-based regression suite
scripts/gen-docs-index.sh  # Regenerate documentation index
```

<!-- Standard block. Everything above belongs to this project; everything below is
     the pointer every repo laid out this way carries. -->

## Documentation

Indexed in [docs/README.md](docs/README.md). Every page is self-contained -- it
assumes you opened that one file and have nothing else loaded.

| where | what | read it |
|---|---|---|
| [architecture/](docs/architecture/) | where behaviour lives, one page per area | before going looking for something |
| [traps/](docs/traps/) | failure modes with no error message, indexed by symptom | before debugging something wrong but not crashing |
| [reference/](docs/reference/) | simply true, expensive to re-derive | when you need the detail |
| [adr/](docs/adr/) | why the repo is the way it is | before changing something that looks odd |

## Before you wrap up

Leave the repo holding what this session cost you to find out. Four rules.

1. **Sort it, and expect most of it to go nowhere.** A next action is an issue. A
   durable, expensive-to-re-derive fact is a page. A choice that was hard to
   reverse, surprising without context and a real trade-off is a decision record
   under `docs/adr/`. Status, dates, version pins and plans are none of those --
   delete them.
2. **A doc is the last resort.** Type error -> test -> comment at the site -> doc.
   Name the single line you would have commented instead; if you can name it,
   comment it and stop.
3. **Verify against running code before writing, and date the page `verified:`.**
   Anything remembered from earlier in the session is stale until re-read. Deleting
   a draft because the problem is already fixed is a success.
4. **Append, never rewrite.** Supersede a merged decision record with a new one
   naming what it replaces. A trap filename is an identifier quoted elsewhere:
   edit the body, never the name.

Then run `scripts/gen-docs-index.sh`. Never hand-maintain an index.
