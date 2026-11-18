// Mermaid source (.mmd) -> Excalidraw scene for `c2m excalidraw`.
// @excalidraw/mermaid-to-excalidraw needs a DOM to run mermaid's layout, so it
// runs inside the same jsdom the PNG renderer uses (src/excalidraw-png.js),
// with estimated text sizes standing in for a browser's layout.

import { loadExcalidraw } from './excalidraw-png.js';
import { edgePoint } from './diagrams/skeleton.js';

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond']);
const INK = '#1e1e1e';

// The house style's plan pass: every node white with a dark stroke, dark text
// and arrows. Mermaid's own fills (grey actors, yellow notes, lilac subgraphs)
// would otherwise read as emphasis. Lifelines and other plain lines keep their
// light grey so they stay in the background. Dashes are kept: they carry
// meaning (replies, notes, dotted links).
export function applyHouseStyle(elements) {
  elements.forEach(function (el) {
    if (SHAPES.has(el.type)) {
      el.backgroundColor = '#ffffff';
      el.fillStyle = 'solid';
      el.strokeColor = INK;
    } else if (el.type === 'text' || el.type === 'arrow') {
      el.strokeColor = INK;
    }
  });
  return elements;
}

// Glyph width as a share of the font size, shared with the scene lint so the
// boxes drawn here are never flagged there.
export const CHAR_W = 0.6;

// A label Excalidraw wrapped mid-word because its shape came out narrow
// (short labels in diamonds: "OK?" -> "OK / ?") goes back on one line, and a
// label with deliberate line breaks (from <br>) gets its shape checked too.
// The shape grows around its centre to fit the text.
export function unwrapLabels(elements) {
  var byId = {};
  elements.forEach(function (e) { byId[e.id] = e; });
  elements.forEach(function (t) {
    var box = t.type === 'text' && t.containerId && byId[t.containerId];
    if (!box || !t.originalText) return;
    var multi = /\n/.test(t.originalText);
    if (t.text === t.originalText && !multi) return;
    var lines = t.originalText.split('\n');
    var longest = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
    var w = longest * t.fontSize * CHAR_W;
    var h = lines.length * t.fontSize * t.lineHeight;
    var k = box.type === 'diamond' ? 2 : box.type === 'ellipse' ? 1.42 : 1;
    var pad = box.type === 'diamond' ? 40 : box.type === 'ellipse' ? 30 : 40;
    var needW = k * w + pad;
    var needH = k * h + (box.type === 'rectangle' ? 20 : pad);
    if (box.width < needW) { box.x -= (needW - box.width) / 2; box.width = needW; }
    if (box.height < needH) { box.y -= (needH - box.height) / 2; box.height = needH; }
    if (box.type === 'diamond' && box.height < box.width / 2) { box.y -= (box.width / 2 - box.height) / 2; box.height = box.width / 2; }
    t.text = t.originalText;
    t.width = w;
    t.height = h;
    t.x = box.x + (box.width - w) / 2;
    t.y = box.y + (box.height - h) / 2;
  });
  return elements;
}

// Mermaid's subgraph frames are sized before the labels are measured, so a
// frame can come out narrower than the node inside it. Each frame (a shape
// named by a "subgraph_group_<id>" group id) grows to hold its member shapes
// with a margin and a title strip, and its title is re-centred. Frames are
// processed smallest first so a nested frame is already settled when its
// parent is measured. Sibling frames pushed into one another are left for the
// lint to report; this pass does not move nodes.
export function fitFrames(elements) {
  var PAD = 20, TITLE = 36;
  var frames = elements.filter(function (e) {
    var gid = 'subgraph_group_' + e.id;
    return SHAPES.has(e.type) && elements.some(function (m) { return (m.groupIds || []).indexOf(gid) >= 0; });
  }).sort(function (a, b) { return a.width * a.height - b.width * b.height; });
  frames.forEach(function (fr) {
    var gid = 'subgraph_group_' + fr.id;
    var members = elements.filter(function (m) { return m !== fr && SHAPES.has(m.type) && (m.groupIds || []).indexOf(gid) >= 0; });
    if (!members.length) return;
    var x0 = Math.min.apply(null, members.map(function (m) { return m.x; })) - PAD;
    var y0 = Math.min.apply(null, members.map(function (m) { return m.y; })) - TITLE;
    var x1 = Math.max.apply(null, members.map(function (m) { return m.x + m.width; })) + PAD;
    var y1 = Math.max.apply(null, members.map(function (m) { return m.y + m.height; })) + PAD;
    // Tight fit: mermaid also leaves frames far taller than their contents.
    var nx0 = x0, ny0 = y0, nx1 = x1, ny1 = y1;
    if (nx0 === fr.x && ny0 === fr.y && nx1 === fr.x + fr.width && ny1 === fr.y + fr.height) return;
    var oldTop = fr.y;
    fr.x = nx0; fr.y = ny0; fr.width = nx1 - nx0; fr.height = ny1 - ny0;
    // The title: a text in the group that is not inside a node, near the frame's old top edge.
    elements.forEach(function (t) {
      if (t.type !== 'text' || (t.containerId && t.containerId !== fr.id) || (t.groupIds || []).indexOf(gid) < 0) return;
      if (Math.abs(t.y - oldTop) > TITLE) return;
      t.x = fr.x + (fr.width - t.width) / 2;
      t.y = fr.y + 6;
    });
  });
  return elements;
}

