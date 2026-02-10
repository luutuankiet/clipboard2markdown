# GSD-Lite Work Log

---

## 1. Current Understanding (Read First)

<current_mode>
execution
</current_mode>

<active_task>
TASK-008: Implement an automated test runner to verify fixtures.
</active_task>

<parked_tasks>
TASK-003: Add debug mode toggle with XML bundle export
TASK-004: Create LLM sanitization prompt for test fixtures
</parked_tasks>

<vision>
A client-side webapp that converts copied web content (HTML) into clean Markdown. It is powered by a Vite build system for reliable development and deployment. The conversion logic is modular, allowing for platform-specific rules (Jira, Confluence, etc.) and is covered by an automated regression test suite.
</vision>

<decisions>
DECISION-001: Migrate to Turndown.js — maintained successor to to-markdown.js, GFM table support, same author
DECISION-002: Debug bundle format is XML-tagged — agent-native, human-readable, no escaping issues
DECISION-003: Agent-as-oracle for testing — CI can't run paste events, LLM evaluates conversion quality
DECISION-004: Vendor Turndown locally — reliability over CDN, works offline, consistent with project structure
DECISION-005: Port all existing rules — no trimming, maintain feature parity during migration
DECISION-006: Pre-process HTML before Turndown — sanitize platform quirks rather than fighting the library
DECISION-007: Use Vite for the build system — solves browser caching and provides a modern dev environment.
DECISION-008: Adopt a modular `platforms/` architecture — isolates platform-specific logic for maintainability.
</decisions>

<blockers>
None
</blockers>

<next_action>
Implement the automated test runner (TASK-008) by installing vitest and creating the test script.
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

### [LOG-004] - [FIX] - Jira table conversion fixed via HTML pre-processing - Task: TASK-005
**Timestamp:** 2026-02-10
**Details:**
- **Root cause:** Jira wraps table cell content in `<p data-renderer-start-pos="...">` tags
- Turndown GFM plugin expects simple `<td>text</td>`, not nested `<p>` elements
- **Fix approach:** Pre-process HTML before Turndown (sanitize, don't fight the library)
- Added `sanitizeHTML()` function to `clipboard2markdown.js`:
  - Strips `<p>` tags inside `<td>`/`<th>`, preserving content
  - Removes empty `<span>` elements that interfere with parsing
- Updated `convert()` to call `sanitizeHTML(str)` before `turndown()`
- **Result:** Tables now convert correctly to markdown pipe format ✓
- **Remaining issue:** SQL code blocks lose line breaks (all on one line)
  - Jira's code block HTML structure needs investigation
  - Likely similar pre-processing fix needed

---
**Timestamp:** 2026-01-22 14:10
**Details:**
- SUBTASK-001: Base card component with props interface
- SUBTASK-002: Engagement metrics display (likes, comments, shares)
- SUBTASK-003: Layout grid with responsive breakpoints
- Risk: Responsive behavior may need user verification on mobile

### [LOG-005] - [SETUP] - Vite build system implemented - Task: N/A
**Timestamp:** 2026-02-10
**Details:**
- **Problem:** Browser caching was preventing JavaScript changes from loading, making debugging difficult.
- **Solution:** Introduced a `vite` build step to enable a modern development workflow.
- **Actions Taken:**
  - `npm init` and installed `vite`, `turndown`, and `turndown-plugin-gfm`.
  - Created `vite.config.js` with `base` path for GitHub Pages deployment.
  - Updated `package.json` with `dev`, `build`, and `preview` scripts.
  - Refactored `clipboard2markdown.js` and `index.html` to use ES Module imports instead of global scripts.
- **Outcome:** Caching issues are resolved. `npm run dev` provides a hot-reloading server for rapid testing. `npm run build` creates a production-ready `dist/` directory.

### [LOG-006] - [FIX] - Jira code block newlines and indentation preserved - Task: TASK-006
**Timestamp:** 2026-02-10
**Details:**
- **Root Cause:** A combination of HTML parser whitespace collapsing and Turndown's text extraction logic was dropping newlines and leading spaces.
- **Solution:** Implemented a robust, two-part pre-processing (sanitizer) and processing (rule) pipeline.
  - **Sanitizer (`sanitizeHTML`):**
    1. Iterates through Jira's line-based `<span>` elements.
    2. Replaces leading spaces with non-breaking space entities (`&nbsp;`) to prevent the HTML parser from collapsing them.
    3. Joins the processed lines with `<br>` tags to ensure the line breaks survive the DOM parsing step.
    4. Injects this new HTML back into the `<code>` element's `innerHTML`.
  - **Turndown Rule (`confluenceCodeBlock`):**
    1. Clones the `<code>` node to avoid altering the DOM.
    2. Replaces all `<br>` elements with `\n` characters.
    3. Replaces all `&nbsp;` characters (`\u00A0`) back to regular spaces.
    4. Extracts the cleaned `textContent` for the final markdown output.
- **Status:** The fix is verified and working correctly. **TASK-006 is complete.**

### [LOG-007] - [PLAN] - Refactor and implement automated testing - Task: TASK-007, TASK-008
**Timestamp:** 2026-02-10
**Details:**
- **Goal:** Improve maintainability and prevent regressions.
- **New Tasks Created:**
  - **TASK-007:** Refactor platform-specific logic into a modular `src/platforms/` directory.
  - **TASK-008:** Implement an automated test runner to verify fixtures.
- **Refactor Plan (TASK-007):**
  1. Move all generic rules (sup, sub, etc.) and sanitizers from `clipboard2markdown.js` to `src/platforms/common.js`.
  2. Update `src/platforms/index.js` to import and export all platform modules.
  3. Refactor `clipboard2markdown.js` into a slim orchestrator that imports `addAllRules` and `sanitize` from `src/platforms/index.js` and focuses only on DOM event handling.
- **Automated Test Plan (TASK-008):**
  1. Install `vitest` and `jsdom` as dev dependencies.
  2. Create a test file (e.g., `tests/conversion.test.js`).
  3. The test script will read all `.html` and `.md` file pairs from `tests/fixtures/`.
  4. For each pair, it will run the `convert` function on the HTML and assert that the output exactly matches the expected markdown.
  5. Update `package.json` to run tests via `npm test`.
- **Decision:** This modular structure makes it easy to add new platforms (Confluence, Notion) and test cases in the future.

### [LOG-008] - [EXEC] - Modular Refactor and Test Setup - Task: TASK-007, TASK-008
**Timestamp:** 2026-02-10
**Details:**
- **Refactor (TASK-007):**
  - Created `src/platforms/common.js` for generic rules.
  - Created `src/platforms/slack.js` for Slack-specific rules.
  - Updated `src/platforms/index.js` to aggregate all platforms.
  - Extracted core conversion logic to `src/converter.js` (imports `TurndownService` and platform rules).
  - Simplified `clipboard2markdown.js` to be a pure UI controller importing `convert()` from `src/converter.js`.
- **Test Infrastructure (TASK-008):**
  - Updated `vite.config.js` to include `test` configuration (jsdom environment).
  - Updated `package.json` to add `vitest` script.
  - Created `tests/conversion.test.js` which recursively finds fixtures and verifies conversion.
- **Next Steps:** User needs to run `npm install -D vitest jsdom` and `npm test` to verify.

