// Short JSON diagram description -> full Excalidraw scene, a Mermaid preview
// and layout warnings. Pure: nothing here touches the network; the CLI uploads.
//
// The agent places shapes itself; this module fills Excalidraw's required
// fields, turns `label` into bound text, binds arrows both ways and sizes text,
// because excalidraw.com does not recompute text dimensions on load.

import { measureText, containerFactor, TEXT_METRICS } from './edit.js';
import { sceneToMermaid } from './scene-to-mermaid.js';
import { absolutePoints, bounds, TUNING } from './scene-model.js';

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond']);
const LINEAR = new Set(['arrow', 'line']);
// Excalidraw MCP pseudo-elements: camera moves and checkpoint commands, not drawing.
const MCP_PSEUDO = new Set(['cameraUpdate', 'delete', 'restoreCheckpoint']);
// Skeleton-only fields that must not leak into the scene.
const SKELETON_FIELDS = ['label', 'start', 'end'];
const BINDING_GAP = 4;
// Excalidraw's own inset for bound text (BOUND_TEXT_PADDING); using the same
// value means the editor does not move a title when the scene is opened.
const BOUND_TEXT_PADDING = 5;
const TEXT_ALIGNS = new Set(['left', 'center', 'right']);
const VERTICAL_ALIGNS = new Set(['top', 'middle', 'bottom']);

// FNV-1a over the element id. `seed` drives the hand-drawn wobble, so deriving
// it from the id makes the same diagram draw the same way on every run; a
// random seed made two renders of one diagram not line up. Never 0: rough.js
// falls back to Math.random for a zero seed.
function seedFromId(id, salt) {
  var s = salt + String(id), h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 2147483646) + 1;
}

function base(type, id) {
  return {
    id: id, type: type, x: 0, y: 0, width: 0, height: 0, angle: 0,
    strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2,
    strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null,
    seed: seedFromId(id, ''), version: 1, versionNonce: seedFromId(id, 'nonce:'), isDeleted: false, boundElements: null,
    updated: Date.now(), link: null, locked: false,
  };
}

function textElement(id, text, fontSize, extra) {
  var size = measureText(text, fontSize);
  return Object.assign(base('text', id), {
    width: size.width, height: size.height, text: text, originalText: text, fontSize: fontSize,
    fontFamily: 5, textAlign: 'left', verticalAlign: 'top', containerId: null, autoResize: true,
    lineHeight: TEXT_METRICS.lineHeight,
  }, extra);
}

function addBound(el, ref) {
  el.boundElements = (el.boundElements || []).filter(function (b) { return b.id !== ref.id; }).concat([ref]);
}

function isNum(v) { return typeof v === 'number' && isFinite(v); }

function describe(raw, i) {
  return 'element ' + i + (raw && raw.id ? ' ("' + raw.id + '")' : '');
}

// `start: {id}` and MCP-style `startBinding: {elementId}` mean the same thing.
function bindingTarget(raw, end) {
  var short = raw[end];
  var long = raw[end + 'Binding'];
  if (short && short.id != null) return String(short.id);
  if (long && long.elementId != null) return String(long.elementId);
  return null;
}

function labelOf(raw) {
  if (raw.label == null) return null;
  if (typeof raw.label === 'string') return { text: raw.label };
  if (typeof raw.label === 'object' && raw.label.text != null) return raw.label;
  return null;
}

