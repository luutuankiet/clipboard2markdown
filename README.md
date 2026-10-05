# Clipboard2Markdown

**Agent-Ready Markdown from Any Webpage.**

A client-side tool that converts complex HTML (tables, code blocks, nested lists) from authenticated platforms into clean Markdown. Perfect for pasting context into AI agents without granting them API access.

## Why This Exists

Workflow platforms don't let you copy as Markdown — you get rich text. But your AI agents need Markdown. And getting agents to authenticate to Jira/Confluence/Slack is painful or impossible.

**The solution:** Copy from any authenticated page → Paste here → Get clean Markdown → Paste to your agent.

## Supported Platforms

| Platform | Status | Notable Fixes |
|----------|--------|---------------|
| Jira | ✅ Full | Code blocks preserve newlines & indentation |
| Confluence | ✅ Full | Smart links, emoji, lists inside tables |
| Google Sheets | ✅ Full | Merged cells (rowspan/colspan), pipe escaping |
| Slack | ✅ Full | Code blocks, list formatting |
| Notion | 🔜 Planned | — |

## Features

- **🔄 Turndown.js Engine** — Robust GFM support (tables, task lists, strikethrough)
- **🧹 Platform Sanitizers** — Pre-process quirky HTML before conversion
- **🔒 Client-Side** — Nothing you paste leaves your browser. The one exception to *any* network traffic is the diagrams mode (below), which downloads the Excalidraw scenes your pasted links point to, read-only
- **🧭 Diagram round trip** — Turn excalidraw.com share links into Mermaid that agents can read, and let agents edit a canvas by link (see below)
- **🧪 Automated Testing** — Fixture-based regression suite prevents breakage
- **⚡ Vite Build System** — Hot reload dev server, optimized production builds

## Diagrams: Excalidraw links ⇄ Mermaid

For documents whose diagrams live as excalidraw.com share links (a screenshot plus the link, as in a Google Doc).

**Page: MD → MD (diagrams).** Paste Markdown; under each share link a fenced Mermaid *reading copy* of the canvas is inserted between `<!-- excalidraw-mermaid:begin <id> -->` / `end` markers. The rest of the text is unchanged byte-for-byte. Re-pasting replaces blocks rather than duplicating them, and **Strip diagram blocks** removes them all before you promote the document again.

Privacy: this mode sends one read-only `GET` per link to `json.excalidraw.com` (the backend named by the link) and decrypts the scene in your browser with the key in the link's `#` fragment. Nothing you paste is sent. The HTML → MD and MD → HTML modes make no network requests at all.

**CLI for agents** (`c2m diagrams`, Node 20+, any OS):

```bash
c2m diagrams expand doc.md [--write]      # same output as the page
c2m diagrams strip doc.md [--write]
c2m diagrams show '<share url>'           # or a local .excalidraw file
c2m diagrams edit '<share url>' --ops '[{"op":"rename","node":"auth","label":"Identity"}]'
```

`edit` patches the existing canvas (rename, add, connect, disconnect, relabel-edge, remove), keeps every untouched element exactly as it was, uploads the result and prints exactly one new share link. The old link keeps working. Node ids are the ones `show` prints. Uploading exists only in the CLI.

**New diagram from JSON** (`c2m excalidraw`, Node 20+, any OS): an agent describes boxes, labels and arrows in a short JSON array and gets back a share link, a Mermaid preview of what it drew, and layout warnings (overlaps, labels that do not fit, loose arrows). `c2m excalidraw --help` is the full manual: input format, worked example, sizing rules and the check-fix-upload loop.

```bash
c2m excalidraw diagram.json --no-upload   # check: preview + warnings only
c2m excalidraw diagram.json               # upload: link on line 1
cat diagram.json | c2m excalidraw -       # same, from stdin
```

The Mermaid is deliberately lossy: positions, colours, fonts and arrow curves are dropped; boxes, labels, connections, line style and grouping are kept. The canvas stays the master copy.

## Demo

**Live:** https://luutuankiet.github.io/clipboard2markdown/

![Screencast](screencast.gif)

## Command Line

Everything ships as one command, `clipboard2markdown`, also installed under the short name `c2m`. Run it without installing:

```bash
npx -y @luutuankiet/clipboard2markdown --help
npx -y @luutuankiet/clipboard2markdown excalidraw diagram.json
npx -y @luutuankiet/clipboard2markdown diagrams show '<share url>'
```

or install it once:

```bash
npm install -g @luutuankiet/clipboard2markdown
c2m --help
```

With no subcommand, `c2m` reads the clipboard, converts it (HTML to Markdown, or Markdown to HTML), and writes the result back. Clipboard conversion needs macOS. `c2m excalidraw` and `c2m diagrams` run anywhere Node 20+ runs. `c2m-diagrams` still works as an alias of `c2m diagrams`.

## Development

```bash
# Install dependencies
npm install

# Start dev server with hot reload
npm run dev

# Run regression tests
npm test

# Build for production
npm run build
```

### Adding Test Cases

No code required — just add files:

1. Save raw HTML to `tests/fixtures/{platform}/{case}.html`
2. Create expected output in `tests/fixtures/{platform}/{case}.md`
3. Run `npm test` — the runner auto-discovers new pairs

**Tip:** Use the "📋 Copy Raw HTML" button in the app to capture clipboard HTML for fixtures.

## Credits

Forked from [clipboard2markdown](https://github.com/euangoddard/clipboard2markdown) by Euan Goddard.

Modernized with:
- [Turndown.js](https://github.com/mixmark-io/turndown) (replacing to-markdown)
- [Vite](https://vitejs.dev/) build system
- Platform-specific sanitizers for Jira, Confluence, Google Sheets, Slack

## License

[![License][license-image]][license-url]

Released under the MIT License. See the [LICENSE](LICENSE) file
for details.

[license-image]: https://img.shields.io/npm/l/markdownlint.svg
[license-url]: http://opensource.org/licenses/MIT
