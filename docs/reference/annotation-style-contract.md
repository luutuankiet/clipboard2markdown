---
title: Annotation style contract
summary: How conversational platforms (Jira, Slack, Google Chat) annotate thread boundaries and metadata in converted Markdown
verified: 2026-09-16
---

# Annotation style contract

Conversational platforms (Jira, Slack, Google Chat) produce threaded content with
metadata (author, timestamp, reply lineage). The platform modules convert this
metadata into a shared annotation format so that AI agents and human readers can
parse thread structure from the Markdown output.

## Three rules

1. **Boundary markers are explicit.** Thread or root separators are visible
   Markdown text, not whitespace.
2. **Metadata is italicized.** Author, reply lineage, timestamp, edited/external
   labels are wrapped in `*...*`.
3. **Raw Markdown annotations bypass Turndown escaping** by using `data-*`
   attributes plus `​` sentinel text. Turndown prunes empty nodes, so
   setting `textContent = '​'` keeps the node alive while the `data-*`
   attribute carries the unescaped annotation text.

## Per-platform shapes

| Platform | Separator | Metadata | Mechanism |
|---|---|---|---|
| Jira | `=== Thread {id} ===` | `*[commentId <- parentId] Author - Date (edited)*` | `data-jira-thread`, `data-jira-annotation`, `​` sentinel |
| Slack | `*[thread: N replies]*` | `*(reply) Name [time]*` and `*[service unfurl]*` | `data-slack-thread-sep`, `data-slack-reply-header`, `data-slack-unfurl` |
| Google Chat | `=== Root Chat {n} ===` | `*[root n] Author - time*` or `*[reply r to root n] Author - time*` | `data-gchat-thread`, `data-gchat-annotation`, `​` sentinel |

## Adding a new conversational platform

1. Detect message boundaries and inject a visible separator in the sanitizer.
2. Extract author/time/thread semantics into a single italic metadata line
   before message content.
3. If Markdown must remain unescaped, store text in `data-*` attributes and set
   `textContent = '​'`.
4. Register in `src/platforms/index.js`.
5. Add fixture pairs in `tests/fixtures/<platform>/` that prove separator and
   metadata stability.
6. Prefer shape compatibility with existing patterns unless a platform constraint
   makes that impossible.
