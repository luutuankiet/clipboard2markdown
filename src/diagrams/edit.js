// Patch an existing canvas in place with a small set of operations, so the
// human's layout, colours and annotations survive an agent's change.
//
// Ops reference the Mermaid ids printed by sceneToMermaid; they are resolved with
// the same analyzeScene, re-run after every op. applyEdits works on a deep copy
// and throws on the first bad op, so a typo never yields a half-edited canvas.

import { analyzeScene, bounds, center, isReadableId } from './scene-model.js';
import { sceneToMermaid, flowDirection } from './scene-to-mermaid.js';
import { loadScene, saveScene, parseShareLink, normalizeScene } from './share-link.js';

// Text size estimate for Excalidraw's default hand-drawn font. Errs wide so new
// or renamed labels do not clip.
export const TEXT_METRICS = { charWidth: 0.68, lineHeight: 1.25, padding: 10 };
// Room between boxes for a labelled arrow to stay visible.
const DEFAULT_GAP = 120;
const GROUP_PADDING = 24;

const OP_FIELDS = {
  rename: ['node', 'label'],
  add: ['id', 'label', 'near'],
  connect: ['from', 'to'],
  disconnect: ['from', 'to'],
  'relabel-edge': ['from', 'to', 'label'],
  remove: ['node'],
};

function randomInt() { return Math.floor(Math.random() * 2 ** 31); }

function randomId() {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var bytes = globalThis.crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, function (b) { return alphabet[b % alphabet.length]; }).join('');
}

function touch(el) {
  el.version = (el.version || 1) + 1;
  el.versionNonce = randomInt();
  el.updated = Date.now();
}

export function measureText(text, fontSize) {
  var lines = String(text).split('\n');
  var longest = Math.max.apply(null, lines.map(function (l) { return l.length; }));
  return {
    width: Math.ceil(Math.max(1, longest) * TEXT_METRICS.charWidth * fontSize),
    height: Math.ceil(lines.length * TEXT_METRICS.lineHeight * fontSize),
  };
}

// How much bigger than its text a container must be, by shape.
function containerFactor(type) {
  if (type === 'ellipse') return Math.SQRT2;
  if (type === 'diamond') return 2;
  return 1;
}

// Word-wrap to the container's width, as Excalidraw does for bound text: the
// box keeps its width (so arrow ends at its sides stay outside it) and grows in
// height. A single word longer than a line still widens the box.
export function wrapLabel(label, fontSize, containerWidth, type) {
  var avail = containerWidth / containerFactor(type) - 2 * TEXT_METRICS.padding;
  var maxChars = Math.max(1, Math.floor(avail / (TEXT_METRICS.charWidth * fontSize)));
  return String(label).split('\n').map(function (para) {
    var lines = [];
    var line = '';
    para.split(/\s+/).filter(Boolean).forEach(function (word) {
      if (!line) line = word;
      else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
      else { lines.push(line); line = word; }
    });
    lines.push(line);
    return lines.join('\n');
  }).join('\n');
}

// Size the text element to its content and centre it in its container,
// growing the container (around its centre) when the text would not fit.
// `originalText` keeps the unwrapped label; that is what the reader prints.
function fitBoundText(textEl, container) {
  if (container && container.type !== 'arrow') {
    textEl.text = wrapLabel(textEl.originalText != null ? textEl.originalText : textEl.text, textEl.fontSize || 20, container.width, container.type);
  }
  var size = measureText(textEl.text, textEl.fontSize || 20);
  textEl.width = size.width;
  textEl.height = size.height;
  if (container) {
    var f = containerFactor(container.type);
    var needW = Math.ceil((size.width + 2 * TEXT_METRICS.padding) * f);
    var needH = Math.ceil((size.height + 2 * TEXT_METRICS.padding) * f);
    if (container.type !== 'arrow' && (container.width < needW || container.height < needH)) {
      var c = center(container);
      container.width = Math.max(container.width, needW);
      container.height = Math.max(container.height, needH);
      container.x = c[0] - container.width / 2;
      container.y = c[1] - container.height / 2;
      touch(container);
    }
    var cc = container.type === 'arrow' ? arrowMidpoint(container) : center(container);
    textEl.x = cc[0] - size.width / 2;
    textEl.y = cc[1] - size.height / 2;
  }
  touch(textEl);
}