// Where the ray from a shape's centre towards `toward` leaves its bounding box.
function edgePoint(el, toward) {
  var cx = el.x + el.width / 2, cy = el.y + el.height / 2;
  var dx = toward[0] - cx, dy = toward[1] - cy;
  if (!dx && !dy) return [cx, cy];
  var sx = dx ? (el.width / 2) / Math.abs(dx) : Infinity;
  var sy = dy ? (el.height / 2) / Math.abs(dy) : Infinity;
  var s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

function centre(el) { return [el.x + el.width / 2, el.y + el.height / 2]; }

function arrowMidpoint(el) {
  var pts = el.points;
  var a = pts[Math.floor((pts.length - 1) / 2)], b = pts[Math.ceil((pts.length - 1) / 2)];
  return [el.x + (a[0] + b[0]) / 2, el.y + (a[1] + b[1]) / 2];
}

function routeArrow(el, from, to) {
  var start = edgePoint(from, centre(to));
  var end = edgePoint(to, centre(from));
  var len = Math.hypot(end[0] - start[0], end[1] - start[1]) || 1;
  // Pull both ends back by the binding gap so the arrowhead does not sit on the stroke.
  var ux = (end[0] - start[0]) / len, uy = (end[1] - start[1]) / len;
  start = [start[0] + ux * BINDING_GAP, start[1] + uy * BINDING_GAP];
  end = [end[0] - ux * BINDING_GAP, end[1] - uy * BINDING_GAP];
  el.x = start[0];
  el.y = start[1];
  el.points = [[0, 0], [end[0] - start[0], end[1] - start[1]]];
}

function fitLinear(el) {
  var xs = el.points.map(function (p) { return p[0]; }), ys = el.points.map(function (p) { return p[1]; });
  el.width = Math.max.apply(null, xs) - Math.min.apply(null, xs);
  el.height = Math.max.apply(null, ys) - Math.min.apply(null, ys);
}

function pickAlign(fromLabel, fromShape, allowed) {
  if (allowed.has(fromLabel)) return fromLabel;
  if (allowed.has(fromShape)) return fromShape;
  return null;
}

// Same test the Mermaid reader uses for a subgraph: the shape fully encloses
// another shape and is bigger than it.
function encloses(shape, shapes) {
  var outer = { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
  return shapes.some(function (o) {
    if (o === shape) return false;
    var inner = { x: o.x, y: o.y, w: o.width, h: o.height };
    var k = TUNING.containmentSlack;
    return contains({ x: outer.x - k, y: outer.y - k, w: outer.w + 2 * k, h: outer.h + 2 * k }, inner) &&
      outer.w * outer.h > inner.w * inner.h;
  });
}

// Excalidraw's computeBoundTextPosition, so the text sits where the editor
// itself would put it for this alignment.
function placeInShape(t, shape) {
  var ox = BOUND_TEXT_PADDING, oy = BOUND_TEXT_PADDING;
  if (shape.type === 'ellipse') {
    ox += (shape.width / 2) * (1 - Math.SQRT1_2);
    oy += (shape.height / 2) * (1 - Math.SQRT1_2);
  } else if (shape.type === 'diamond') {
    ox += shape.width / 4;
    oy += shape.height / 4;
  }
  var availW = shape.width - 2 * ox, availH = shape.height - 2 * oy;
  var x0 = shape.x + ox, y0 = shape.y + oy;
  t.x = t.textAlign === 'left' ? x0 : t.textAlign === 'right' ? x0 + availW - t.width : x0 + (availW - t.width) / 2;
  t.y = t.verticalAlign === 'top' ? y0 : t.verticalAlign === 'bottom' ? y0 + availH - t.height : y0 + (availH - t.height) / 2;
}

// Throws on input that cannot become a scene at all; everything recoverable is
// a warning instead, so the agent still gets a link.
export function normalizeSkeleton(input) {
  var list = Array.isArray(input) ? input : input && Array.isArray(input.elements) ? input.elements : null;
  if (!list) throw new Error('input must be a JSON array of elements (or an object with an "elements" array)');

  var warnings = [];
  var kept = [];
  list.forEach(function (raw, i) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(describe(raw, i) + ' is not an object');
    if (MCP_PSEUDO.has(raw.type)) {
      warnings.push('dropped ' + describe(raw, i) + ': "' + raw.type + '" is an Excalidraw MCP command, not a drawable element');
      return;
    }
    if (!SHAPES.has(raw.type) && !LINEAR.has(raw.type) && raw.type !== 'text') {
      warnings.push('dropped ' + describe(raw, i) + ': unsupported type "' + raw.type + '" (use rectangle, ellipse, diamond, text, arrow, line)');
      return;
    }
    if (raw.id == null || raw.id === '') throw new Error(describe(raw, i) + ' needs an "id"');
    if (SHAPES.has(raw.type) || raw.type === 'text') {
      if (!isNum(raw.x) || !isNum(raw.y)) throw new Error(describe(raw, i) + ' needs numeric "x" and "y"');
    }
    if (SHAPES.has(raw.type) && (!isNum(raw.width) || !isNum(raw.height) || raw.width <= 0 || raw.height <= 0)) {
      throw new Error(describe(raw, i) + ' needs positive numeric "width" and "height"');
    }
    if (raw.type === 'text' && (raw.text == null || raw.text === '')) throw new Error(describe(raw, i) + ' needs "text"');
    kept.push({ raw: raw, index: i });
  });

  var elements = [];
  var byId = new Map();
  var labels = [];
  var arrows = [];

  kept.forEach(function (k) {
    var raw = k.raw;
    var id = String(raw.id);
    var el = base(raw.type, id);
    Object.keys(raw).forEach(function (key) {
      if (SKELETON_FIELDS.indexOf(key) === -1) el[key] = raw[key];
    });
    el.id = id;
    if (raw.type === 'rectangle' && raw.roundness === undefined) el.roundness = { type: 3 };
    if (raw.type === 'diamond' && raw.roundness === undefined) el.roundness = { type: 2 };

    if (raw.type === 'text') {
      var fs = raw.fontSize || 20;
      var t = textElement(id, String(raw.text), fs, {});
      Object.keys(raw).forEach(function (key) { if (SKELETON_FIELDS.indexOf(key) === -1) t[key] = raw[key]; });
      var size = measureText(t.text, fs);
      t.id = id;
      t.text = String(raw.text);
      t.originalText = t.text;
      t.fontSize = fs;
      t.width = size.width;
      t.height = size.height;
      el = t;
    }

    if (LINEAR.has(raw.type)) {
      el.x = isNum(raw.x) ? raw.x : 0;
      el.y = isNum(raw.y) ? raw.y : 0;
      el.startArrowhead = raw.startArrowhead !== undefined ? raw.startArrowhead : null;
      el.endArrowhead = raw.endArrowhead !== undefined ? raw.endArrowhead : raw.type === 'arrow' ? 'arrow' : null;
      el.roundness = raw.roundness !== undefined ? raw.roundness : { type: 2 };
      el.lastCommittedPoint = null;
      el.startBinding = null;
      el.endBinding = null;
      arrows.push({ el: el, raw: raw, index: k.index, start: bindingTarget(raw, 'start'), end: bindingTarget(raw, 'end') });
    }

    var label = labelOf(raw);
    if (label && (SHAPES.has(raw.type) || LINEAR.has(raw.type))) {
      labels.push({
        container: el, text: String(label.text), fontSize: label.fontSize || raw.fontSize || 20, strokeColor: label.strokeColor || raw.strokeColor,
        textAlign: pickAlign(label.textAlign, raw.textAlign, TEXT_ALIGNS),
        verticalAlign: pickAlign(label.verticalAlign, raw.verticalAlign, VERTICAL_ALIGNS),
      });
    }
    elements.push(el);
    if (!byId.has(id)) byId.set(id, el);
  });

  // Arrows: resolve bindings, route between bound shapes when no points were given.
  arrows.forEach(function (a) {
    var el = a.el, raw = a.raw;
    var from = a.start != null ? byId.get(a.start) : null;
    var to = a.end != null ? byId.get(a.end) : null;
    if (from && !SHAPES.has(from.type) && from.type !== 'text') from = null;
    if (to && !SHAPES.has(to.type) && to.type !== 'text') to = null;

    var hasPoints = Array.isArray(raw.points) && raw.points.length >= 2;
    if (hasPoints) {
      el.points = raw.points.map(function (p) { return [p[0], p[1]]; });
    } else if (from && to && !isNum(raw.width) && !isNum(raw.height)) {
      routeArrow(el, from, to);
    } else {
      el.points = [[0, 0], [isNum(raw.width) ? raw.width : 100, isNum(raw.height) ? raw.height : 0]];
    }
    fitLinear(el);

    if (from) {
      el.startBinding = { elementId: from.id, focus: 0, gap: BINDING_GAP };
      addBound(from, { id: el.id, type: 'arrow' });
    }
    if (to) {
      el.endBinding = { elementId: to.id, focus: 0, gap: BINDING_GAP };
      addBound(to, { id: el.id, type: 'arrow' });
    }
    a.from = from;
    a.to = to;
  });

  // Labels become bound text. A container (a shape that encloses another shape,
  // which the Mermaid preview reads as a subgraph) gets its title in the top-left
  // corner so it stays clear of the boxes inside; any other shape, and every
  // arrow, gets its label centred. An explicit textAlign / verticalAlign wins.
  var shapeEls = elements.filter(function (e) { return SHAPES.has(e.type); });
  var usedIds = new Set(elements.map(function (e) { return e.id; }));
  labels.forEach(function (l) {
    var id = l.container.id + '-label';
    for (var n = 2; usedIds.has(id); n++) id = l.container.id + '-label' + n;
    usedIds.add(id);
    var linear = LINEAR.has(l.container.type);
    var isContainer = !linear && encloses(l.container, shapeEls);
    var t = textElement(id, l.text, l.fontSize, {
      textAlign: linear ? 'center' : l.textAlign || (isContainer ? 'left' : 'center'),
      verticalAlign: linear ? 'middle' : l.verticalAlign || (isContainer ? 'top' : 'middle'),
      containerId: l.container.id,
    });
    if (l.strokeColor) t.strokeColor = l.strokeColor;
    if (linear) {
      var c = arrowMidpoint(l.container);
      t.x = c[0] - t.width / 2;
      t.y = c[1] - t.height / 2;
    } else {
      placeInShape(t, l.container);
    }
    addBound(l.container, { id: id, type: 'text' });
    elements.push(t);
  });

  var scene = {
    type: 'excalidraw',
    version: 2,
    source: 'https://github.com/luutuankiet/clipboard2markdown',
    elements: elements,
    appState: { viewBackgroundColor: '#ffffff', gridSize: null },
    files: {},
  };
  return { scene: scene, warnings: warnings, arrows: arrows, kept: kept };
}

// ------------------------------------------------------------------- lint ---

function box(el) {
  if (el.type === 'text' || SHAPES.has(el.type)) return { x: el.x, y: el.y, w: el.width, h: el.height };
  return bounds(el);
}

function overlapArea(a, b) {
  var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  var h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

// Shapes closer than this, edge to edge, read as one blob at document width.
// Well under the 120 px the help asks for between joined shapes, so only a
// layout that is clearly cramped is warned about.
export const CROWDED_GAP = 30;

// Edge-to-edge distance between two boxes that do not overlap.
function gapBetween(a, b) {
  var dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  var dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.sqrt(dx * dx + dy * dy);
}

// Do segments p1-p2 and q1-q2 cross at a point inside both? Touching or
// collinear segments do not count.
function segmentsCross(p1, p2, q1, q2) {
  function side(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
  var d1 = side(q1, q2, p1), d2 = side(q1, q2, p2), d3 = side(p1, p2, q1), d4 = side(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function pathsCross(a, b) {
  var pa = absolutePoints(a), pb = absolutePoints(b);
  for (var i = 0; i + 1 < pa.length; i++) {
    for (var j = 0; j + 1 < pb.length; j++) {
      if (segmentsCross(pa[i], pa[i + 1], pb[j], pb[j + 1])) return true;
    }
  }
  return false;
}

export function lintSkeleton(normalized) {
  var warnings = [];
  var elements = normalized.scene.elements;

  var seen = new Map();
  normalized.kept.forEach(function (k) {
    var id = String(k.raw.id);
    if (seen.has(id)) warnings.push('duplicate id "' + id + '" (elements ' + seen.get(id) + ' and ' + k.index + '); bindings attach to the first one');
    else seen.set(id, k.index);
  });

  var shapes = elements.filter(function (e) { return SHAPES.has(e.type) || (e.type === 'text' && !e.containerId); });
  for (var i = 0; i < shapes.length; i++) {
    for (var j = i + 1; j < shapes.length; j++) {
      var a = box(shapes[i]), b = box(shapes[j]);
      if (overlapArea(a, b) && !contains(a, b) && !contains(b, a)) {
        warnings.push('"' + shapes[i].id + '" and "' + shapes[j].id + '" overlap; move them apart or nest one fully inside the other');
      } else if (SHAPES.has(shapes[i].type) && SHAPES.has(shapes[j].type) && !overlapArea(a, b)) {
        var gap = gapBetween(a, b);
        if (gap < CROWDED_GAP) {
          warnings.push('"' + shapes[i].id + '" and "' + shapes[j].id + '" are ' + Math.round(gap) + ' px apart; leave at least ' +
            CROWDED_GAP + ' px (120 px if an arrow joins them)');
        }
      }
    }
  }

  var byId = new Map();
  elements.forEach(function (e) { if (!byId.has(e.id)) byId.set(e.id, e); });
  elements.forEach(function (t) {
    if (t.type !== 'text' || !t.containerId) return;
    var c = byId.get(t.containerId);
    if (!c || !SHAPES.has(c.type)) return;
    var f = containerFactor(c.type);
    var availW = c.width / f - 2 * TEXT_METRICS.padding;
    var availH = c.height / f - 2 * TEXT_METRICS.padding;
    if (t.width > availW || t.height > availH) {
      var needW = Math.ceil((t.width + 2 * TEXT_METRICS.padding) * f);
      var needH = Math.ceil((t.height + 2 * TEXT_METRICS.padding) * f);
      warnings.push('label of "' + c.id + '" does not fit (' + c.width + 'x' + c.height + ', needs about ' +
        Math.max(needW, c.width) + 'x' + Math.max(needH, c.height) + '); widen the shape, add a line break, or shorten the text');
    }
  });

  normalized.arrows.forEach(function (a) {
    ['start', 'end'].forEach(function (end) {
      var target = a[end];
      var bound = end === 'start' ? a.from : a.to;
      if (target != null && !bound) {
        warnings.push(a.el.type + ' "' + a.el.id + '" ' + end + ' points at "' + target + '", which is not a shape or text in this diagram');
      } else if (target == null && a.el.type === 'arrow') {
        warnings.push('arrow "' + a.el.id + '" ' + end + ' is not attached to a shape; add "' + end + '": {"id": "<shape id>"}');
      }
    });
  });

  // Two arrows that share a shape meet there by design; only a crossing
  // between unrelated arrows is a tangle.
  var arrows = normalized.arrows.filter(function (a) { return a.el.type === 'arrow' || a.el.type === 'line'; });
  for (var x = 0; x < arrows.length; x++) {
    for (var y = x + 1; y < arrows.length; y++) {
      var p = arrows[x], q = arrows[y];
      var ends = [p.from, p.to].filter(Boolean);
      if ([q.from, q.to].some(function (e) { return e && ends.indexOf(e) !== -1; })) continue;
      if (pathsCross(p.el, q.el)) {
        warnings.push('arrows "' + p.el.id + '" and "' + q.el.id + '" cross; move a shape or route one around with "points"');
      }
    }
  }

  return warnings;
}

// The one pure seam: skeleton in, everything but the upload out.
export function buildSkeleton(input) {
  var normalized = normalizeSkeleton(input);
  var lint = lintSkeleton(normalized);
  var preview = sceneToMermaid(normalized.scene, { sourceUrl: 'c2m excalidraw' });
  return {
    scene: normalized.scene,
    // The header line names a source link; there is none yet.
    preview: preview.text.replace(/^%% generated from .*\n/, ''),
    warnings: normalized.warnings.concat(lint, preview.warnings),
  };
}
