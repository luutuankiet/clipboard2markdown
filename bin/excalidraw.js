// `c2m excalidraw`: JSON diagram description -> excalidraw.com share link,
// Mermaid preview and layout warnings. No clipboard, runs anywhere Node 20+ runs.
//
// The help text below is the agent's whole manual for this command; keep it in
// step with src/diagrams/skeleton.js.

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import { buildSkeleton } from '../src/diagrams/skeleton.js';
import { saveScene } from '../src/diagrams/share-link.js';

export const EXCALIDRAW_HELP = `c2m excalidraw - turn a JSON diagram description into an excalidraw.com share link

Usage:
  c2m excalidraw <file.json>      read the diagram from a file
  c2m excalidraw -                read the diagram from stdin
  c2m excalidraw --no-upload ...  check only: print preview and warnings, no link
  c2m excalidraw --png [<dir>] <file.json>...
                                  also draw each diagram as PNG (see PNG below)
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

PNG (for pasting into a Google Doc)
  c2m excalidraw --png [<dir>] a.json b.json ...
  Draws each diagram locally (no browser; the drawing itself makes no network
  request) and uploads it for its share link as above. Each input is either
  the element array described here or a whole scene ({"elements": [...]},
  e.g. a .excalidraw file). For each input <name>.json it writes:
    <name>.png          for the document: scale 3, lowered until the image
                        has at most 25,000,000 pixels (Google Docs' limit)
    <name>.review.png   for a quick look: at most 1000 px on the long side
  <dir> defaults to ~/.cache/c2m/renders/ ($XDG_CACHE_HOME/c2m/renders/);
  each run first deletes PNGs there older than 24 h. A <dir> you name is
  never cleaned. --png=<dir> also works.
  Then, per diagram:
    ![<name>](attach:<name>)                  the image line for the document
    [Edit this diagram](<share link>)         omitted with --no-upload
    "<name>": "@file64:/abs/path/<name>.png"  the entry for the images map
    review: /abs/path/<name>.review.png
    warning: ...                              as above, if any
  To check a drawing, read its Mermaid preview first (rerun without --png, or
  c2m diagrams show <file> for a whole scene); open the review PNG only when
  the preview cannot answer the question.
  Text uses Excalidraw's fonts; CJK text is not drawn (the CJK font is not
  shipped) and gets a warning.

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

// A whole scene ({elements: [...]}, as in a .excalidraw file) is drawn as is;
// anything else goes through the skeleton builder.
function toScene(input) {
  if (input && !Array.isArray(input) && Array.isArray(input.elements)) {
    return { scene: input, preview: null, warnings: [] };
  }
  return buildSkeleton(input);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('input is not valid JSON: ' + e.message);
  }
}

function sceneName(target) {
  return target === '-' ? 'diagram' : basename(target).replace(/\.(json|excalidraw)$/i, '');
}

// `--png` takes an optional folder: the next argument is the folder unless it
// looks like an input (-, *.json, *.excalidraw) or an option.
function looksLikeInput(a) {
  return a === '-' || a.startsWith('--') || /\.(json|excalidraw)$/i.test(a);
}

// Returns the exit code. `io.fetch`, `io.stdin` and `io.env` exist for tests.
export async function runExcalidraw(argv, io) {
  var stdout = io.stdout, stderr = io.stderr;
  var noUpload = false;
  var png = false, pngDir = null;
  var targets = [];
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--help' || a === '-h') { stdout.write(EXCALIDRAW_HELP); return 0; }
    if (a === '--no-upload') noUpload = true;
    else if (a === '--png') {
      png = true;
      if (i + 1 < argv.length && !looksLikeInput(argv[i + 1])) pngDir = argv[++i];
    } else if (a.startsWith('--png=')) { png = true; pngDir = a.slice(6); }
    else if (a.startsWith('--')) { stderr.write('c2m excalidraw: unknown option ' + a + '\n'); return 1; }
    else targets.push(a);
  }
  if (png ? targets.length < 1 : targets.length !== 1) {
    stderr.write('c2m excalidraw: expected ' + (png ? 'one or more <file.json>' : 'one <file.json>') +
      ' or - for stdin. See c2m excalidraw --help.\n');
    return 1;
  }

  try {
    if (png) return await runPng(targets, { dir: pngDir, noUpload: noUpload }, io);
    var built = buildSkeleton(parseJson(readInput(targets[0], io.stdin)));
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

async function runPng(targets, opts, io) {
  var stdout = io.stdout;
  var names = targets.map(sceneName);
  var dup = names.find(function (n, k) { return names.indexOf(n) !== k; });
  if (dup) throw new Error('two inputs are both named "' + dup + '"; their PNGs would overwrite each other');
  if (targets.filter(function (t) { return t === '-'; }).length > 1) throw new Error('stdin (-) can be read only once');

  // Read and build every input before drawing anything, so a typo in the
  // last file costs no renders.
  var items = targets.map(function (t, k) {
    var built = toScene(parseJson(readInput(t, io.stdin)));
    return { name: names[k], scene: built.scene, warnings: built.warnings };
  });

  var render = await import('../src/excalidraw-png.js');
  var dir;
  if (opts.dir) dir = resolve(opts.dir);
  else {
    dir = render.defaultRenderDir(io.env);
    render.cleanRenderCache(dir);
  }
  mkdirSync(dir, { recursive: true });

  var blocks = [];
  for (var k = 0; k < items.length; k++) {
    var it = items[k];
    var out;
    try {
      out = await render.renderScene(it.scene);
    } catch (e) {
      throw new Error(it.name + ': ' + (e && e.message ? e.message : e));
    }
    var file = resolve(dir, it.name + '.png');
    var reviewFile = resolve(dir, it.name + '.review.png');
    writeFileSync(file, out.png);
    writeFileSync(reviewFile, out.review);
    var url = opts.noUpload ? null : await upload(it.scene, io.fetch);
    var warnings = it.warnings.slice();
    if (out.scale < 3) warnings.push('drawn at scale ' + out.scale + ' to stay under 25,000,000 pixels');
    if (render.hasCjkText(it.scene)) warnings.push('CJK text is not drawn: the CJK font is not shipped');
    var lines = ['![' + it.name + '](attach:' + it.name + ')'];
    if (url) lines.push('[Edit this diagram](' + url + ')');
    lines.push(JSON.stringify(it.name) + ': ' + JSON.stringify('@file64:' + file));
    lines.push('review: ' + reviewFile);
    warnings.forEach(function (w) { lines.push('warning: ' + w); });
    blocks.push(lines.join('\n') + '\n');
  }
  stdout.write(blocks.join('\n'));
  stdout.write('\nCheck a drawing by its Mermaid preview first (c2m excalidraw <file> --no-upload, or c2m diagrams show <file> for a whole scene); open the review PNG only if that is not enough.\n');
  return 0;
}