function arrowMidpoint(arrow) {
  var pts = arrow.points || [[0, 0]];
  var a = pts[Math.floor((pts.length - 1) / 2)], b = pts[Math.ceil((pts.length - 1) / 2)];
  if (pts.length % 2 === 1) return [arrow.x + a[0], arrow.y + a[1]];
  return [arrow.x + (a[0] + b[0]) / 2, arrow.y + (a[1] + b[1]) / 2];
}

function setText(textEl, label) {
  textEl.text = label;
  textEl.originalText = label;
}

function newText(template, overrides) {
  return Object.assign({
    type: 'text', id: randomId(), x: 0, y: 0, width: 0, height: 0, angle: 0,
    strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2,
    strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null,
    seed: randomInt(), version: 1, versionNonce: randomInt(), isDeleted: false, boundElements: null,
    updated: Date.now(), link: null, locked: false, text: '', fontSize: 20, fontFamily: 5,
    textAlign: 'center', verticalAlign: 'middle', containerId: null, originalText: '',
    autoResize: true, lineHeight: 1.25,
  }, template ? {
    strokeColor: template.strokeColor, fontSize: template.fontSize, fontFamily: template.fontFamily,
    lineHeight: template.lineHeight || 1.25, opacity: template.opacity,
  } : {}, overrides);
}

function addBound(el, ref) {
  el.boundElements = (el.boundElements || []).filter(function (b) { return b.id !== ref.id; }).concat([ref]);
}

function dropBound(el, id) {
  if (!el.boundElements) return;
  var next = el.boundElements.filter(function (b) { return b.id !== id; });
  if (next.length !== el.boundElements.length) { el.boundElements = next; touch(el); }
}

// ------------------------------------------------------------------ errors ---

function validIds(model) {
  return Array.from(model.byMermaidId.keys()).sort().join(', ') || '(none)';
}

function resolve(model, id, field, allowGroups) {
  var item = model.byMermaidId.get(id);
  if (!item || (!allowGroups && item.kind !== 'node')) {
    throw new Error('unknown ' + (allowGroups ? 'node or subgraph' : 'node') + ' "' + id + '" in ' + field + '; valid ids: ' + validIds(model));
  }
  return item;
}

function findEdges(model, from, to) {
  var a = resolve(model, from, 'from', true).el.id;
  var b = resolve(model, to, 'to', true).el.id;
  var hits = model.edges.filter(function (e) { return e.from === a && e.to === b; });
  if (!hits.length) {
    hits = model.edges.filter(function (e) { return e.kind !== 'arrow' && e.from === b && e.to === a; });
  }
  if (!hits.length) {
    var known = model.edges.map(function (e) { return model.mermaidId(e.from) + '->' + model.mermaidId(e.to); }).join(', ');
    throw new Error('no edge from "' + from + '" to "' + to + '"; edges: ' + (known || '(none)'));
  }
  return hits;
}

// --------------------------------------------------------------------- ops ---

function removeElements(scene, ids) {
  var gone = new Set(ids);
  scene.elements = scene.elements.filter(function (el) { return !gone.has(el.id); });
  scene.elements.forEach(function (el) {
    if (el.boundElements && el.boundElements.some(function (b) { return gone.has(b.id); })) {
      el.boundElements = el.boundElements.filter(function (b) { return !gone.has(b.id); });
      touch(el);
    }
    ['startBinding', 'endBinding'].forEach(function (k) {
      if (el[k] && gone.has(el[k].elementId)) { el[k] = null; touch(el); }
    });
  });
}

