// Annotated screenshot ("doodle") spec -> Excalidraw scene for `c2m excalidraw`.
// The picture sits in the middle, handwritten notes in the margins around it,
// and a curved arrow runs from each note to the spot it explains. Notes never
// sit on the picture or on each other: each side is a column (left, right) or
// a row (top, bottom) stacked outward from the target, then a final pass
// pushes apart anything that still touches.
//
// Pure layout: the caller hands in the image bytes, so tests need no files.

export const DOODLE_DEFAULTS = { fontSize: 20, color: '#1971c2', maxWidth: 1400, wrap: 28 };
const GAP = 90;        // picture edge -> note
const STACK = 24;      // note -> note
const PAD = 8;         // note edge -> arrow start
const SIDES = ['left', 'right', 'top', 'bottom'];

export function isDoodleSpec(input) {
  return !!input && !Array.isArray(input) && typeof input === 'object' &&
    typeof input.image === 'string' && Array.isArray(input.notes);
}

// PNG width and height from the IHDR chunk; JPEG from its first SOFn marker.
export function imageInfo(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { mimeType: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    for (var i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      var marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mimeType: 'image/jpeg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  throw new Error('the image is not a PNG or JPEG');
}

// Greedy word wrap; the writer's own "\n" always breaks.
export function wrapText(text, width) {
  return String(text).split('\n').map(function (para) {
    var out = [], line = '';
    para.split(/\s+/).filter(Boolean).forEach(function (w) {
      if (line && (line + ' ' + w).length > width) { out.push(line); line = w; } else line = line ? line + ' ' + w : w;
    });
    out.push(line);
    return out.join('\n');
  }).join('\n');
}

// 0.55 em per character, the width Excalidraw's own text measure gives here
// (see the canvas stand-in in src/excalidraw-png.js); 1.25 em per line.
function textSize(text, fontSize) {
  var lines = text.split('\n');
  var longest = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
  return { w: Math.ceil(longest * fontSize * 0.55), h: Math.ceil(lines.length * fontSize * 1.25) };
}

// A note may name its target by visible text ("at") instead of pixels. The
// boxes come from the sidecar <image>.boxes.json a browser screenshot writes
// beside the PNG: {width, height, boxes: [{text, x, y, w, h}]} in image pixels.
// Exact text wins, then a case- and whitespace-insensitive substring; anything
// else fails with the three closest texts so the writer can copy one.
function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }

function distance(a, b) {
  var prev = [], cur, i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur = [i];
    for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export function resolveAt(at, k, boxes, info) {
  var where = 'note ' + (k + 1) + ': "at" ' + JSON.stringify(at);
  if (!boxes) throw new Error(where + ' needs the sidecar <image>.boxes.json beside the picture; without it give "target": [x, y, w, h]');
  var list = (boxes.boxes || []).filter(function (b) { return b && typeof b.text === 'string' && b.text.trim(); });
  var hit = list.filter(function (b) { return b.text === at; });
  if (!hit.length) {
    var q = norm(at);
    hit = list.filter(function (b) { return norm(b.text).indexOf(q) >= 0; });
  }
  if (!hit.length) {
    var near = list.map(function (b) { return { t: b.text, d: distance(norm(b.text).slice(0, 80), norm(at)) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, 3)
      .map(function (c) { return JSON.stringify(c.t.length > 60 ? c.t.slice(0, 60) + '...' : c.t); });
    throw new Error(where + ' matches no text in the boxes file' + (near.length ? '; closest: ' + near.join(', ') : ''));
  }
  // Several matches: prefer the shortest text (the tightest box), then the first.
  hit.sort(function (a, b) { return a.text.length - b.text.length; });
  var b = hit[0], s = boxes.width && boxes.width !== info.width ? info.width / boxes.width : 1;
  var x = Math.max(0, b.x * s), y = Math.max(0, b.y * s);
  return [x, y, Math.min(info.width - x, b.w * s), Math.min(info.height - y, b.h * s)];
}

function parseTarget(t, k, info) {
  if (!Array.isArray(t) || (t.length !== 2 && t.length !== 4) || t.some(function (v) { return typeof v !== 'number' || !isFinite(v); })) {
    throw new Error('note ' + (k + 1) + ': give "at": "<visible text>" or "target": [x, y] (a point) or [x, y, width, height] (a box), in image pixels');
  }
  var box = { x: t[0], y: t[1], w: t[2] || 0, h: t[3] || 0, isBox: t.length === 4 };
  if (box.x < 0 || box.y < 0 || box.x + box.w > info.width || box.y + box.h > info.height) {
    throw new Error('note ' + (k + 1) + ': target ' + JSON.stringify(t) + ' lies outside the ' + info.width + 'x' + info.height + ' image');
  }
  return box;
}

// The side whose image edge is nearest the target's centre.
function nearestSide(c, W, H) {
  var d = { left: c.x, right: W - c.x, top: c.y, bottom: H - c.y };
  return SIDES.reduce(function (best, s) { return d[s] < d[best] ? s : best; }, 'left');
}

function overlaps(a, b, pad) {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

// Stack one side's notes along its axis, each as close to its target as the
// notes before it allow.
function stack(notes, axis) {
  var pos = axis === 'y' ? 'y' : 'x', size = axis === 'y' ? 'h' : 'w';
  notes.sort(function (a, b) { return a[pos] - b[pos]; });
  for (var i = 1; i < notes.length; i++) {
    var min = notes[i - 1][pos] + notes[i - 1][size] + STACK;
    if (notes[i][pos] < min) notes[i][pos] = min;
  }
}

// Returns { notes: [{text, x, y, w, h, side, target, start, end}], W, H }:
// the layout in scene pixels with the picture at (0, 0) to (W, H).
export function layoutDoodle(spec, info, boxes) {
  var opt = Object.assign({}, DOODLE_DEFAULTS, spec);
  var natural = info.width;
  var W = spec.width ? Number(spec.width) : Math.min(natural, opt.maxWidth);
  if (!(W > 0)) throw new Error('"width" must be a positive number of pixels');
  var s = W / natural, H = Math.round(info.height * s);
  if (!spec.notes.length) throw new Error('"notes" is empty: give at least one {"text", "at"} or {"text", "target"}');

  var notes = spec.notes.map(function (n, k) {
    if (!n || typeof n.text !== 'string' || !n.text.trim()) throw new Error('note ' + (k + 1) + ': needs "text"');
    var t = parseTarget(n.at != null && n.target == null ? resolveAt(String(n.at), k, boxes, info) : n.target, k, info);
    var target = { x: t.x * s, y: t.y * s, w: t.w * s, h: t.h * s, isBox: t.isBox };
    var c = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
    var side = n.side || nearestSide(c, W, H);
    if (SIDES.indexOf(side) < 0) throw new Error('note ' + (k + 1) + ': "side" must be one of ' + SIDES.join(', '));
    var fontSize = n.fontSize || opt.fontSize;
    var text = wrapText(n.text.trim(), opt.wrap);
    var sz = textSize(text, fontSize);
    var note = { k: k, text: text, textAlign: side === 'left' ? 'right' : side === 'right' ? 'left' : 'center', fontSize: fontSize, color: n.color || opt.color, side: side, target: target, c: c, w: sz.w, h: sz.h };
    if (side === 'left') { note.x = -GAP - sz.w; note.y = c.y - sz.h / 2; }
    if (side === 'right') { note.x = W + GAP; note.y = c.y - sz.h / 2; }
    if (side === 'top') { note.y = -GAP - sz.h; note.x = Math.max(0, Math.min(W - sz.w, c.x - sz.w / 2)); }
    if (side === 'bottom') { note.y = H + GAP; note.x = Math.max(0, Math.min(W - sz.w, c.x - sz.w / 2)); }
    return note;
  });

  stack(notes.filter(function (n) { return n.side === 'left'; }), 'y');
  stack(notes.filter(function (n) { return n.side === 'right'; }), 'y');
  stack(notes.filter(function (n) { return n.side === 'top'; }), 'x');
  stack(notes.filter(function (n) { return n.side === 'bottom'; }), 'x');

  // Corners: a long column can reach a row's notes. Push the later note
  // outward (columns away from the picture sideways, rows up or down) until
  // nothing touches; outward moves never bring a note onto the picture.
  for (var pass = 0; pass < 50; pass++) {
    var moved = false;
    for (var i = 0; i < notes.length; i++) {
      for (var j = i + 1; j < notes.length; j++) {
        var a = notes[i], b = notes[j];
        if (!overlaps(a, b, STACK / 2)) continue;
        if (b.side === 'left') b.x = a.x - STACK - b.w;
        else if (b.side === 'right') b.x = a.x + a.w + STACK;
        else if (b.side === 'top') b.y = a.y - STACK - b.h;
        else b.y = a.y + a.h + STACK;
        moved = true;
      }
    }
    if (!moved) break;
  }

  notes.forEach(function (n) {
    var mid = { x: n.x + n.w / 2, y: n.y + n.h / 2 };
    if (n.side === 'left') n.start = { x: n.x + n.w + PAD, y: mid.y };
    if (n.side === 'right') n.start = { x: n.x - PAD, y: mid.y };
    if (n.side === 'top') n.start = { x: mid.x, y: n.y + n.h + PAD };
    if (n.side === 'bottom') n.start = { x: mid.x, y: n.y - PAD };
    n.end = arrowEnd(n.target, n.start);
  });
  notes.sort(function (a, b) { return a.k - b.k; });
  return { notes: notes, W: W, H: H, scale: s };
}

// A point target: the point. A box: the point on its outline nearest the
// note, pulled 4 px off the line so the arrowhead does not hide the box.
function arrowEnd(t, from) {
  if (!t.isBox) return { x: t.x, y: t.y };
  var x = Math.max(t.x, Math.min(t.x + t.w, from.x));
  var y = Math.max(t.y, Math.min(t.y + t.h, from.y));
  if (x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.h) return { x: x, y: y };
  var dx = from.x - x, dy = from.y - y, len = Math.hypot(dx, dy) || 1;
  return { x: x + dx / len * 4, y: y + dy / len * 4 };
}

// Excalidraw element skeletons (for convertToExcalidrawElements) plus files.
export function doodleSkeleton(spec, bytes, now, boxes) {
  var info = imageInfo(bytes);
  var lay = layoutDoodle(spec, info, boxes);
  var fileId = 'doodle-image';
  var els = [
    { type: 'image', id: 'image', fileId: fileId, x: 0, y: 0, width: lay.W, height: lay.H, status: 'saved' },
    { type: 'rectangle', id: 'image-frame', x: 0, y: 0, width: lay.W, height: lay.H, strokeColor: '#868e96', strokeWidth: 1, roughness: 0, backgroundColor: 'transparent' },
  ];
  lay.notes.forEach(function (n, k) {
    var id = 'note-' + (k + 1);
    if (n.target.isBox) {
      els.push({ type: 'rectangle', id: id + '-box', x: n.target.x - 4, y: n.target.y - 4, width: n.target.w + 8, height: n.target.h + 8,
        strokeColor: n.color, strokeWidth: 2, backgroundColor: 'transparent', roundness: { type: 3 } });
    }
    els.push({ type: 'text', id: id, x: n.x, y: n.y, text: n.text, fontSize: n.fontSize, fontFamily: 5, strokeColor: n.color,
      textAlign: n.textAlign });
    // Curve: one bend point off the straight line, alternating sides so
    // neighbouring arrows do not mirror each other.
    var dx = n.end.x - n.start.x, dy = n.end.y - n.start.y, len = Math.hypot(dx, dy) || 1;
    var bend = Math.min(40, len * 0.18) * (k % 2 ? -1 : 1);
    var mid = [dx / 2 - dy / len * bend, dy / 2 + dx / len * bend];
    els.push({ type: 'arrow', id: id + '-arrow', x: n.start.x, y: n.start.y, points: [[0, 0], mid, [dx, dy]],
      strokeColor: n.color, strokeWidth: 2, roundness: { type: 2 }, endArrowhead: 'arrow' });
  });
  var b64 = Buffer.from(bytes).toString('base64');
  var files = {};
  files[fileId] = { id: fileId, mimeType: info.mimeType, dataURL: 'data:' + info.mimeType + ';base64,' + b64, created: now || 0 };
  return { elements: els, files: files, layout: lay };
}

// The preview for a doodle: one line per note, so an agent can check which
// note points where without opening the picture.
export function doodlePreview(spec, lay) {
  return ['%% doodle: ' + spec.image + ' (' + Math.round(lay.W) + 'x' + Math.round(lay.H) + ' px)'].concat(lay.notes.map(function (n, k) {
    var t = n.target;
    return '%% note ' + (k + 1) + ' (' + n.side + ') -> ' + (t.isBox ? 'box' : 'point') + ': ' + n.text.replace(/\n/g, ' ');
  })).join('\n');
}

export async function doodleToScene(spec, bytes, loadExcalidraw, boxes) {
  var built = doodleSkeleton(spec, bytes, Date.now(), boxes);
  var m = await loadExcalidraw();
  var elements = m.convertToExcalidrawElements(built.elements, { regenerateIds: false });
  // The converter shifts a right- or centre-aligned text left by its width,
  // as if x were its anchor. Put each note back on the box the layout chose.
  var placed = {};
  built.layout.notes.forEach(function (n, k) { placed['note-' + (k + 1)] = n; });
  elements.forEach(function (e) {
    var n = e.type === 'text' && placed[e.id];
    if (!n) return;
    e.x = n.textAlign === 'right' ? n.x + n.w - e.width : n.textAlign === 'center' ? n.x + (n.w - e.width) / 2 : n.x;
    e.y = n.y;
  });
  // Bind each arrow to its note and to what it points at (the outline box, or
  // the picture for a point), so the arrows follow when someone moves a note
  // in Excalidraw, and lint does not read them as loose arrows.
  var byId = {};
  elements.forEach(function (e) { byId[e.id] = e; });
  function bind(arrow, which, target) {
    if (!target) return;
    arrow[which + 'Binding'] = { elementId: target.id, focus: 0, gap: 4 };
    target.boundElements = (target.boundElements || []).concat([{ id: arrow.id, type: 'arrow' }]);
  }
  built.layout.notes.forEach(function (n, k) {
    var id = 'note-' + (k + 1), arrow = byId[id + '-arrow'];
    if (!arrow) return;
    bind(arrow, 'start', byId[id]);
    bind(arrow, 'end', byId[id + '-box'] || byId.image);
  });
  return {
    scene: { type: 'excalidraw', version: 2, source: 'c2m', elements: elements, appState: { viewBackgroundColor: '#ffffff' }, files: built.files },
    preview: doodlePreview(spec, built.layout),
    warnings: ['the share link opens without the picture: excalidraw.com stores images apart from the link (see c2m excalidraw --help, DOODLE); the PNG is complete'],
  };
}
