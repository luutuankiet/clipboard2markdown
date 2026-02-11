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
- **🔒 100% Client-Side** — No data leaves your browser
- **🧪 Automated Testing** — Fixture-based regression suite prevents breakage
- **⚡ Vite Build System** — Hot reload dev server, optimized production builds

## Demo

**Live:** https://luutuankiet.github.io/clipboard2markdown/

![Screencast](screencast.gif)

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