function opRename(scene, model, op) {
  var item = resolve(model, op.node, 'node', true);
  var label = item.label;
  if (label.frameName) { item.el.name = op.label; touch(item.el); return; }
  if (!label.els.length) {
    var t = newText(null, { containerId: item.el.id, frameId: item.el.frameId || null });
    setText(t, op.label);
    addBound(item.el, { type: 'text', id: t.id });
    scene.elements.push(t);
    fitBoundText(t, item.el);
    return;
  }
  var first = label.els[0];
  setText(first, op.label);
  if (label.bound) {
    fitBoundText(first, item.el);
  } else {
    var c = center(first);
    fitBoundText(first, null);
    first.x = c[0] - first.width / 2;
    first.y = c[1] - first.height / 2;
    if (item.kind === 'node') growToFit(item.el, first);
  }
  // A label spread over several free texts collapses into the first one.
  if (label.els.length > 1) removeElements(scene, label.els.slice(1).map(function (e) { return e.id; }));
}

function growToFit(shape, textEl) {
  var f = containerFactor(shape.type);
  var needW = Math.ceil((textEl.width + 2 * TEXT_METRICS.padding) * f);
  var needH = Math.ceil((textEl.height + 2 * TEXT_METRICS.padding) * f);
  if (shape.width >= needW && shape.height >= needH) return;
  var c = center(shape);
  shape.width = Math.max(shape.width, needW);
  shape.height = Math.max(shape.height, needH);
  shape.x = c[0] - shape.width / 2;
  shape.y = c[1] - shape.height / 2;
  touch(shape);
}

