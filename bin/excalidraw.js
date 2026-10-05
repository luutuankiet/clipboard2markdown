// `c2m excalidraw`: JSON diagram description -> excalidraw.com share link,
// Mermaid preview and layout warnings. No clipboard, runs anywhere Node 20+ runs.
//
// The help text below is the agent's whole manual for this command; keep it in
// step with src/diagrams/skeleton.js.

import { readFileSync } from 'fs';
import { buildSkeleton } from '../src/diagrams/skeleton.js';
import { saveScene } from '../src/diagrams/share-link.js';

export const EXCALIDRAW_HELP = `c2m excalidraw - turn a JSON diagram description into an excalidraw.com share link

Usage:
  c2m excalidraw <file.json>      read the diagram from a file
  c2m excalidraw -                read the diagram from stdin
  c2m excalidraw --no-upload ...  check only: print preview and warnings, no link
  c2m excalidraw --help           show this help

OUTPUT (stdout, in this order)
  line 1      https://excalidraw.com/#json=<id>,<key>   (omitted with --no-upload)
  then        a \`\`\`mermaid block: the structure you drew (nodes, arrows, labels)
  then        zero or more lines starting "warning: "
  Errors go to stderr with exit code 1 and no link is printed. Warnings never
  block the link; decide whether each one matters.

LOOP
  1. Write the diagram JSON to a file.
  2. Run: c2m excalidraw diagram.json --no-upload
  3. Read the preview: is every box, arrow and label what you meant?
     Read the warnings: overlaps, labels that do not fit, loose arrows.
  4. Fix the JSON and rerun until the preview is right and warnings are gone.
  5. Run without --no-upload and paste the link into the document.
  Every upload makes a new link; old links keep working. The encryption key
  lives only in the link's # fragment, so excalidraw.com cannot read it.

INPUT: a JSON array of elements
  [
    {"id": "api",  "type": "rectangle", "x": 0,   "y": 0, "width": 160, "height": 70,
     "label": {"text": "API"}, "backgroundColor": "#a5d8ff"},
    {"id": "db",   "type": "ellipse",   "x": 300, "y": 0, "width": 200, "height": 80,
     "label": {"text": "Postgres"}},
    {"id": "ok",   "type": "diamond",   "x": 280, "y": 180, "width": 240, "height": 120,
     "label": {"text": "Cached?"}},
    {"id": "a1",   "type": "arrow", "start": {"id": "api"}, "end": {"id": "db"},
     "label": {"text": "reads"}},
    {"id": "a2",   "type": "arrow", "start": {"id": "db"}, "end": {"id": "ok"}},
    {"id": "note", "type": "text", "x": 0, "y": 120, "text": "p95 < 200 ms", "fontSize": 16}
  ]
  Preview of the above:
    flowchart LR
      api[API]
      db((Postgres))
      ok{Cached?}
      api -->|reads| db
      db --> ok
      %% note: p95 < 200 ms

ELEMENTS
  rectangle, ellipse, diamond   need id, x, y, width, height (x, y = top-left)
  text                          needs id, x, y, text   (free-standing annotation)
  arrow, line                   need id; bind ends with "start"/"end"
  Every element needs a unique "id"; it becomes the node id in the preview.

FIELDS (all optional unless noted above)
  label            {"text": "...", "fontSize": 20} or just "..." on shapes and
                   arrows; rendered as text centred in the shape / on the arrow.
                   Use "\\n" for line breaks; labels are not wrapped for you.
  start, end       {"id": "<shape id>"} on arrows and lines. The arrow stays
                   attached when someone drags the shape in excalidraw.com.
                   MCP style also works: "startBinding": {"elementId": "<id>"}.
  points           [[0,0],[dx,dy],...] relative to the arrow's x, y. Leave out
                   for a bound arrow: it is routed straight between the two
                   shapes' edges. Unbound without points: width/height or 100x0.
  strokeColor      "#1e1e1e" (default) or any CSS hex colour
  backgroundColor  "transparent" (default), e.g. "#a5d8ff" "#b2f2bb" "#ffec99"
  fillStyle        "solid" (default), "hachure", "cross-hatch"
  strokeStyle      "solid" (default), "dashed", "dotted"
  fontSize         default 20, on text elements (labels: label.fontSize)
  startArrowhead, endArrowhead   null, "arrow" (arrow end default), "triangle", "dot", "bar"
  Any other Excalidraw element field is passed through unchanged.

SIZING AND SPACING (rules of thumb, font size 20)
  - Text width ~ 14 px per character, line height 25 px.
  - Rectangle: width >= 14 * longest line + 40, height >= 25 * lines + 40.
  - Ellipse needs ~1.4x that, diamond ~2x, in both directions.
  - Leave >= 120 px between shapes that an arrow joins, more if it has a label.
  - A large rectangle drawn first and fully containing others works as a group
    box: full containment is fine, partial overlap is warned about.
  - Lay out on a grid: rows every ~150 px, columns every ~250 px.

PREVIEW
  rectangle -> id[label]   ellipse -> id((label))   diamond -> id{label}
  An arrow bound at both ends -> edge with its label. A shape fully inside a
  larger labelled shape -> subgraph. Free text -> "%% note:" line. The preview
  shows structure only; Mermaid's layout is not your drawing's layout.

WARNINGS
  overlap            two shapes partly overlap
  label does not fit the label's estimated size exceeds its shape minus padding
  not attached       an arrow end has no "start"/"end"
  points at "<id>"   an arrow end names an id that is not a shape here
  duplicate id       bindings attach to the first element with that id
  dropped            unsupported type, or an MCP-only command such as
                     cameraUpdate, delete, restoreCheckpoint

NOT SUPPORTED
  images, frames, freedraw, Mermaid as input, editing an existing link (use
  c2m diagrams edit for that), writing .excalidraw files.
`;

