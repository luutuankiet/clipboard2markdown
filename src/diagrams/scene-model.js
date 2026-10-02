// Reads an Excalidraw scene as a graph: nodes, subgraphs, edges, notes.
//
// Both the Mermaid writer and the editor go through `analyzeScene`, so the ids an
// agent sees in the Mermaid are exactly the ids the editor resolves.
//
// Unbound geometry is the normal case, not an edge case: canvases drawn by an LLM
// and then edited by hand mostly have arrows that are not bound to any shape and
// arrow labels that are free text. Every rule below falls back to geometry.

// All tuning constants live here.
export const TUNING = {
  // An endpoint within this many px of a shape's bounds hits that shape.
  endpointTolerance: 12,
  // Failing a hit, snap to the nearest node within this distance.
  endpointSnapLimit: 48,
  // Free text within this distance of an arrow's polyline can be its label.
  edgeLabelDistance: 36,
  // Fewer than this share of arrows resolved -> outline instead of flowchart.
  flowchartMinResolvedRatio: 0.75,
  // Colour-key boxes sit at most this far from their neighbour in the key.
  legendGap: 80,
  // A shape counts as containing another when it encloses it within this slack.
  containmentSlack: 2,
};

const NODE_TYPES = { rectangle: 'rect', ellipse: 'ellipse', diamond: 'diamond' };
const MERMAID_KEYWORDS = new Set([
  'end', 'graph', 'flowchart', 'subgraph', 'direction', 'click', 'style', 'classdef',
  'class', 'linkstyle', 'default', 'call', 'href', 'tb', 'td', 'bt', 'rl', 'lr',
]);
const READABLE_ID = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;

// ---------------------------------------------------------------- geometry ---

export function bounds(el) {
  if (el.type === 'arrow' || el.type === 'line' || el.type === 'freedraw') {
    var pts = absolutePoints(el);
    var xs = pts.map(function (p) { return p[0]; });
    var ys = pts.map(function (p) { return p[1]; });
    var minX = Math.min.apply(null, xs), minY = Math.min.apply(null, ys);
    return { x: minX, y: minY, w: Math.max.apply(null, xs) - minX, h: Math.max.apply(null, ys) - minY };
  }
  var w = el.width || 0, h = el.height || 0;
  return { x: Math.min(el.x, el.x + w), y: Math.min(el.y, el.y + h), w: Math.abs(w), h: Math.abs(h) };
}

export function center(el) {
  var b = bounds(el);
  return [b.x + b.w / 2, b.y + b.h / 2];
}

export function absolutePoints(el) {
  var pts = el.points && el.points.length ? el.points : [[0, 0], [el.width || 0, el.height || 0]];
  return pts.map(function (p) { return [el.x + p[0], el.y + p[1]]; });
}

function area(b) { return b.w * b.h; }

function containsPoint(b, p, tol) {
  return p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol;
}

function containsBox(outer, inner, slack) {
  return inner.x >= outer.x - slack && inner.y >= outer.y - slack &&
    inner.x + inner.w <= outer.x + outer.w + slack && inner.y + inner.h <= outer.y + outer.h + slack &&
    area(outer) > area(inner);
}

function distPointToBox(p, b) {
  var dx = Math.max(b.x - p[0], 0, p[0] - (b.x + b.w));
  var dy = Math.max(b.y - p[1], 0, p[1] - (b.y + b.h));
  return Math.hypot(dx, dy);
}

function distPointToSegment(p, a, b) {
  var vx = b[0] - a[0], vy = b[1] - a[1];
  var len2 = vx * vx + vy * vy;
  var t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

export function distPointToPolyline(p, pts) {
  var best = Infinity;
  for (var i = 1; i < pts.length; i++) best = Math.min(best, distPointToSegment(p, pts[i - 1], pts[i]));
  if (pts.length === 1) best = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]);
  return best;
}

