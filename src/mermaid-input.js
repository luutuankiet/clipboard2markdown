// Mermaid source (.mmd) -> Excalidraw scene for `c2m excalidraw`.
// @excalidraw/mermaid-to-excalidraw needs a DOM to run mermaid's layout, so it
// runs inside the same jsdom the PNG renderer uses (src/excalidraw-png.js),
// with estimated text sizes standing in for a browser's layout.

import { loadExcalidraw } from './excalidraw-png.js';

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

// A label Excalidraw wrapped mid-word because its shape came out narrow
// (short labels in diamonds: "OK?" -> "OK / ?") goes back on one line, and
// the shape grows around its centre to fit it.
export function unwrapLabels(elements) {
  var byId = {};
  elements.forEach(function (e) { byId[e.id] = e; });
  elements.forEach(function (t) {
    var box = t.type === 'text' && t.containerId && byId[t.containerId];
    if (!box || !t.originalText || t.text === t.originalText || /\n/.test(t.originalText)) return;
    var w = t.originalText.length * t.fontSize * 0.55;
    var need = box.type === 'diamond' ? 2 * w + 40 : box.type === 'ellipse' ? 1.42 * w + 30 : w + 40;
    if (box.width < need) { box.x -= (need - box.width) / 2; box.width = need; }
    if (box.type === 'diamond' && box.height < need / 2) { box.y -= (need / 2 - box.height) / 2; box.height = need / 2; }
    t.text = t.originalText;
    t.width = w;
    t.height = t.fontSize * t.lineHeight;
    t.x = box.x + (box.width - w) / 2;
    t.y = box.y + (box.height - t.height) / 2;
  });
  return elements;
}

// Returns { scene, preview, warnings }, the same shape as buildSkeleton, so
// the caller treats a .mmd input like any other. The preview is the source.
export async function mermaidToScene(source) {
  var text = String(source || '').trim();
  if (!text) throw new Error('the Mermaid file is empty');
  var m = await loadExcalidraw();
  var parsed;
  try {
    parsed = await m.parseMermaidToExcalidraw(text, { themeVariables: { fontSize: '20px' } });
  } catch (e) {
    var msg = e && e.message ? e.message : String(e);
    throw new Error('Mermaid did not parse: ' + msg.split('\n').slice(0, 4).join(' '));
  }
  var warnings = [];
  var elements = m.convertToExcalidrawElements(parsed.elements, { regenerateIds: false });
  // Diagram types the converter has no shapes for (class, state, gantt, pie ...)
  // come back as one embedded picture of mermaid's own SVG, drawn with our
  // estimated text sizes.
  if (elements.some(function (e) { return e.type === 'image'; })) {
    warnings.push('this Mermaid diagram type has no Excalidraw shapes; it is drawn as one picture, not editable boxes. Flowchart and sequence diagrams convert to shapes');
  }
  unwrapLabels(elements);
  applyHouseStyle(elements);
  return {
    scene: { type: 'excalidraw', version: 2, source: 'c2m', elements: elements, appState: { viewBackgroundColor: '#ffffff' }, files: parsed.files || {} },
    preview: text,
    warnings: warnings,
  };
}
