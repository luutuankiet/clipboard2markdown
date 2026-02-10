# Clipboard2Markdown

*Initialized: 2026-02-10*

## What This Is

A client-side webapp that converts copied web content (HTML) into clean Markdown — enabling seamless sharing with AI agents and local documentation without requiring authentication to source systems. Paste from Jira, Confluence, Google Docs, or any webpage → get agent-ready Markdown.

## Core Value

Bypass authentication walls: copy content from authenticated pages, paste, get Markdown that agents can consume without needing API access to the source.

## Success Criteria

Project succeeds when:
- [ ] HTML tables convert to proper Markdown tables (currently broken)
- [ ] Code blocks (fenced) preserve correctly from various sources
- [ ] Links and structure maintained through conversion
- [ ] Debug mode shows raw HTML + Markdown output for test collection
- [ ] Test fixtures can be sanitized (via LLM) and committed to public repo

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

## Architecture Decision

**Migrate from `to-markdown.js` → Turndown.js**

Rationale:
- Turndown is the maintained successor (same author, 10k+ stars)
- GFM plugin has table support (likely fixes current bug)
- Custom rules port from `pandoc` array → `addRule()` calls
- Same client-side, paste-based architecture preserved

## Planned Features

**Debug Mode:**
- Toggle in UI to show raw HTML alongside Markdown output
- "Copy Debug Bundle" button exports XML-tagged format:
  ```xml
  <debug_bundle>
  <raw_html>...</raw_html>
  <markdown_output>...</markdown_output>
  </debug_bundle>
  ```
- Enables test fixture collection and agent-based evaluation

**Test Workflow:**
1. Collect real HTML via debug mode
2. Sanitize with LLM prompt (mask names, URLs, project codes)
3. Commit as test fixtures
4. Agent evaluates conversion quality (pass/fail with rubric)

---
*Update when project scope changes*
