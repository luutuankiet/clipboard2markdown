# GSD-Lite Work Log

---

## 1. Current Understanding (Read First)

<current_mode>
execution — Turndown migration complete, investigating Jira table bug
</current_mode>

<active_task>
TASK-005: Fix Jira table conversion (still broken after Turndown migration)
</active_task>

<parked_tasks>
TASK-003: Add debug mode toggle with XML bundle export
TASK-004: Create LLM sanitization prompt for test fixtures
</parked_tasks>

<vision>
Clipboard-paste webapp for agent-ready Markdown. Bypass auth walls by copying from authenticated pages. Debug mode enables test fixture collection. Public repo requires sanitized test data.
</vision>

<decisions>
DECISION-001: Migrate to Turndown.js — maintained successor to to-markdown.js, GFM table support, same author
DECISION-002: Debug bundle format is XML-tagged — agent-native, human-readable, no escaping issues
DECISION-003: Agent-as-oracle for testing — CI can't run paste events, LLM evaluates conversion quality
DECISION-004: Vendor Turndown locally — reliability over CDN, works offline, consistent with project structure
DECISION-005: Port all existing rules — no trimming, maintain feature parity during migration
</decisions>

<blockers>
Jira tables still not converting — need to investigate HTML structure from Jira paste
</blockers>

<next_action>
Get raw HTML from Jira table paste, analyze why Turndown GFM plugin isn't matching
</next_action>

---

## 2. Key Events Index (Project Foundation)

### Architecture Decisions
- LOG-001: Turndown Migration — Replaced to-markdown.js with Turndown.js + GFM plugin
- LOG-002: Project Reorganization — lib/, assets/, script/ folders for cleaner structure

---

## 3. Atomic Session Log (Chronological)

### [LOG-001] - [PLAN] - Turndown migration plan created - Task: TASK-002
**Timestamp:** 2026-02-10
**Details:**
- Analyzed current `clipboard2markdown.js` — found 10 custom rules in `pandoc` array
- Confirmed Turndown API compatibility: `filter` + `replacement` signature identical
- GFM plugin provides tables, strikethrough, task lists out of box
- Decision: Vendor locally (not CDN) for reliability + offline support
- Decision: Port all rules, no trimming

### [LOG-002] - [EXEC] - Project reorganization - Task: TASK-002
**Timestamp:** 2026-02-10
**Details:**
- Created `lib/` — vendored `turndown.js` + `turndown-plugin-gfm.js`
- Created `assets/` — moved `bootstrap.css`, `background.svg`, `background-dark.svg`
- Created `script/` — moved `download_turndown.py`
- `to-markdown.js` left in root (pending deletion after migration verified)

### [LOG-003] - [EXEC] - Turndown migration complete - Task: TASK-002
**Timestamp:** 2026-02-10
**Details:**
- Updated `index.html`:
  - Script refs: `lib/turndown.js`, `lib/turndown-plugin-gfm.js`
  - Asset refs: `assets/bootstrap.css`, `assets/background*.svg`
  - Attribution text updated to link Turndown
- Rewrote `clipboard2markdown.js`:
  - TurndownService with options: `headingStyle: 'atx'`, `codeBlockStyle: 'fenced'`, etc.
  - `.use(turndownPluginGfm.gfm)` for tables/strikethrough/tasklists
  - Ported all 10 custom rules via `addRule()`
  - `escape()` post-processor preserved (smart punctuation cleanup)
- Initial test: basic cases work ✓
- Blocker found: Jira tables still broken

---
**Timestamp:** 2026-01-22 14:10
**Details:**
- SUBTASK-001: Base card component with props interface
- SUBTASK-002: Engagement metrics display (likes, comments, shares)
- SUBTASK-003: Layout grid with responsive breakpoints
- Risk: Responsive behavior may need user verification on mobile