// Growing a node (unwrapLabels) leaves the arrows that were bound to it
// ending short of or inside the new outline. Each bound end that is no longer
// on the outline is moved to where the line towards the arrow's next point
// meets it; the arrow's other points keep their places.
export function reanchorArrows(elements) {
  var byId = {};
  elements.forEach(function (e) { byId[e.id] = e; });
  elements.forEach(function (a) {
    if (a.type !== 'arrow' || !a.points || a.points.length < 2) return;
    ['start', 'end'].forEach(function (which) {
      var b = a[which + 'Binding'], shape = b && byId[b.elementId];
      if (!shape || !SHAPES.has(shape.type)) return;
      var abs = a.points.map(function (p) { return [a.x + p[0], a.y + p[1]]; });
      var i = which === 'start' ? 0 : abs.length - 1;
      var next = abs[which === 'start' ? 1 : abs.length - 2];
      var cx = shape.x + shape.width / 2, cy = shape.y + shape.height / 2;
      var onOutline = edgePoint(shape, [cx + (abs[i][0] - cx) * 1e3, cy + (abs[i][1] - cy) * 1e3]);
      if (Math.hypot(onOutline[0] - abs[i][0], onOutline[1] - abs[i][1]) <= 6) return;
      abs[i] = edgePoint(shape, next);
      a.x = abs[0][0]; a.y = abs[0][1];
      a.points = abs.map(function (p) { return [p[0] - abs[0][0], p[1] - abs[0][1]]; });
      var xs = a.points.map(function (p) { return p[0]; }), ys = a.points.map(function (p) { return p[1]; });
      a.width = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      a.height = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    });
  });
  return elements;
}

// Source-level fixes before Mermaid sees the text. <br> in a label is a line
// break to Mermaid but would be drawn as the literal characters, so it becomes
// a real newline. A left-to-right flowchart is laid out far wider than a page,
// so it is redrawn top-down.
export function prepareMermaid(text) {
  var warnings = [];
  var out = text.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/^(\s*(?:flowchart|graph)\s+)(LR|RL)\b/im, function (m, head, dir) {
    warnings.push('rewrote "' + head.trim() + ' ' + dir + '" to TD: left-to-right layouts come out wider than a page and print too small');
    return head + 'TD';
  });
  return { text: out, warnings: warnings };
}

// Returns { scene, preview, warnings }, the same shape as buildSkeleton, so
// the caller treats a .mmd input like any other. The preview is the source.
export async function mermaidToScene(source) {
  var text = String(source || '').trim();
  if (!text) throw new Error('the Mermaid file is empty');
  var prepared = prepareMermaid(text);
  var warnings = prepared.warnings;
  var forParse = prepared.text;
  var m = await loadExcalidraw();
  var parsed;
  try {
    parsed = await m.parseMermaidToExcalidraw(forParse, { themeVariables: { fontSize: '20px' } });
  } catch (e) {
    var msg = e && e.message ? e.message : String(e);
    throw new Error('Mermaid did not parse: ' + msg.split('\n').slice(0, 4).join(' '));
  }
  var elements = m.convertToExcalidrawElements(parsed.elements, { regenerateIds: false });
  // Diagram types the converter has no shapes for (class, state, gantt, pie ...)
  // come back as one embedded picture of mermaid's own SVG, drawn with our
  // estimated text sizes.
  if (elements.some(function (e) { return e.type === 'image'; })) {
    warnings.push('this Mermaid diagram type has no Excalidraw shapes; it is drawn as one picture, not editable boxes. Flowchart and sequence diagrams convert to shapes');
  }
  unwrapLabels(elements);
  fitFrames(elements);
  reanchorArrows(elements);
  applyHouseStyle(elements);
  return {
    scene: { type: 'excalidraw', version: 2, source: 'c2m', elements: elements, appState: { viewBackgroundColor: '#ffffff' }, files: parsed.files || {} },
    preview: text,
    warnings: warnings,
  };
}