function readInput(target, stdin) {
  if (target === '-') return readFileSync(stdin === undefined ? 0 : stdin, 'utf8');
  try {
    return readFileSync(target, 'utf8');
  } catch (e) {
    throw new Error('cannot read ' + target + ': ' + e.message);
  }
}

// Map upload failures onto something the agent can act on.
async function upload(scene, fetchImpl) {
  try {
    return await saveScene(scene, { fetch: fetchImpl });
  } catch (e) {
    var msg = e && e.message ? e.message : String(e);
    if (/HTTP 413/.test(msg)) throw new Error('upload failed: scene too large for excalidraw.com; split the diagram into smaller ones');
    if (/^upload failed/.test(msg)) throw new Error(msg);
    throw new Error('upload failed: ' + msg + ' (network error? check connectivity to json.excalidraw.com)');
  }
}

// Returns the exit code. `io.fetch` and `io.stdin` exist for tests.
export async function runExcalidraw(argv, io) {
  var stdout = io.stdout, stderr = io.stderr;
  var noUpload = false;
  var targets = [];
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--help' || a === '-h') { stdout.write(EXCALIDRAW_HELP); return 0; }
    if (a === '--no-upload') noUpload = true;
    else if (a.startsWith('--')) { stderr.write('c2m excalidraw: unknown option ' + a + '\n'); return 1; }
    else targets.push(a);
  }
  if (targets.length !== 1) {
    stderr.write('c2m excalidraw: expected one <file.json> or - for stdin. See c2m excalidraw --help.\n');
    return 1;
  }

  try {
    var text = readInput(targets[0], io.stdin);
    var input;
    try {
      input = JSON.parse(text);
    } catch (e) {
      throw new Error('input is not valid JSON: ' + e.message);
    }
    var built = buildSkeleton(input);
    var url = noUpload ? null : await upload(built.scene, io.fetch);
    if (url) stdout.write(url + '\n');
    stdout.write('```mermaid\n' + built.preview + '\n```\n');
    built.warnings.forEach(function (w) { stdout.write('warning: ' + w + '\n'); });
    return 0;
  } catch (e) {
    stderr.write('c2m excalidraw: ' + (e && e.message ? e.message : e) + '\n');
    return 1;
  }
}
