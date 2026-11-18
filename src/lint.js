// Scene-level lint for `c2m excalidraw`: checks a finished Excalidraw scene,
// whatever input it came from (Mermaid, JSON elements, a whole scene), for the
// faults that make a diagram wrong in a document. Pure, deterministic, no
// network. Each finding is { cls, level, message }; `error` findings are what
// `--strict` refuses to render.
//
//   a  child sticks out of its frame / subgraph, or a node straddles a frame
//   b  node boxes overlap (partial overlap; full nesting is fine)
//   c  a text label holds a literal <br> or backslash-n
//   d  an arrow end is unbound, bound to a missing element, or far from its shape
//   e  label text is wider (or taller) than the box that holds it
//   f  font size, once the whole scene is scaled to page width, is too small

const SHAPES = new Set(['rectangle', 'diamond', 'ellipse']);
const DRAWN = new Set(['rectangle', 'diamond', 'ellipse', 'text', 'arrow', 'line']);
const CHAR_W = 0.6;       // keep equal to CHAR_W in mermaid-input.js
const PAD = 10;           // padding inside a container
const TOL = 1;            // px slack for "inside"
const ARROW_FAR = 20;     // px: a bound end farther than this from its shape is wrong
const NEAR = 12;          // px: an unbound end this close to a shape only touches
const MIN_AREA = 4;       // px^2 overlap below which a touch is ignored
export const PAGE_PT = 468;
export const ALL_CLASSES = ['a', 'b', 'c', 'd', 'e', 'f'];

function bbox(e) { return [e.x, e.y, e.x + e.width, e.y + e.height]; }

function poly(e) {
  var b = bbox(e), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  if (e.type === 'diamond') return [[cx, b[1]], [b[2], cy], [cx, b[3]], [b[0], cy]];
  if (e.type === 'ellipse') {
    var rx = (b[2] - b[0]) / 2, ry = (b[3] - b[1]) / 2, pts = [];
    for (var a = 0; a < 16; a++) pts.push([cx + rx * Math.cos(a * Math.PI / 8), cy + ry * Math.sin(a * Math.PI / 8)]);
    return pts;
  }
  return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
}

// Separating-axis test on convex polygons; touching is not overlap.
function satOverlap(p, q) {
  var sets = [p, q];
  for (var s = 0; s < 2; s++) {
    var P = sets[s];
    for (var i = 0; i < P.length; i++) {
      var A = P[i], B = P[(i + 1) % P.length];
      var nx = A[1] - B[1], ny = B[0] - A[0];
      var pa = p.map(function (v) { return nx * v[0] + ny * v[1]; });
      var qa = q.map(function (v) { return nx * v[0] + ny * v[1]; });
      if (Math.max.apply(null, pa) <= Math.min.apply(null, qa) + 1e-6 || Math.max.apply(null, qa) <= Math.min.apply(null, pa) + 1e-6) return false;
    }
  }
  return true;
}

function interArea(a, b) {
  var w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  var h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return Math.max(0, w) * Math.max(0, h);
}

function contains(a, b, tol) {
  tol = tol === undefined ? TOL : tol;
  return a[0] - tol <= b[0] && a[1] - tol <= b[1] && a[2] + tol >= b[2] && a[3] + tol >= b[3];
}

