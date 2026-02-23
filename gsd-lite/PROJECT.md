# Clipboard2Markdown

*Initialized: 2026-02-10*

## What This Is

A client-side webapp that converts copied web content (HTML) into clean Markdown — enabling seamless sharing with AI agents without requiring authentication to source systems. Paste from Jira, Confluence, Notion, Slack, Google Chat, or any webpage → get agent-ready Markdown.

## The Problem

Workflow platforms don't support copy/paste as Markdown. You copy rich text, paste rich text. But your agents need Markdown. And getting agents to authenticate to these platforms is painful or impossible.

## The Solution

Intercept clipboard → convert to Markdown → paste into agent chat.

```
Copy from Jira/Notion/Slack → Paste into webapp → Copy Markdown → Paste to agent
```

## Core Value

Bypass authentication walls: copy content from authenticated pages, paste, get Markdown that agents can consume without needing API access to the source.

## First-Class Conversions (Priority Order)

These must work reliably:

| Element | Input | Output |
|---------|-------|--------|
| **Fenced code blocks** | `<pre>`, `<code>`, platform-specific divs | ` ``` ` (generic, no language hint) |
| **Tables** | `<table>` with `<tr>`, `<td>`, `<th>` | Markdown pipe tables |
| **Headers** | `<h1>` - `<h6>` | `#` - `######` |
| **Inline code** | `<code>` (inline) | `` `code` `` |
| **Links** | `<a href="...">` | `[text](url)` |

### Edge Cases to Handle

- **Nested content:** Tables with code blocks inside cells
- **Images:** Convert to `![alt](src_url)` or placeholder `[image]`
- **Platform quirks:** Jira, Confluence, Notion, Slack, Google Chat all have different HTML structures

## Success Criteria

Project succeeds when:
- [x] HTML tables from Jira/Confluence convert to proper Markdown tables.
- [x] Fenced code blocks from Jira preserve newlines and indentation.
- [ ] Headers, inline code, and links convert reliably across all major platforms.
- [x] An automated regression test suite (`npm test`) runs and passes, preventing regressions.
- [x] The project has a modern developer workflow using Vite for hot reloading (`npm run dev`).
- [x] App opens directly in the main conversion view with a visible paste target that works on mobile and desktop.
- [x] Preview mode provides trust UX: rendered input preview, raw HTML source, and markdown preview, plus copy buttons for raw HTML and converted markdown.
- [x] Conversational platforms use a consistent annotation style (visible separators + italic metadata) so agents can parse Jira/Slack/Google Chat exports with minimal ambiguity.
- [ ] Debug bundle export uses XML-tagged `<debug_bundle>` format for fixture collection.

## Supported Sources

| Platform | Priority | Notes |
|----------|----------|-------|
| Jira | High | Tables, code blocks, tickets |
| Confluence | High | Documentation with tables |
| Notion | High | Mixed content |
| Slack | Medium | Messages, code snippets |
| Google Chat | Medium | Messages |
| Google Docs | Medium | Already has some support |
| GitHub | Low | Already Markdown-native mostly |

## Annotation Semantics Standard

For conversation-like exports, preserve structure explicitly so downstream agents do not need platform-specific heuristics:

- **Boundary marker:** visible separator between top-level threads or roots (for example `=== Thread 27064 ===` or `=== Root Chat 1 ===`).
- **Metadata line:** italic annotation before content that captures role/thread position, author, and timestamp.
- **Compatibility rule:** keep shape close across Jira, Slack, and Google Chat, then allow platform-specific tokens only where the source requires them.

This standard is now part of product intent, not just implementation detail, so future platform modules should default to this pattern.

## File Structure

```
.
├── index.html                 # Main app entry point
├── clipboard2markdown.js      # UI Controller (event handling)
├── vite.config.js             # Vite build configuration
├── package.json               # Project dependencies and scripts
│
├── src/
│   └── platforms/             # Platform-specific logic
│       ├── jira.js            # Jira rules and sanitizer
│       ├── common.js          # Generic rules
│       └── index.js           # Aggregator for all platforms
│
├── lib/                       # Third-party libraries (Turndown)
│
├── dist/                      # Production build output (generated)
│
├── tests/
│   ├── fixtures/              # HTML/Markdown test pairs
│   └── conversion.test.js     # Automated test runner script
│
└── gsd-lite/                  # Project management artifacts
    ├── PROJECT.md             # This file
    ├── WORK.md
    └── ARCHITECTURE.md
```

## Context

**Technical environment:**
- Client-side JavaScript webapp built with Vite.
- ES Modules for clean, modular code.
- Uses Turndown.js as the core conversion engine.
- Development via `npm run dev` (local dev server with hot reload).
- Deployment via `npm run build` (generates static assets for hosting, e.g., on GitHub Pages).
- Automated regression testing via `npm test`.

**Prior work:**
- Existing working webapp with custom rules for Jira, Confluence, Google Docs
- `clipboard2markdown.js` — controller with Pandoc-style converter rules
- `to-markdown.js` — embedded conversion engine (to be replaced)

**User needs:**
- Copy from authenticated pages (Jira tickets, internal docs) 
- Get Markdown without agents needing to authenticate
- Build test suite from real-world cases without leaking sensitive info

## Constraints

- **Public repo:** All committed content must be sanitized (no internal URLs, names, project codes)
- **Browser-only:** No server-side processing — the paste-based approach IS the feature
- **Automated Testing:** An `npm test` script uses `jsdom` to run all test fixtures in `tests/fixtures/` against the conversion logic, ensuring no regressions are introduced.
- **Generic code fencing:** Don't try to detect language — just use ``` without hints

## Architecture Decision

### 1. Turndown.js Migration
**Status:** Complete.
**Rationale:** Turndown is the maintained successor to the original library, has better GFM support (tables), and an active community.

### 2. Vite Build System
**Status:** Complete.
**Rationale:** Solves browser caching issues during development, provides a hot-reloading dev server for rapid feedback, and creates optimized, production-ready assets for deployment.

### 3. Modular `platforms/` Architecture
**Status:** In Progress.
**Rationale:** Separates platform-specific logic (e.g., for Jira, Confluence) from the core UI controller. This makes the codebase easier to maintain, extend, and test. Each platform module exports its own sanitizers and rules.

## Planned Features

### Debug Mode

**Status:** Partially implemented.

Implemented now:
- Preview mode with three tabs: rendered input preview, raw HTML source, markdown preview
- "Copy Raw HTML" and "Copy Converted Markdown" actions for fixture and workflow convenience
- Mobile-friendly main landing flow with visible paste target

Still planned:
- "Copy Debug Bundle" button that exports XML-tagged format
- Bundle is designed for agent-based evaluation and fixture authoring

```xml
<debug_bundle>
<raw_html>
<table class="jira-table">...</table>
</raw_html>

<markdown_output>
| col1 | col2 |
|------|------|
</markdown_output>
</debug_bundle>
```

### Test Workflow

1.  **Fixture Collection:** Use the preview mode and "Copy Raw HTML" action in the UI to capture real-world pasted HTML.
2.  **Sanitization:** Use an LLM prompt to remove sensitive information from the HTML.
3.  **Fixture Creation:** Save the sanitized HTML as `tests/fixtures/{platform}/{test-case}.html` and the correct, desired output as `{test-case}.md`.
4.  **Automated Verification:** Run `npm test`. The test runner will automatically find all fixture pairs, run the conversion, and fail if the output does not match the expected `.md` file.

**Goal:** Build a comprehensive test suite that prevents regressions and allows for confident refactoring.

---
*Update when project scope changes*