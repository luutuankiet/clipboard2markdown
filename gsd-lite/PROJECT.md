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
- [ ] HTML tables convert to proper Markdown tables (currently broken)
- [ ] Fenced code blocks preserve correctly from various sources
- [ ] Headers, inline code, and links convert reliably
- [ ] Nested content (code in tables) doesn't break
- [ ] Debug mode shows raw HTML + Markdown output for test collection
- [ ] Test fixtures exist for regression prevention

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

## File Structure

```
clipboard2markdown/
├── index.html              # Main webapp entry
├── clipboard2markdown.js   # Controller + custom rules
├── to-markdown.js          # Engine (migrating to Turndown)
├── bootstrap.css           # Styling
│
├── gsd-lite/               # Project management
│   ├── PROJECT.md          # This file
│   ├── WORK.md             # Session logs
│   └── ARCHITECTURE.md     # Codebase map
│
└── tests/
    └── fixtures/           # Real-world test cases (sanitized)
        ├── jira/
        │   ├── table-01.html
        │   ├── table-01.expected.md
        │   ├── code-block-01.html
        │   └── code-block-01.expected.md
        ├── confluence/
        │   └── ...
        ├── notion/
        │   └── ...
        ├── slack/
        │   └── ...
        └── google-chat/
            └── ...
```

## Context

**Technical environment:**
- Client-side JavaScript webapp (runs in browser)
- Currently uses `to-markdown.js` (old fork) — migrating to Turndown.js
- No server required — paste-based workflow is the auth bypass
- Public GitHub repo — test fixtures need sanitization

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
- **Manual testing:** CI can't auto-run paste events — agent-as-oracle for eval
- **Generic code fencing:** Don't try to detect language — just use ``` without hints

## Architecture Decision

**Migrate from `to-markdown.js` → Turndown.js**

Rationale:
- Turndown is the maintained successor (same author, 10k+ stars)
- GFM plugin has table support (likely fixes current bug)
- Custom rules port from `pandoc` array → `addRule()` calls
- Same client-side, paste-based architecture preserved

## Planned Features

### Debug Mode

Toggle in UI to show raw HTML alongside Markdown output:
- "Copy Debug Bundle" button exports XML-tagged format
- Enables test fixture collection and agent-based evaluation

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

1. Collect real HTML via debug mode
2. Sanitize with LLM prompt (mask names, URLs, project codes)  
3. Commit as test fixtures to `tests/fixtures/{platform}/`
4. Agent evaluates conversion quality (pass/fail with rubric)

**Goal:** Regression prevention — don't break what works.

---
*Update when project scope changes*
