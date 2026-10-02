---
title: Diagram round trip
covers: how excalidraw.com share links become Mermaid, how the diagrams mode and bin/diagrams.js work, and how a canvas is edited by link
verified: 2026-10-02
---

# Diagram round trip

Excalidraw canvases shared as `https://excalidraw.com/#json=<id>,<key>` links are
turned into Mermaid *reading copies* for agents, and agents patch canvases in
place by link. One platform-neutral module in `src/diagrams/` serves both the page
and the CLI; its only dependencies are `fetch`, WebCrypto and `pako`.

## Files

| file | lines | what lives there |
|---|---|---|
| `src/diagrams/share-link.js` | ~28 | `parseShareLink` (tolerates `\_` / `\-` escapes from Google's export) |
| | ~104-135 | wire format: `decodePayload` / `encodePayload`, mirroring upstream `compressData` |
| | ~140-180 | `loadScene` (one GET), `saveScene` (POST, fresh key, new link) |
| `src/diagrams/scene-model.js` | ~11 | `TUNING`: every distance and ratio the reader uses |
| | ~115-150 | id assignment: readable element ids kept, others hashed, stable per scene |
| | ~159-end | `analyzeScene`: nodes, subgraphs, edges, labels, notes |
| `src/diagrams/scene-to-mermaid.js` | ~84 | `sceneToMermaid`: flowchart, or a commented outline when it is not one |
| `src/diagrams/markdown.js` | ~26 | `stripDiagramBlocks` |
| | ~60-85 | `hostBlock`: where a block goes (after paragraph, list item, table) |
| | ~118 | `expandDiagramLinks`: strip, then insert fresh blocks |
| `src/diagrams/edit.js` | ~61 | `wrapLabel`: bound text wraps to the box width; the box grows in height |
| | ~469 | `applyEdits` (pure, on a deep copy), `editLink` |
| `src/diagrams/browser.js` | all | the read-only subset the page imports |
| `bin/diagrams.js` | all | CLI: `expand`, `strip`, `show`, `edit` |
| `clipboard2markdown.js` | ~564-625 | page mode: paste handling and progress |
| | ~694 | Strip diagram blocks button |

## Reading a canvas

`analyzeScene` is the single reader; the Mermaid writer and the editor both call
it, so the ids an agent reads are the ids the editor resolves.

1. Deleted elements are dropped.
2. Text with a live `containerId` labels its container. Other text belongs to
   the smallest shape containing its centre.
3. A `frame`, or a shape that encloses another labelled shape, is a *subgraph*.
   Its title is bound text, the frame name, or its inside text nearest the top
   edge. Other labelled shapes are *nodes*.
4. Arrows, and lines with an arrowhead, are edges. Each end resolves through its
   binding first, else to the smallest node within `endpointTolerance`, else the
   smallest subgraph containing it, else the nearest node within
   `endpointSnapLimit`. **Unbound arrows are the normal case**: canvases drawn by
   an LLM and then edited by hand mostly have them.
5. Edge labels: bound text, else free text within `edgeLabelDistance` of the
   polyline, each text claimed once by its nearest arrow.
6. Leftover text becomes `%% note:`, unmatched arrows `%% unconnected arrow`,
   images `%% image`.
7. A *colour key* (`findLegend`) is two or more labelled boxes that no arrow
   touches, outside every subgraph and clear of the connected diagram, within
   `legendGap` of each other, each in its own fill/line style, each style also
   used in the diagram. Key boxes are not drawn; each entry becomes
   `%% legend: key_<label> = <label>`, a `classDef` with its fill colour, and a
   `class` line tagging every other box or subgraph in that style. Hatching
   cannot be drawn in Mermaid, so two entries with the same colour differ only
   by name.

The output is an outline (`%% outline (needs agent): <reason>`) instead of a
flowchart when fewer than `flowchartMinResolvedRatio` of arrows resolve, when
there are two or more vertical lifelines (sequence style), or when most nodes
contain a horizontal divider line (class / ER style).

## Markdown blocks

Each block is inserted as `"\n\n" + block` right before the newline that ends
the host block, inside a list item it is indented to the item's content. That is
what makes `stripDiagramBlocks(expand(x)) === x` byte-for-byte. Expanding always
strips first, so re-pasting an expanded document replaces blocks. A link is
expanded only at its first occurrence and never inside a code fence.

## Editing

Ops: `rename`, `add`, `connect`, `disconnect`, `relabel-edge`, `remove`.
`applyEdits` deep-copies the scene, re-runs `analyzeScene` before every op and
throws on the first bad one, so nothing is uploaded unless every op applied.
Text size is estimated at `0.68 x fontSize` per character and
`1.25 x fontSize` per line (`TEXT_METRICS`). Bound labels wrap to the box's
width and the box grows in height, as Excalidraw itself does; growing the width
instead would push the box over the ends of unbound arrows at its sides.
`originalText` keeps the unwrapped label, which is what the reader prints.

`add` copies the anchor's look and grows every enclosing group box. A spot is
rejected if the new box overlaps anything, or if growing a group to hold it
would swallow a box that is not in that group; when every spot on the
requested side is rejected, the other sides are tried and the substitution is
reported on stderr. Boxes are placed 120px apart so a labelled arrow between
them stays visible.

Images do not survive an edit; see `docs/traps/EDITED_LINK_LOSES_IMAGES.md`.

## Testing

Two seams only, both with an injected `fetch` (`tests/diagrams/fake-backend.js`)
so every test goes through real encryption:

- `tests/fixtures-diagrams/*.excalidraw` + `.mmd`, compared semantically by
  `tests/diagrams/mermaid-semantics.js`. Scenes come from `build-fixtures.mjs`.
- `tests/fixtures-diagram-md/<name>.input.md` + `.expected.md`.
- `bin/diagrams.js` reads `C2M_DIAGRAMS_FAKE_BACKEND=<dir>` as a stand-in
  backend, for CLI tests only.

`scripts/diagrams-smoke.mjs` exercises the real backend; it is not run in CI.
