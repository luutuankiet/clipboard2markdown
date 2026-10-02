# Documentation

Every page here is written for a maintainer six months from now who opened
exactly this file from a search result and has nothing else loaded.

This index is generated. Run `scripts/gen-docs-index.sh` after adding or
renaming a page; `--check` fails if it is stale.

<!-- BEGIN GENERATED INDEX -- edit the pages, not this block -->

## Where things live

One page per area of the system. Read before going looking for where
something is implemented.

| page | covers | verified |
|---|---|---|
| [Clipboard I/O](architecture/clipboard-io.md) | how the web app and CLI read and write the system clipboard | 2026-09-16 |
| [Conversion pipeline](architecture/conversion-pipeline.md) | how content is converted between HTML and Markdown, the two directions | 2026-09-16 |
| [Diagram round trip](architecture/diagrams.md) | how excalidraw.com share links become Mermaid, how the diagrams mode and bin/diagrams.js work, and how a canvas is edited by link | 2026-10-02 |

## Traps

Failure modes that produce no error message, indexed by the symptom you
would observe. Read before debugging behaviour that is wrong but not
crashing.

| symptom | page | area | verified |
|---|---|---|---|
| CLI says it converted but Cmd+V pastes nothing into the target app | [MISSING_PLAIN_TEXT_FALLBACK](traps/MISSING_PLAIN_TEXT_FALLBACK.md) | clipboard I/O | 2026-09-16 |
| CLI prints nothing and exits, clipboard unchanged, after copying from VS Code or TickTick | [NIL_HTML_CLIPBOARD_TYPE](traps/NIL_HTML_CLIPBOARD_TYPE.md) | clipboard I/O | 2026-09-16 |

## Reference

Simply true, and expensive to re-derive.

| page | summary | verified |
|---|---|---|
| [Annotation style contract](reference/annotation-style-contract.md) | How conversational platforms (Jira, Slack, Google Chat) annotate thread boundaries and metadata in converted Markdown | 2026-09-16 |

## Decisions

Why the repo is the way it is. A merged decision is immutable -- supersede
it with a new one rather than editing it.

- [JXA for CLI clipboard I/O instead of pbcopy/pbpaste](adr/0001-jxa-clipboard-io.md)
- [The diagrams mode makes read-only requests to the Excalidraw backend](adr/0002-diagrams-mode-network-reads.md)

<!-- END GENERATED INDEX -->
