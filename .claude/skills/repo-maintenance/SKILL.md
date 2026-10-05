---
name: repo-maintenance
description: This repo keeps a catalogue of its own traps -- failure modes that produce no error, so you find them by symptom, not by stack trace -- plus its reference pages and its decision records. Use before debugging behaviour that is wrong but not crashing, before editing clipboard I/O or pasteboard types, and whenever you finish debugging something that cost more than an hour.
---

# Traps in this repo

Most of what has cost time here fails **silently**. The CLI exits with no output,
the clipboard appears unchanged, and there is no stack trace to search. The
catalogue below is keyed on **the symptom you would observe**, not on the
subsystem at fault.

**Before you debug anything that misbehaves without erroring, scan this table.**
Then open exactly one file. Each page is self-contained -- you will not need to
open a second one.

<!-- BEGIN GENERATED INDEX -- edit the pages, not this block -->

## Traps

Failure modes that produce no error message, indexed by the symptom you
would observe. Read before debugging behaviour that is wrong but not
crashing.

| symptom | page | area | verified |
|---|---|---|---|
| A canvas edited by link shows grey image placeholders where pictures used to be | [EDITED_LINK_LOSES_IMAGES](../../../docs/traps/EDITED_LINK_LOSES_IMAGES.md) | diagrams (bin/diagrams.js edit) | 2026-10-02 |
| CLI says it converted but Cmd+V pastes nothing into the target app | [MISSING_PLAIN_TEXT_FALLBACK](../../../docs/traps/MISSING_PLAIN_TEXT_FALLBACK.md) | clipboard I/O | 2026-09-16 |
| CLI prints nothing and exits, clipboard unchanged, after copying from VS Code or TickTick | [NIL_HTML_CLIPBOARD_TYPE](../../../docs/traps/NIL_HTML_CLIPBOARD_TYPE.md) | clipboard I/O | 2026-09-16 |
| A scripted paste into the page does nothing in Firefox; the handler sees empty clipboard data | [SYNTHETIC_PASTE_EMPTY_IN_FIREFOX](../../../docs/traps/SYNTHETIC_PASTE_EMPTY_IN_FIREFOX.md) | live testing (browser automation) | 2026-10-02 |

## Reference

Simply true, and expensive to re-derive.

| page | summary | verified |
|---|---|---|
| [Annotation style contract](../../../docs/reference/annotation-style-contract.md) | How conversational platforms (Jira, Slack, Google Chat) annotate thread boundaries and metadata in converted Markdown | 2026-09-16 |

## Decisions

Why the repo is the way it is. A merged decision is immutable -- supersede
it with a new one rather than editing it.

- [JXA for CLI clipboard I/O instead of pbcopy/pbpaste](../../../docs/adr/0001-jxa-clipboard-io.md)
- [The diagrams mode makes read-only requests to the Excalidraw backend](../../../docs/adr/0002-diagrams-mode-network-reads.md)
- [The clipboard command expands Excalidraw links over the network](../../../docs/adr/0003-clipboard-command-expands-diagrams.md)

<!-- END GENERATED INDEX -->

The same tables, browsable, are [docs/README.md](../../../docs/README.md).

## Adding a trap

Write one when you have just spent real time on something that would have taken
minutes if someone had told you. Three tests, all must pass:

1. **It has a symptom.** If a fact is merely true, it is reference, not a trap.
   *If it has a symptom it is a trap; if it is just true it is reference.*
2. **Nothing cheaper catches it.** A doc is the *last* resort, because it only
   works if someone reads it. Stop at the first rung that holds:

   | rung | use when | this repo |
   |---|---|---|
   | make it a **type error** | the mistake is expressible in the type system | none (plain JS, no type checker) |
   | make it a **test** | the mistake is an assertable behaviour | `npm test` (vitest, 32 fixture-based tests) |
   | **comment at the site** | there is exactly one line where someone could get it wrong | yes -- see `bin/cli.js:25` nil-check comment |
   | **a doc** | the mistake can be made from any of several files, or from a file that does not exist yet | the catalogue above |

   Before adding one, say out loud which single line you would have commented
   instead -- if you can name it, comment it and stop.
3. **It is not already in the table.** Extend the existing file. Two docs on one
   fact is how a catalogue rots.

Then:

- **Filename is the identifier.** `SCREAMING_SNAKE.md`, describing the symptom,
  not the fix. It is quoted in code comments and commit messages, so it never
  gets renamed -- if the understanding changes, edit the body.
- **`symptom:` is the search key.** The string a frustrated person would paste
  into a search box, not a topic name. If the console prints something, put the
  console text verbatim.
- **Date it.** `verified:` is the day someone last confirmed it in the running
  code. An undated trap is a claim with no expiry.
- **Regenerate the index**: `scripts/gen-docs-index.sh`. The block above is
  generated; hand edits to it are overwritten.

## Writing the body

The reader is a maintainer six months from now who opened this one file from a
search result and has **no other context loaded**. Not you, not this session.

- Resolve every reference inline. No "see the other doc", no ticket numbers, no
  "as discussed". If a line number matters, quote the code.
- Publishing tone. It is a page on the project's documentation site, not a note
  to self.
- Lead with the symptom, then the mechanism, then the fix, then how to verify.
  Someone in the middle of a bug reads the first two lines and stops.
- Include the **evidence** -- measured numbers, observed values, verbatim code. A
  trap without evidence gets argued with.
- **Say what is deliberate.** Half of what looks like a bug in a mature codebase
  is a trade someone made on purpose. Write down which, and what the trade was.

## The other collections

`docs/` holds five kinds of page, all generated into the same index by the same
script, all governed by the rules above:

| directory | what belongs there | frontmatter |
|---|---|---|
| `docs/traps/` | it has a symptom | `symptom`, `area`, `verified` |
| `docs/architecture/` | where behaviour lives -- one page per area | `title`, `covers`, `verified` |
| `docs/reference/` | simply true, no symptom, worth not re-deriving | `title`, `summary`, `verified` |
| `docs/adr/` | **why the repo is the way it is** -- a decision record | none; the `# ` heading is the entry |
| `docs/*.md` | a long-form guide belonging to no single area | `title`, `summary`, `verified` |

The architecture pages are the `codebase-map` skill's index; read that skill
before adding one. The escalation ladder does **not** apply to them -- a map is not
a warning. Everything else does: date it, resolve references inline, regenerate
the index.

### Decision records

`docs/adr/NNNN-kebab-slug.md`, sequential, created lazily. Offer one only when
**all three** hold:

1. **hard to reverse** -- if it is easy to reverse, skip it; you will just reverse it
2. **surprising without context** -- otherwise the code explains itself
3. **the result of a real trade-off** -- if there was no genuine alternative, there
   is nothing to record beyond "we did the obvious thing"

One to three sentences is a complete record: the context, what was decided, why.

**A merged record is immutable.** Superseding means a *new* file that names what
it replaces; the old one stays readable, because the reason a decision was made is
not invalidated by the decision changing.

This is the one destination that is append-only and unrecoverable. A trap can be
rewritten later; a rationale never written is gone.

## Removing a trap

**Before trusting a page, check it is still true.** These describe code, and code
moves. If the underlying cause is fixed, **delete the file** and say so in the
commit message. Do not leave it with a "fixed in vX" note -- a stale trap costs a
reader the same time as a real one, and costs the catalogue its credibility, which
is the only thing making anyone open the next page. If the fix came with a comment
at the site, that comment is now the record.