// Distance from a polyline to a text box: 0 when the line passes through it.
function distTextToPolyline(textEl, pts) {
  var b = bounds(textEl);
  var c = center(textEl);
  var best = distPointToPolyline(c, pts);
  // Sample the polyline so a long label straddling the arrow still counts.
  for (var i = 1; i < pts.length; i++) {
    for (var s = 0; s <= 8; s++) {
      var t = s / 8;
      var q = [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
      best = Math.min(best, distPointToBox(q, b));
    }
  }
  return best;
}

// --------------------------------------------------------------------- ids ---

function hash36(s) {
  // FNV-1a, 32 bit, then a second round so short ids have enough entropy.
  var h1 = 0x811c9dc5, h2 = 0x01000193;
  for (var i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

export function isReadableId(id) {
  return typeof id === 'string' && READABLE_ID.test(id) && !MERMAID_KEYWORDS.has(id.toLowerCase());
}

// Element ids -> Mermaid ids. Readable element ids are kept; anything else gets a
// short id derived from a hash of the element id, so the same scene always gives
// the same ids. Collisions resolve in element order.
export function assignIds(entries) {
  var used = new Set();
  var out = new Map();
  entries.forEach(function (e) {
    if (isReadableId(e.elementId) && !used.has(e.elementId)) {
      used.add(e.elementId);
      out.set(e.elementId, e.elementId);
    }
  });
  entries.forEach(function (e) {
    if (out.has(e.elementId)) return;
    var h = hash36(e.elementId);
    var id = null;
    for (var len = 3; len <= h.length && !id; len++) {
      var candidate = e.prefix + h.slice(0, len);
      if (!used.has(candidate)) id = candidate;
    }
    for (var n = 2; !id; n++) {
      if (!used.has(e.prefix + h + n)) id = e.prefix + h + n;
    }
    used.add(id);
    out.set(e.elementId, id);
  });
  return out;
}

// ----------------------------------------------------------------- analyze ---

function textOf(el) {
  return String(el.originalText != null && el.originalText !== '' ? el.originalText : el.text || '').trim();
}

export function isEdgeElement(el) {
  if (el.type === 'arrow') return true;
  return el.type === 'line' && !!(el.startArrowhead || el.endArrowhead);
}

// Fill and line style, the things a colour key distinguishes. A transparent
// box's fill pattern is invisible, so it does not count.
export function styleKey(el) {
  var bg = el.backgroundColor || 'transparent';
  return bg + '|' + (bg === 'transparent' ? '' : el.fillStyle || 'solid') + '|' + (el.strokeStyle || 'solid');
}

// A colour key: two or more labelled boxes that no arrow touches, outside every
// group and clear of the connected diagram, stacked close together, each in its
// own style, and each style worn by something in the diagram. Anything less
// certain stays an ordinary box.
// Every other box or group wearing a key style is tagged with it, including
// free-standing ones away from the key.
function findLegend(nodes, groups, edges) {
  var none = { items: [], ids: new Set() };
  var touched = new Set();
  edges.forEach(function (e) { touched.add(e.from); touched.add(e.to); });
  var candidates = [], diagram = [];
  nodes.forEach(function (n) { (n.parent || touched.has(n.el.id) ? diagram : candidates).push(n); });
  groups.forEach(function (g) { diagram.push(g); });
  if (candidates.length < 2 || !diagram.length) return none;

  var area = diagram.map(function (d) { return bounds(d.el); }).reduce(function (a, b) {
    var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x: x, y: y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  });
  var gap = function (a, b) {
    var p = bounds(a.el), q = bounds(b.el);
    return Math.max(p.x - (q.x + q.w), q.x - (p.x + p.w), p.y - (q.y + q.h), q.y - (p.y + p.h), 0);
  };
  var clustered = function (list) {
    return list.filter(function (c) { return list.some(function (o) { return o !== c && gap(c, o) <= TUNING.legendGap; }); });
  };
  // Cluster first, so a stray box elsewhere that shares a key style does not
  // knock that entry out of the key.
  var kept = clustered(candidates.filter(function (c) {
    var b = bounds(c.el);
    return b.x > area.x + area.w || b.x + b.w < area.x || b.y > area.y + area.h || b.y + b.h < area.y;
  }));
  var styleCount = new Map();
  kept.forEach(function (c) { styleCount.set(styleKey(c.el), (styleCount.get(styleKey(c.el)) || 0) + 1); });
  kept = clustered(kept.filter(function (c) {
    var k = styleKey(c.el);
    return styleCount.get(k) === 1 && diagram.some(function (d) { return styleKey(d.el) === k; });
  }));
  if (kept.length < 2) return none;

  var order = function (a, b) { return a.el.y - b.el.y || a.el.x - b.el.x; };
  var others = diagram.concat(candidates.filter(function (c) { return kept.indexOf(c) < 0; }));
  return {
    items: kept.sort(order).map(function (c) {
      var k = styleKey(c.el);
      return {
        node: c,
        members: others.filter(function (d) { return styleKey(d.el) === k; }),
      };
    }),
    ids: new Set(kept.map(function (c) { return c.el.id; })),
  };
}

export function analyzeScene(scene) {
  var all = (scene && scene.elements) || [];
  var live = all.filter(function (el) { return el && !el.isDeleted; });
  var byId = new Map(live.map(function (el) { return [el.id, el]; }));

  var shapes = live.filter(function (el) { return NODE_TYPES[el.type] || el.type === 'frame' || el.type === 'magicframe'; });
  var edgesEls = live.filter(isEdgeElement);
  var texts = live.filter(function (el) { return el.type === 'text' && textOf(el); });
  var images = live.filter(function (el) { return el.type === 'image'; });

  // 1. Bound text: label of its container.
  var boundLabel = new Map(); // containerId -> text el
  var freeTexts = [];
  texts.forEach(function (t) {
    var container = t.containerId && byId.get(t.containerId);
    if (container && !boundLabel.has(container.id)) boundLabel.set(container.id, t);
    else freeTexts.push(t);
  });

  // 2. Free text inside a shape belongs to the smallest shape containing its centre.
  var shapeBox = new Map(shapes.map(function (s) { return [s.id, bounds(s)]; }));
  var smallestShapeAt = function (p, filter) {
    var best = null, bestArea = Infinity;
    shapes.forEach(function (s) {
      if (filter && !filter(s)) return;
      var b = shapeBox.get(s.id);
      if (containsPoint(b, p, 0) && area(b) < bestArea) { best = s; bestArea = area(b); }
    });
    return best;
  };
  var insideTexts = new Map(); // shapeId -> [text]
  var outsideTexts = [];
  freeTexts.forEach(function (t) {
    var s = smallestShapeAt(center(t));
    if (s) {
      if (!insideTexts.has(s.id)) insideTexts.set(s.id, []);
      insideTexts.get(s.id).push(t);
    } else {
      outsideTexts.push(t);
    }
  });

  var hasLabel = function (s) { return boundLabel.has(s.id) || insideTexts.has(s.id); };

  // 3. Groups: frames, and shapes that enclose another labelled shape.
  var isGroup = new Map();
  shapes.forEach(function (s) {
    if (s.type === 'frame' || s.type === 'magicframe') { isGroup.set(s.id, true); return; }
    var b = shapeBox.get(s.id);
    isGroup.set(s.id, shapes.some(function (o) {
      return o !== s && NODE_TYPES[o.type] && hasLabel(o) && containsBox(b, shapeBox.get(o.id), TUNING.containmentSlack);
    }));
  });

  var groupEls = shapes.filter(function (s) { return isGroup.get(s.id); });
  var nodeEls = shapes.filter(function (s) { return !isGroup.get(s.id) && hasLabel(s); });

  // 4. Labels. Groups take bound text, else the inside text nearest their top edge.
  var notes = outsideTexts.slice();
  var labelInfo = new Map(); // shapeId -> { text, els: [text elements] }
  nodeEls.forEach(function (s) {
    if (boundLabel.has(s.id)) {
      labelInfo.set(s.id, { text: textOf(boundLabel.get(s.id)), els: [boundLabel.get(s.id)], bound: true });
      (insideTexts.get(s.id) || []).forEach(function (t) { notes.push(t); });
      return;
    }
    var inside = (insideTexts.get(s.id) || []).slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    labelInfo.set(s.id, { text: inside.map(textOf).join('\n'), els: inside, bound: false });
  });
  groupEls.forEach(function (g) {
    var inside = (insideTexts.get(g.id) || []).slice();
    if (boundLabel.has(g.id)) {
      labelInfo.set(g.id, { text: textOf(boundLabel.get(g.id)), els: [boundLabel.get(g.id)], bound: true });
    } else if (g.name) {
      labelInfo.set(g.id, { text: String(g.name), els: [], bound: false, frameName: true });
    } else if (inside.length) {
      var top = shapeBox.get(g.id).y;
      inside.sort(function (a, b) { return (bounds(a).y - top) - (bounds(b).y - top) || a.x - b.x; });
      var title = inside.shift();
      labelInfo.set(g.id, { text: textOf(title), els: [title], bound: false });
    } else {
      labelInfo.set(g.id, { text: '', els: [], bound: false });
    }
    inside.forEach(function (t) { if (labelInfo.get(g.id).els.indexOf(t) < 0) notes.push(t); });
  });

  // 5. Ids, in element order so collisions resolve the same way every run.
  var idMap = assignIds(live.filter(function (el) {
    return nodeEls.indexOf(el) >= 0 || groupEls.indexOf(el) >= 0;
  }).map(function (el) {
    return { elementId: el.id, prefix: isGroup.get(el.id) ? 'g' : 'n' };
  }));

  // 6. Parents: frameId first, else the smallest enclosing group.
  var parentOf = function (el) {
    if (el.frameId && isGroup.get(el.frameId) && byId.has(el.frameId)) return el.frameId;
    var b = shapeBox.get(el.id);
    var best = null, bestArea = Infinity;
    groupEls.forEach(function (g) {
      if (g === el) return;
      var gb = shapeBox.get(g.id);
      if (containsBox(gb, b, TUNING.containmentSlack) && area(gb) < bestArea) { best = g.id; bestArea = area(gb); }
    });
    return best;
  };

  var nodes = new Map();
  nodeEls.forEach(function (el) {
    nodes.set(el.id, { el: el, id: idMap.get(el.id), kind: 'node', shape: NODE_TYPES[el.type], label: labelInfo.get(el.id), parent: parentOf(el) });
  });
  var groups = new Map();
  groupEls.forEach(function (el) {
    groups.set(el.id, { el: el, id: idMap.get(el.id), kind: 'group', label: labelInfo.get(el.id), parent: parentOf(el) });
  });

  // 7. Edge endpoints: binding first, then geometry.
  var nodeList = Array.from(nodes.values());
  var groupList = Array.from(groups.values());
  var targetOf = function (elementId) {
    if (nodes.has(elementId)) return elementId;
    if (groups.has(elementId)) return elementId;
    var el = byId.get(elementId);
    if (el && el.type === 'text' && el.containerId && (nodes.has(el.containerId) || groups.has(el.containerId))) return el.containerId;
    return null;
  };
  var resolvePoint = function (p) {
    var hit = null, hitArea = Infinity;
    nodeList.forEach(function (n) {
      var b = bounds(n.el);
      if (distPointToBox(p, b) <= TUNING.endpointTolerance && area(b) < hitArea) { hit = n.el.id; hitArea = area(b); }
    });
    if (hit) return hit;
    groupList.forEach(function (g) {
      var b = bounds(g.el);
      if (containsPoint(b, p, TUNING.endpointTolerance) && area(b) < hitArea) { hit = g.el.id; hitArea = area(b); }
    });
    if (hit) return hit;
    var bestDist = TUNING.endpointSnapLimit;
    nodeList.forEach(function (n) {
      var d = distPointToBox(p, bounds(n.el));
      if (d <= bestDist) { hit = n.el.id; bestDist = d; }
    });
    return hit;
  };

  var rawEdges = edgesEls.map(function (el) {
    var pts = absolutePoints(el);
    var bindStart = el.startBinding && el.startBinding.elementId && targetOf(el.startBinding.elementId);
    var bindEnd = el.endBinding && el.endBinding.elementId && targetOf(el.endBinding.elementId);
    var start = bindStart || resolvePoint(pts[0]);
    var end = bindEnd || resolvePoint(pts[pts.length - 1]);
    if (start && start === end && !(bindStart && bindEnd)) end = null;
    return { el: el, pts: pts, start: start, end: end };
  });

  // 8. Edge labels: bound text, else nearest unclaimed free text. Each text is
  // claimed once, by its nearest arrow.
  var edgeLabel = new Map(); // arrowId -> { text, els, bound }
  rawEdges.forEach(function (e) {
    var t = boundLabel.get(e.el.id);
    if (t) edgeLabel.set(e.el.id, { text: textOf(t), els: [t], bound: true });
  });
  var remainingNotes = [];
  notes.forEach(function (t) {
    var best = null, bestDist = TUNING.edgeLabelDistance;
    rawEdges.forEach(function (e) {
      if (edgeLabel.has(e.el.id) && edgeLabel.get(e.el.id).bound) return;
      var d = distTextToPolyline(t, e.pts);
      if (d <= bestDist) { best = e; bestDist = d; }
    });
    if (best) {
      var cur = edgeLabel.get(best.el.id);
      if (!cur) edgeLabel.set(best.el.id, { text: textOf(t), els: [t], bound: false, dist: bestDist });
      else if (bestDist < cur.dist) { remainingNotes.push(cur.els[0]); edgeLabel.set(best.el.id, { text: textOf(t), els: [t], bound: false, dist: bestDist }); }
      else remainingNotes.push(t);
    } else {
      remainingNotes.push(t);
    }
  });

  var edges = [];
  var unresolved = [];
  rawEdges.forEach(function (e) {
    var el = e.el;
    var startHead = !!el.startArrowhead;
    // A missing endArrowhead on an arrow means Excalidraw's default head.
    var endHead = el.type === 'arrow' && el.endArrowhead === undefined ? true : !!el.endArrowhead;
    var from = e.start, to = e.end, kind;
    if (startHead && endHead) kind = 'double';
    else if (!startHead && !endHead) kind = 'open';
    else { kind = 'arrow'; if (startHead) { from = e.end; to = e.start; } }
    var label = edgeLabel.get(el.id) || null;
    var edge = { el: el, from: from, to: to, kind: kind, dashed: el.strokeStyle === 'dashed' || el.strokeStyle === 'dotted', label: label };
    if (e.start && e.end) edges.push(edge);
    else unresolved.push(edge);
  });

  var mermaidId = function (elementId) {
    var n = nodes.get(elementId) || groups.get(elementId);
    return n ? n.id : null;
  };

  var legend = findLegend(nodes, groups, edges.concat(unresolved));

  var byMermaidId = new Map();
  nodes.forEach(function (n) { byMermaidId.set(n.id, n); });
  groups.forEach(function (g) { byMermaidId.set(g.id, g); });

  // Lifelines and member dividers betray sequence / class / ER canvases.
  var lines = live.filter(function (el) { return el.type === 'line' && !isEdgeElement(el); });
  var lifelines = lines.filter(function (el) { var b = bounds(el); return b.h > 120 && b.h > 4 * b.w; });
  var dividedNodes = nodeEls.filter(function (n) {
    var nb = bounds(n);
    return lines.some(function (l) { var b = bounds(l); return b.h < 4 && b.w > nb.w * 0.6 && containsBox(nb, b, 2); });
  });

  return {
    nodes: nodes,
    groups: groups,
    edges: edges,
    unresolved: unresolved,
    notes: remainingNotes,
    images: images,
    byId: byId,
    byMermaidId: byMermaidId,
    mermaidId: mermaidId,
    legend: legend,
    edgeCount: rawEdges.length,
    signals: { lifelines: lifelines.length, dividedNodes: dividedNodes.length },
    textOf: textOf,
  };
}