function segDist(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distToShape(pt, e) {
  var p = poly(e), best = Infinity;
  for (var i = 0; i < p.length; i++) {
    var a = p[i], b = p[(i + 1) % p.length];
    best = Math.min(best, segDist(pt[0], pt[1], a[0], a[1], b[0], b[1]));
  }
  return best;
}

// `scene` is a scene object ({elements}) or a bare element array.
// opts: { pagePt: 468, classes: ['a'..'f'] }. Returns { findings, meta }.
export function lintScene(scene, opts) {
  opts = opts || {};
  var pagePt = opts.pagePt || PAGE_PT;
  var want = new Set(opts.classes || ALL_CLASSES);
  var els = (Array.isArray(scene) ? scene : (scene && scene.elements) || []).filter(function (e) { return e && !e.isDeleted; });
  var findings = [];
  function add(cls, level, message) { if (want.has(cls)) findings.push({ cls: cls, level: level, message: message }); }

  var byId = {};
  els.forEach(function (e) { if (!(e.id in byId)) byId[e.id] = e; });
  var shapes = els.filter(function (e) { return SHAPES.has(e.type); });
  var texts = els.filter(function (e) { return e.type === 'text'; });
  var labelOf = {};
  texts.forEach(function (t) { if (t.containerId) labelOf[t.containerId] = t; });

  function name(e) {
    var t = labelOf[e.id];
    var txt = t ? t.text : e.type === 'text' ? e.text : '';
    return '"' + (String(txt || '').replace(/\n/g, ' ').slice(0, 28) || e.id) + '"';
  }

  // Frames: shapes named by a "subgraph_group_<id>" group id (Mermaid
  // subgraphs), or any shape that fully contains a smaller one.
  var frames = new Map();
  shapes.forEach(function (e) {
    var gid = 'subgraph_group_' + e.id;
    if (els.some(function (m) { return (m.groupIds || []).indexOf(gid) >= 0; })) frames.set(e.id, gid);
  });
  shapes.forEach(function (e) {
    if (frames.has(e.id)) return;
    var eb = bbox(e);
    if (shapes.some(function (o) { return o !== e && contains(eb, bbox(o)) && o.width * o.height < e.width * e.height; })) frames.set(e.id, null);
  });

  // a: children outside their frame
  var stuck = new Set();
  frames.forEach(function (gid, fid) {
    var fr = byId[fid], fb = bbox(fr);
    shapes.forEach(function (m) {
      if (m === fr) return;
      var member = (gid && (m.groupIds || []).indexOf(gid) >= 0) || contains(fb, bbox(m));
      if (!member) return;
      var mb = bbox(m);
      if (contains(fb, mb)) return;
      var over = Math.max(fb[0] - mb[0], fb[1] - mb[1], mb[2] - fb[2], mb[3] - fb[3]);
      add('a', 'error', name(m) + ' sticks out of frame ' + name(fr) + ' by ' + Math.round(over) + ' px; widen the frame or move the node in');
      stuck.add(m.id + '|' + fr.id);
    });
  });

  // a / b: partial overlaps
  for (var i = 0; i < shapes.length; i++) {
    for (var j = i + 1; j < shapes.length; j++) {
      var A = shapes[i], B = shapes[j], ba = bbox(A), bb = bbox(B);
      if (interArea(ba, bb) < MIN_AREA || contains(ba, bb) || contains(bb, ba)) continue;
      if (!satOverlap(poly(A), poly(B))) continue;
      var area = Math.round(interArea(ba, bb));
      var fa = frames.has(A.id), fb2 = frames.has(B.id);
      if (fa && fb2) add('b', 'error', 'frames ' + name(A) + ' and ' + name(B) + ' overlap (~' + area + ' px^2); move them apart');
      else if (fa || fb2) {
        var fr = fa ? A : B, nd = fa ? B : A;
        if (stuck.has(nd.id + '|' + fr.id)) continue; // already reported as sticking out
        add('a', 'error', 'node ' + name(nd) + ' straddles frame ' + name(fr) + ' (~' + area + ' px^2); move it fully in or out');
      } else add('b', 'error', 'nodes ' + name(A) + ' and ' + name(B) + ' overlap (~' + area + ' px^2); move them apart');
    }
  }

  // c: literal line-break text
  texts.forEach(function (t) {
    var hit = ['text', 'originalText'].some(function (k) {
      var v = t[k] || '';
      return /<br\s*\/?>/i.test(v) || v.indexOf('\\n') >= 0;
    });
    if (hit) add('c', 'error', 'text ' + String(t.id).slice(0, 10) + ' shows a literal line-break (' + JSON.stringify(String(t.text || '').slice(0, 40)) + '); use a real newline');
  });

  // d: arrows
  els.forEach(function (a) {
    if (a.type !== 'arrow') return;
    var pts = a.points && a.points.length ? a.points : [[0, 0], [a.width || 0, a.height || 0]];
    var ends = { start: [a.x + pts[0][0], a.y + pts[0][1]], end: [a.x + pts[pts.length - 1][0], a.y + pts[pts.length - 1][1]] };
    ['start', 'end'].forEach(function (which) {
      var pt = ends[which], b = a[which + 'Binding'], id = String(a.id).slice(0, 14);
      if (b) {
        var tgt = byId[b.elementId];
        if (!tgt) add('d', 'error', 'arrow ' + id + ' ' + which + ' is bound to a missing element');
        else if (SHAPES.has(tgt.type)) {
          var d = distToShape(pt, tgt);
          if (d > ARROW_FAR) add('d', 'error', 'arrow ' + id + ' ' + which + ' lands ' + Math.round(d) + ' px from ' + name(tgt) + '; it floats off the outline');
        }
      } else {
        var best = null, bd = Infinity;
        shapes.forEach(function (s) { var dd = distToShape(pt, s); if (dd < bd) { bd = dd; best = s; } });
        if (bd > NEAR) add('d', 'error', 'arrow ' + id + ' ' + which + ' is unbound and ends in empty space' + (best ? ' (' + Math.round(bd) + ' px from the nearest shape)' : ''));
        else add('d', 'warn', 'arrow ' + id + ' ' + which + ' is unbound (touches ' + name(best) + '); bind it so it follows the shape');
      }
    });
  });

  // e: text wider than its box
  texts.forEach(function (t) {
    var c = byId[t.containerId];
    if (!c || !SHAPES.has(c.type)) return;
    var fs = t.fontSize || 20;
    var lines = String(t.text || '').split('\n');
    var w = Math.max.apply(null, lines.map(function (l) { return l.length; })) * CHAR_W * fs;
    var h = lines.length * 1.25 * fs;
    var k = c.type === 'ellipse' ? Math.SQRT2 : c.type === 'diamond' ? 2 : 1;
    var aw = c.width / k - 2 * PAD, ah = c.height / k - 2 * PAD;
    var use = t.width ? Math.max(w, t.width) : w;
    if (use > aw + 1 || h > ah + 1) {
      add('e', 'error', 'label ' + JSON.stringify(String(t.text || '').slice(0, 28)) + ' needs about ' + Math.round(use) + 'x' + Math.round(h) +
        ' but the ' + c.type + ' has room for ' + Math.round(aw) + 'x' + Math.round(ah) + '; enlarge the shape');
    }
  });

  // f: font size at page width
  var boxes = els.filter(function (e) { return DRAWN.has(e.type); }).map(bbox);
  var sw = 0, sh = 0, minPt = null;
  if (boxes.length) {
    sw = Math.max.apply(null, boxes.map(function (b) { return b[2]; })) - Math.min.apply(null, boxes.map(function (b) { return b[0]; }));
    sh = Math.max.apply(null, boxes.map(function (b) { return b[3]; })) - Math.min.apply(null, boxes.map(function (b) { return b[1]; }));
    var scale = sw ? pagePt / sw : 1;
    if (texts.length) {
      var fs0 = Math.min.apply(null, texts.map(function (t) { return t.fontSize || 20; }));
      minPt = fs0 * scale;
      if (minPt < 8) add('f', 'error', 'scene is ' + Math.round(sw) + ' px wide; at ' + pagePt + ' pt page width its ' + fs0 + ' px text prints at ' + minPt.toFixed(1) + ' pt (minimum 8); make the diagram narrower');
      else if (minPt < 10) add('f', 'warn', 'text prints at ' + minPt.toFixed(1) + ' pt at page width (scene ' + Math.round(sw) + ' px wide)');
    }
  }
  return { findings: findings, meta: { width: Math.round(sw), height: Math.round(sh), minPt: minPt === null ? null : Math.round(minPt * 10) / 10, frames: frames.size, shapes: shapes.length } };
}

// One output line per finding, as printed by `c2m excalidraw` and `c2m lint`.
export function formatFinding(f) {
  return 'lint ' + f.cls + ' (' + f.level + '): ' + f.message;
}

export function hasErrors(findings) {
  return findings.some(function (f) { return f.level === 'error'; });
}