function overlaps(a, b, margin) {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

function ancestors(model, item) {
  var out = [];
  var p = item.parent;
  while (p && model.groups.has(p)) { out.push(model.groups.get(p)); p = model.groups.get(p).parent; }
  return out;
}

function opAdd(scene, model, op) {
  if (!isReadableId(op.id)) {
    throw new Error('add: id "' + op.id + '" must match ^[A-Za-z][A-Za-z0-9_]{0,23}$ and not be a Mermaid keyword');
  }
  if (model.byMermaidId.has(op.id) || model.byId.has(op.id)) {
    throw new Error('add: id "' + op.id + '" already exists; valid ids: ' + validIds(model));
  }
  var anchor = resolve(model, op.near, 'near', false);
  var side = op.side || (flowDirection(model) === 'LR' ? 'right' : 'below');
  if (['right', 'left', 'below', 'above'].indexOf(side) < 0) throw new Error('add: side must be right, left, below or above');

  var a = anchor.el;
  var anchorText = anchor.label.els[0];
  var fontSize = (anchorText && anchorText.fontSize) || 20;
  var size = measureText(wrapLabel(op.label, fontSize, a.width, a.type), fontSize);
  var f = containerFactor(a.type);
  var w = Math.max(a.width, Math.ceil((size.width + 2 * TEXT_METRICS.padding) * f));
  var h = Math.max(a.height, Math.ceil((size.height + 2 * TEXT_METRICS.padding) * f));

  var start = function (sd, ab) {
    return {
      right: [ab.x + ab.w + DEFAULT_GAP, ab.y + ab.h / 2 - h / 2],
      left: [ab.x - DEFAULT_GAP - w, ab.y + ab.h / 2 - h / 2],
      below: [ab.x + ab.w / 2 - w / 2, ab.y + ab.h + DEFAULT_GAP],
      above: [ab.x + ab.w / 2 - w / 2, ab.y - DEFAULT_GAP - h],
    }[sd];
  };
  var stepFor = function (sd) { return sd === 'right' || sd === 'left' ? [0, h + DEFAULT_GAP / 2] : [w + DEFAULT_GAP / 2, 0]; };

  var groupChain = ancestors(model, anchor);
  var ancestorIds = new Set(groupChain.map(function (g) { return g.el.id; }));
  var obstaclesFor = function (skip) {
    return scene.elements.filter(function (el) {
      return !el.isDeleted && el.type !== 'arrow' && !(el.type === 'line') && !el.containerId && !skip.has(el.id);
    }).map(bounds);
  };
  // Growing an enclosing group must not swallow a box that is not in it.
  var outsiders = groupChain.map(function (g) {
    return Array.from(model.nodes.values()).concat(Array.from(model.groups.values())).filter(function (o) {
      return o !== g && groupChain.indexOf(o) < 0 && !isInside(model, o, g);
    }).map(function (o) { return bounds(o.el); });
  });
  var blockedBy = function (obstacles, chain) {
    return function (b) {
      if (obstacles.some(function (o) { return overlaps(b, o, 16); })) return true;
      return chain.some(function (g, i) {
        var grown = grownBounds(bounds(g.el), b);
        return outsiders[i].some(function (o) { return overlaps(grown, o, 0) && !overlaps(bounds(g.el), o, 0); });
      });
    };
  };
  // Requested side first; if every slot there is blocked, the other sides.
  var search = function (ab, blocked) {
    var sides = [side].concat(['right', 'below', 'left', 'above'].filter(function (sd) { return sd !== side; }));
    for (var si = 0; si < sides.length; si++) {
      var p = start(sides[si], ab), st = stepFor(sides[si]);
      var b = { x: p[0], y: p[1], w: w, h: h };
      for (var tries = 0; tries < 12; tries++) {
        if (!blocked(b)) return { box: b, side: sides[si] };
        b = { x: b.x + st[0], y: b.y + st[1], w: w, h: h };
      }
    }
    return null;
  };
  var found = search(bounds(a), blockedBy(obstaclesFor(ancestorIds), groupChain));
  var note = null;
  if (found && found.side !== side) note = side + ' of ' + op.near + ' was blocked; placed ' + found.side + ' instead';
  // A group hemmed in on every side cannot grow: place the node just outside
  // the outermost group rather than on top of whatever surrounds it.
  if (!found && groupChain.length) {
    var outer = groupChain[groupChain.length - 1];
    found = search(bounds(outer.el), blockedBy(obstaclesFor(new Set()), []));
    if (found) {
      note = 'no room inside ' + outer.id + ' for ' + op.id + '; placed ' + found.side + ' of ' + outer.id + ', outside it';
      groupChain = [];
      outside = true;
    }
  }
  var box, outside = false;
  if (found) {
    box = found.box;
  } else {
    var p0 = start(side, bounds(a));
    box = { x: p0[0], y: p0[1], w: w, h: h };
    note = 'no free spot next to ' + op.near + '; placed ' + side + ' anyway, it may overlap';
  }

  var shape = Object.assign({}, a, {
    id: op.id, x: box.x, y: box.y, width: w, height: h, groupIds: [], boundElements: [], frameId: outside ? null : a.frameId || null,
    seed: randomInt(), version: 1, versionNonce: randomInt(), updated: Date.now(), isDeleted: false, link: null, locked: false,
  });
  delete shape.index;
  var text = newText(anchorText, { containerId: op.id, frameId: outside ? null : a.frameId || null });
  setText(text, op.label);
  shape.boundElements = [{ type: 'text', id: text.id }];
  scene.elements.push(shape, text);
  fitBoundText(text, shape);

  // Grow every enclosing group box, innermost first, so the new node stays inside.
  var inner = bounds(shape);
  groupChain.forEach(function (g) {
    var gb = bounds(g.el);
    var grown = grownBounds(gb, inner);
    if (grown.x !== gb.x || grown.y !== gb.y || grown.w !== gb.w || grown.h !== gb.h) {
      g.el.x = grown.x; g.el.y = grown.y; g.el.width = grown.w; g.el.height = grown.h;
      touch(g.el);
    }
    inner = grown;
  });
  return note;
}

function grownBounds(gb, nb) {
  var x1 = Math.min(gb.x, nb.x - GROUP_PADDING), y1 = Math.min(gb.y, nb.y - GROUP_PADDING);
  var x2 = Math.max(gb.x + gb.w, nb.x + nb.w + GROUP_PADDING), y2 = Math.max(gb.y + gb.h, nb.y + nb.h + GROUP_PADDING);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function isInside(model, item, group) {
  var p = item.parent;
  while (p) {
    if (p === group.el.id) return true;
    p = model.groups.has(p) ? model.groups.get(p).parent : null;
  }
  return false;
}

// Point where the ray from a box centre towards `toward` leaves the box.
function borderPoint(el, toward) {
  var b = bounds(el), c = [b.x + b.w / 2, b.y + b.h / 2];
  var dx = toward[0] - c[0], dy = toward[1] - c[1];
  if (!dx && !dy) return c;
  var sx = dx ? (b.w / 2) / Math.abs(dx) : Infinity;
  var sy = dy ? (b.h / 2) / Math.abs(dy) : Infinity;
  var s = Math.min(sx, sy);
  if (el.type === 'ellipse' || el.type === 'diamond') {
    // Ellipse: exact; diamond: |x|/a + |y|/b = 1.
    var a = b.w / 2, bb = b.h / 2;
    s = el.type === 'ellipse'
      ? 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (bb * bb))
      : 1 / (Math.abs(dx) / a + Math.abs(dy) / bb);
  }
  return [c[0] + dx * s, c[1] + dy * s];
}

function opConnect(scene, model, op) {
  var from = resolve(model, op.from, 'from', true).el;
  var to = resolve(model, op.to, 'to', true).el;
  if (from === to) throw new Error('connect: from and to are the same element');
  var gap = 6;
  var p1 = borderPoint(from, center(to)), p2 = borderPoint(to, center(from));
  var len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
  var ux = (p2[0] - p1[0]) / len, uy = (p2[1] - p1[1]) / len;
  p1 = [p1[0] + ux * gap, p1[1] + uy * gap];
  p2 = [p2[0] - ux * gap, p2[1] - uy * gap];

  var template = scene.elements.find(function (el) { return !el.isDeleted && el.type === 'arrow'; }) || {};
  var arrow = {
    type: 'arrow', id: randomId(), x: p1[0], y: p1[1], width: Math.abs(p2[0] - p1[0]), height: Math.abs(p2[1] - p1[1]),
    angle: 0, strokeColor: template.strokeColor || '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
    strokeWidth: template.strokeWidth || 2, strokeStyle: op.dashed ? 'dashed' : 'solid',
    roughness: template.roughness != null ? template.roughness : 1, opacity: 100, groupIds: [],
    frameId: from.frameId && from.frameId === to.frameId ? from.frameId : null,
    roundness: template.roundness !== undefined ? template.roundness : { type: 2 },
    seed: randomInt(), version: 1, versionNonce: randomInt(), isDeleted: false, boundElements: [],
    updated: Date.now(), link: null, locked: false,
    points: [[0, 0], [p2[0] - p1[0], p2[1] - p1[1]]], lastCommittedPoint: null,
    startBinding: { elementId: from.id, focus: 0, gap: gap }, endBinding: { elementId: to.id, focus: 0, gap: gap },
    startArrowhead: null, endArrowhead: 'arrow', elbowed: false,
  };
  scene.elements.push(arrow);
  addBound(from, { type: 'arrow', id: arrow.id }); touch(from);
  addBound(to, { type: 'arrow', id: arrow.id }); touch(to);
  if (op.label) attachEdgeLabel(scene, arrow, op.label);
}

function attachEdgeLabel(scene, arrow, label) {
  var template = scene.elements.find(function (el) { return !el.isDeleted && el.type === 'text'; });
  var t = newText(template, { containerId: arrow.id, frameId: arrow.frameId || null, fontSize: template && template.fontSize ? Math.min(template.fontSize, 16) : 16 });
  setText(t, label);
  addBound(arrow, { type: 'text', id: t.id });
  scene.elements.push(t);
  fitBoundText(t, arrow);
}

function edgeElementIds(e) {
  var ids = [e.el.id];
  if (e.label) e.label.els.forEach(function (t) { ids.push(t.id); });
  return ids;
}

function opDisconnect(scene, model, op) {
  var hits = findEdges(model, op.from, op.to);
  removeElements(scene, hits.reduce(function (acc, e) { return acc.concat(edgeElementIds(e)); }, []));
}

function opRelabelEdge(scene, model, op) {
  findEdges(model, op.from, op.to).forEach(function (e) {
    var arrow = scene.elements.find(function (el) { return el.id === e.el.id; });
    if (!op.label) {
      if (e.label) removeElements(scene, e.label.els.map(function (t) { return t.id; }));
      return;
    }
    if (!e.label) { attachEdgeLabel(scene, arrow, op.label); return; }
    var t = e.label.els[0];
    setText(t, op.label);
    if (e.label.bound) {
      fitBoundText(t, arrow);
    } else {
      var c = center(t);
      fitBoundText(t, null);
      t.x = c[0] - t.width / 2;
      t.y = c[1] - t.height / 2;
    }
  });
}

function opRemove(scene, model, op) {
  var item = resolve(model, op.node, 'node', true);
  var ids = [item.el.id].concat(item.label.els.map(function (t) { return t.id; }));
  model.edges.concat(model.unresolved).forEach(function (e) {
    if (e.from === item.el.id || e.to === item.el.id) ids = ids.concat(edgeElementIds(e));
  });
  // Arrows bound to it that the reader could not resolve still go.
  scene.elements.forEach(function (el) {
    if ((el.startBinding && el.startBinding.elementId === item.el.id) || (el.endBinding && el.endBinding.elementId === item.el.id)) {
      ids.push(el.id);
      scene.elements.forEach(function (t) { if (t.containerId === el.id) ids.push(t.id); });
    }
    if (el.containerId === item.el.id) ids.push(el.id);
  });
  removeElements(scene, ids);
}

const OPS = { rename: opRename, add: opAdd, connect: opConnect, disconnect: opDisconnect, 'relabel-edge': opRelabelEdge, remove: opRemove };

function checkShape(op, index) {
  if (!op || typeof op !== 'object') throw new Error('op ' + index + ' is not an object');
  var fields = OP_FIELDS[op.op];
  if (!fields) throw new Error('op ' + index + ': unknown op "' + op.op + '"; valid ops: ' + Object.keys(OP_FIELDS).join(', '));
  fields.forEach(function (f) {
    if (typeof op[f] !== 'string' || (f !== 'label' && !op[f])) {
      throw new Error('op ' + index + ' (' + op.op + '): field "' + f + '" must be a string');
    }
  });
}

// Pure: returns a new scene. Throws before returning anything if any op is bad.
export function applyEdits(scene, ops) {
  if (!Array.isArray(ops)) throw new Error('ops must be a JSON array');
  ops.forEach(checkShape);
  var working = normalizeScene(JSON.parse(JSON.stringify(scene)));
  var report = [];
  ops.forEach(function (op, i) {
    var model = analyzeScene(working);
    var note;
    try {
      note = OPS[op.op](working, model, op);
    } catch (err) {
      throw new Error('op ' + i + ' (' + op.op + '): ' + err.message);
    }
    report.push('op ' + i + ' (' + op.op + ') ok' + (note ? ': ' + note : ''));
  });
  return { scene: working, report: report };
}

// Link (or scene object) in, one new link out. Validation happens before upload.
export async function editLink(urlOrScene, ops, options) {
  options = options || {};
  var scene, backendBase;
  if (typeof urlOrScene === 'string') {
    var link = parseShareLink(urlOrScene);
    if (!link) throw new Error('not an excalidraw.com share link');
    backendBase = link.backendBase;
    scene = await loadScene(urlOrScene, { fetch: options.fetch });
  } else {
    scene = urlOrScene;
  }
  var result = applyEdits(scene, ops);
  var url = null;
  if (options.upload !== false) {
    url = await saveScene(result.scene, { fetch: options.fetch, backendBase: backendBase });
  }
  var mermaid = sceneToMermaid(result.scene, { sourceUrl: url || undefined });
  return { url: url, scene: result.scene, mermaid: mermaid.text, report: result.report };
}
