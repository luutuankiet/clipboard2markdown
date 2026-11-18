// Compact comic / doodle format -> element array for the skeleton builder.
//
// An agent writes a few lines of text (see SKETCH in bin/excalidraw.js); this
// module parses them, lays everything out (no coordinates are ever written) and
// returns the same shorthand element array `c2m excalidraw` already accepts.
// From there the normal path runs unchanged: skeleton builder, lint, PNG, link.
//
// Look: everything is a white fill with a black stroke. Colour comes only from
// the markers `accent` (one blue, "look here"), `bad` (red) and `good` (green).
// Pure: no file or network access.

const FS = 16;             // every text is 16 px; the scene is about 540 px wide, so it prints at about 14.5 pt
const CW = 0.68;           // px per char per font px, equal to TEXT_METRICS.charWidth in diagrams/edit.js
const LH = 1.25;           // line height
const PW = 256;            // panel width
const PGAP = 32;           // gap between panels
const M = 12;              // margin inside a panel
const TAIL = 34;           // gap between a bubble and its speaker's head
const SECTION = 18;        // gap between sections of a panel
const INK = '#1e1e1e';
export const MARKERS = {
  accent: { fill: '#a5d8ff', ink: '#1971c2' },
  bad: { fill: '#ffc9c9', ink: '#e03131' },
  good: { fill: '#b2f2bb', ink: '#2f9e44' },
};
const MOODS = ['ok', 'sad', 'happy'];
const SLOTS = ['@left', '@right', '@center'];

export const SKETCH_EXT = /\.(c2m|sketch)$/i;

function fail(file, line, text, msg, fix) {
  var where = (file || 'input') + ':' + line;
  throw new Error(where + ': ' + msg + (text ? '\n  ' + String(text).trim() : '') + (fix ? '\n  fix: ' + fix : ''));
}

// ---- parser ---------------------------------------------------------------

function tokenize(src) {
  var out = [], re = /"((?:[^"\\]|\\.)*)"|->|:|#.*|[^\s":]+/g, m;
  while ((m = re.exec(src))) {
    if (m[0][0] === '#') break;
    if (m[1] !== undefined) out.push({ q: true, v: m[1].replace(/\\(.)/g, function (_, c) { return c === 'n' ? '\n' : c; }) });
    else out.push({ q: false, v: m[0] });
  }
  return out;
}

export function parseSketch(source, file) {
  var doc = { cols: 2, title: null, body: [], panels: [], bodyGrid: 0 };
  var panel = null;
  String(source).split(/\r?\n/).forEach(function (raw, idx) {
    var line = idx + 1;
    var tk = tokenize(raw);
    if (!tk.length) return;
    var indented = /^\s/.test(raw);
    var err = function (msg, fix) { fail(file, line, raw, msg, fix); };
    var word = function (i) { return tk[i] && !tk[i].q ? tk[i].v : null; };
    var str = function (i, what) {
      if (!tk[i] || !tk[i].q) err('expected a quoted ' + what + ' here', 'write the text in double quotes, e.g. "Report"');
      return tk[i].v;
    };
    // trailing markers and slots, in any order
    var rest = function (from, allow) {
      var o = { marker: null, slot: null, mood: null, words: [] };
      for (var i = from; i < tk.length; i++) {
        var w = word(i);
        if (w && MARKERS[w]) { if (o.marker) err('two colour markers on one line (' + o.marker + ', ' + w + ')', 'use only one of accent, bad, good'); o.marker = w; }
        else if (w && SLOTS.indexOf(w) >= 0 && allow.slot) o.slot = w.slice(1);
        else if (w && MOODS.indexOf(w) >= 0 && allow.mood) o.mood = w;
        else o.words.push(tk[i]);
      }
      return o;
    };

    var first = word(0);
    if (!indented || !panel) {
      if (indented && !panel && first !== 'strip' && first !== 'panel') {
        // an indented line before any panel is just a body line
      }
    }
    var target = indented && panel ? panel.stmts : doc.body;
    if (!indented) panel = null;

    if (first === 'strip') {
      var n = Number(word(1));
      if (!(n >= 1 && n <= 4)) err('strip needs a column count from 1 to 4', 'write: strip 2 cols   (2 columns fit a 468 pt page at 14 pt text)');
      doc.cols = n; return;
    }
    if (first === 'title') { doc.title = str(1, 'title'); return; }
    if (first === 'panel') {
      var r = rest(2, {});
      panel = { title: str(1, 'panel title'), note: null, stmts: [], line: line };
      if (r.words.length) {
        if (r.words[0].v !== 'note' || !r.words[1] || !r.words[1].q || r.words.length > 2) err('after the panel title only note "caption" is allowed', 'write: panel "Title" note "One-line caption."');
        panel.note = r.words[1].v;
      }
      doc.panels.push(panel); return;
    }
    if (first === 'grid') {
      var g = Number(word(1));
      if (!(g >= 1 && g <= 4)) err('grid needs a column count from 1 to 4', 'write: grid 2 cols');
      (panel && indented ? panel : doc).grid = g; return;
    }
    if (first === 'stat' || first === 'text' || first === 'note') {
      var rs = rest(2, {});
      if (rs.words.length) err('unexpected text after the quoted string: ' + rs.words.map(function (t) { return t.v; }).join(' '), 'quote the whole text once; add \\n for a line break');
      target.push({ kind: first === 'note' ? 'note' : 'stat', text: str(1, 'text'), marker: rs.marker, line: line }); return;
    }
    if (tk.some(function (t) { return !t.q && /->./.test(t.v) || !t.q && /.->/.test(t.v); })) err('write -> with a space on each side', 'e.g. a -> b "label"');
    var ai = tk.findIndex(function (t) { return !t.q && t.v === '->'; });
    if (ai >= 0) {
      if (ai !== 1 || !word(0) || !word(2)) err('an arrow is written: from -> to ["label"] [accent|bad|good]', 'e.g. rpt -> db "query"');
      var re = rest(3, {}), label = '';
      if (re.words.length) {
        var ws = re.words;
        if (ws[0].v === ':' && !ws[0].q) label = ws.slice(1).map(function (t) { return t.v; }).join(' ');
        else if (ws.length === 1 && ws[0].q) label = ws[0].v;
        else err('unexpected text after the arrow target', 'label an arrow with  : text  or  "text"');
      }
      target.push({ kind: 'edge', from: word(0), to: word(2), label: label, marker: re.marker, line: line }); return;
    }
    var w0 = word(0), w1 = word(1);
    if (w1 === 'says' || w1 === 'thinks') {
      var rb = rest(3, {});
      if (rb.words.length) err('unexpected text after the quoted string', 'one quoted string, \\n for line breaks');
      target.push({ kind: 'bubble', who: w0, think: w1 === 'thinks', text: str(2, 'speech'), marker: rb.marker, line: line }); return;
    }
    if (w0 && tk[1] && !tk[1].q && tk[1].v === ':') {
      var kind = word(2);
      if (kind === 'figure') {
        var rf = rest(3, { slot: true, mood: true });
        var name = '';
        if (rf.words.length) { if (rf.words.length > 1 || !rf.words[0].q) err('a figure takes at most one quoted name', 'write: me: figure happy @left "You"'); name = rf.words[0].v; }
        target.push({ kind: 'figure', id: w0, mood: rf.mood || 'ok', slot: rf.slot, name: name, marker: rf.marker, line: line }); return;
      }
      if (kind === 'box') {
        var rx = rest(3, {});
        if (rx.words.length !== 1 || !rx.words[0].q) err('a box needs one quoted label', 'write: db: box "Source\\nDB" good');
        target.push({ kind: 'box', id: w0, label: rx.words[0].v, marker: rx.marker, line: line }); return;
      }
      err('unknown kind "' + kind + '" after "' + w0 + ':"', 'use figure or box');
    }
    err('cannot read this line', 'statements: strip N cols | title "t" | panel "t" [note "c"] | id: figure | id: box "l" | id says "t" | a -> b "l" | stat "t" | note "t" | grid N cols');
  });
  doc.panels.forEach(function (p) {
    if (!p.stmts.length) fail(file, p.line, '', 'panel "' + p.title + '" has no statements', 'indent its figures, boxes and bubbles under the panel line with two spaces');
  });
  if (!doc.panels.length && !doc.body.length) fail(file, 1, '', 'nothing to draw', 'start with: strip 2 cols  then  panel "Title"');
  return doc;
}

// ---- layout ---------------------------------------------------------------

function wrap(text, maxChars) {
  return String(text).split('\n').map(function (para) {
    var lines = [], cur = '';
    para.split(/\s+/).filter(Boolean).forEach(function (w) {
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    });
    lines.push(cur);
    return lines.join('\n');
  }).join('\n');
}
function chars(px) { return Math.max(4, Math.floor(px / (CW * FS))); }
function size(text) {
  var ls = String(text).split('\n');
  return { w: Math.ceil(Math.max.apply(null, ls.map(function (l) { return l.length; })) * CW * FS), h: Math.ceil(ls.length * LH * FS), n: ls.length };
}

function Maker(prefix) {
  var n = 0, els = [];
  return {
    els: els,
    id: function (p) { n++; return prefix + p + n; },
    push: function (e) { els.push(e); return e; },
  };
}

function shift(els, dx, dy) {
  els.forEach(function (e) { if (typeof e.x === 'number') { e.x += dx; e.y += dy; } });
}

function layoutBody(stmts, W, scope, grid, file) {
  var mk = Maker(scope + 'e');
  var P = function (id) { return scope + id; };
  var figs = stmts.filter(function (s) { return s.kind === 'figure'; });
  var bubbles = stmts.filter(function (s) { return s.kind === 'bubble'; });
  var boxes = stmts.filter(function (s) { return s.kind === 'box'; });
  var edges = stmts.filter(function (s) { return s.kind === 'edge'; });
  var stats = stmts.filter(function (s) { return s.kind === 'stat'; });
  var notes = stmts.filter(function (s) { return s.kind === 'note'; });
  var ids = {};
  stmts.forEach(function (s) {
    if (s.id) {
      if (ids[s.id]) fail(file, s.line, '', 'id "' + s.id + '" is declared twice in this ' + (scope ? 'panel' : 'file'), 'rename one; ids only need to be unique inside their panel');
      ids[s.id] = s;
    }
  });

  // figure slots
  var used = {};
  figs.forEach(function (f) { if (f.slot) { if (used[f.slot]) fail(file, f.line, '', 'two figures in @' + f.slot, 'give each figure its own @left, @right or @center'); used[f.slot] = 1; } });
  var order = figs.length === 3 ? ['left', 'center', 'right'] : ['left', 'right', 'center'];
  figs.forEach(function (f) { if (!f.slot) { f.slot = order.filter(function (s) { return !used[s]; })[0]; if (!f.slot) fail(file, f.line, '', 'more than 3 figures in one panel', 'split the scene into two panels'); used[f.slot] = 1; } });
  figs.forEach(function (f) {
    f.nameText = f.name ? wrap(f.name, 12) : '';
    f.hw = Math.max(40, f.nameText ? Math.ceil(size(f.nameText).w / 2) + 2 : 0);
    f.cx = f.slot === 'left' ? M + f.hw : f.slot === 'right' ? W - M - f.hw : W / 2;
  });
  var speakers = {};
  bubbles.forEach(function (b) {
    var f = ids[b.who];
    if (!f || f.kind !== 'figure') fail(file, b.line, '', '"' + b.who + '" is not a figure here', 'declare it first:  ' + b.who + ': figure @left "Name"   (declared here: ' + (Object.keys(ids).join(', ') || 'nothing') + ')');
    if (speakers[b.who]) fail(file, b.line, '', '"' + b.who + '" already has a bubble in this panel', 'one bubble per figure; merge the two into one with \\n');
    speakers[b.who] = 1; b.fig = f;
  });

  var y = 0, bw, ink;
  // 1. bubbles, stacked in statement order, each leaning toward its speaker
  var two = bubbles.length > 1;
  var maxBW = two ? W - 80 : W - 2 * M;
  bubbles.forEach(function (b) {
    var f = b.fig, k = b.think ? Math.SQRT2 : 1;
    var text = wrap(b.text, chars((maxBW / k) - 20));
    var s = size(text);
    b.text2 = text;
    b.w = Math.ceil((s.w + 20) * k) + (b.think ? 8 : 0);
    b.h = Math.ceil((s.h + 20) * k);
    b.x = f.slot === 'left' ? M : f.slot === 'right' ? W - M - b.w : Math.round((W - b.w) / 2);
    b.y = y;
    y += b.h + 30;
  });
  if (bubbles.length) y = y - 30 + TAIL;
  var figTop = y;

  // 2. figures and their tails
  bubbles.forEach(function (b) {
    var f = b.fig, col = b.marker && MARKERS[b.marker];
    var by = b.y + b.h, tx = Math.max(b.x + 14, Math.min(b.x + b.w - 14, f.cx)), tipY = figTop - 6;
    mk.push({ id: P(b.who + '_' + (b.think ? 'thinks' : 'says')), type: b.think ? 'ellipse' : 'rectangle', x: b.x, y: b.y, width: b.w, height: b.h,
      backgroundColor: col ? col.fill : '#ffffff', label: { text: b.text2, fontSize: FS } });
    if (b.think) {
      [[0.62, 9], [0.8, 6], [0.95, 4]].forEach(function (d) {
        var py = by + (tipY - by) * d[0];
        mk.push({ id: mk.id('dot'), type: 'line', x: tx + (f.cx - tx) * d[0], y: py, points: [[0, 0], [1, 0]], strokeWidth: d[1] });
      });
    } else {
      mk.push({ id: mk.id('tail'), type: 'line', x: tx - 9, y: by, points: [[0, 0], [f.cx - tx + 9, tipY - by], [18, 0]], strokeWidth: 2 });
    }
  });
  var figH = 0;
  figs.forEach(function (f) {
    var col = f.marker && MARKERS[f.marker], cx = f.cx, t = figTop, sw = 3;
    mk.push({ id: P(f.id + '_head'), type: 'ellipse', x: cx - 17, y: t, width: 34, height: 34, strokeWidth: sw, backgroundColor: col ? col.fill : '#ffffff' });
    [-6, 6].forEach(function (dx) { mk.push({ id: mk.id('eye'), type: 'line', x: cx + dx, y: t + 14, points: [[0, 0], [1, 0]], strokeWidth: 5 }); });
    var mouth = f.mood === 'happy' ? [[0, 0], [8, 7], [16, 0]] : f.mood === 'sad' ? [[0, 7], [8, 0], [16, 7]] : [[0, 0], [16, 0]];
    mk.push({ id: mk.id('mouth'), type: 'line', x: cx - 8, y: t + 23, points: mouth, strokeWidth: 2 });
    mk.push({ id: mk.id('torso'), type: 'line', x: cx, y: t + 34, points: [[0, 0], [0, 44]], strokeWidth: sw });
    mk.push({ id: mk.id('arm'), type: 'line', x: cx, y: t + 46, points: [[0, 0], [-30, 22]], strokeWidth: sw });
    mk.push({ id: mk.id('arm'), type: 'line', x: cx, y: t + 46, points: [[0, 0], [30, -14]], strokeWidth: sw });
    mk.push({ id: mk.id('leg'), type: 'line', x: cx, y: t + 78, points: [[0, 0], [-22, 38]], strokeWidth: sw });
    mk.push({ id: mk.id('leg'), type: 'line', x: cx, y: t + 78, points: [[0, 0], [22, 38]], strokeWidth: sw });
    var h = 120;
    if (f.nameText) {
      var s = size(f.nameText);
      mk.push({ id: mk.id('name'), type: 'text', x: cx - s.w / 2, y: t + 122, text: f.nameText, fontSize: FS, textAlign: 'center' });
      h = 122 + s.h;
    }
    figH = Math.max(figH, h);
  });
  if (figs.length) y = figTop + figH + SECTION;
  else if (bubbles.length) y = figTop;

  // 3. boxes and the arrows between them
  if (boxes.length) {
    boxes.forEach(function (b) {
      var s = size(b.label);
      b.w = Math.max(80, s.w + 24); b.h = Math.max(52, s.h + 24);
    });
    var bwMax = Math.max.apply(null, boxes.map(function (b) { return b.w; }));
    var bhMax = Math.max.apply(null, boxes.map(function (b) { return b.h; }));
    var rx = M, rw = W - 2 * M, side = null;
    var sides = figs.map(function (f) { return f.slot; }).filter(function (s, i, a) { return a.indexOf(s) === i; });
    if (figs.length && sides.length === 1 && sides[0] !== 'center' && !grid) {
      var edgeL = Math.max.apply(null, figs.map(function (f) { return f.cx + f.hw; })) + 10;
      var edgeR = Math.min.apply(null, figs.map(function (f) { return f.cx - f.hw; })) - 10;
      var r0 = sides[0] === 'left' ? edgeL : M, r1 = sides[0] === 'left' ? W - M : edgeR;
      var room = (r1 - r0) - bwMax / 2 - 10;
      var labelsFit = edges.every(function (e) { var s = size(wrap(e.label || 'x', chars(room))); return s.n <= 3; });
      if (bwMax <= r1 - r0 && labelsFit) { side = sides[0]; rx = r0; rw = r1 - r0; }
    }
    var n = boxes.length, cols = grid || (side ? 1 : (n * bwMax + (n - 1) * 90 <= rw ? n : 1));
    cols = Math.min(cols, n);
    var labelH = 0;
    edges.forEach(function (e) { if (e.label) labelH = Math.max(labelH, size(wrap(e.label, chars(side ? rw - bwMax / 2 - 10 : 130))).h); });
    var gy = Math.max(64, labelH ? labelH + 28 : 0);
    var gx = cols > 1 ? Math.max(90, Math.min(130, (rw - cols * bwMax) / (cols - 1))) : 0;
    var totalW = cols * bwMax + (cols - 1) * gx;
    var x0 = side === 'left' ? rx : side === 'right' ? rx + rw - totalW : rx + (rw - totalW) / 2;
    boxes.forEach(function (b, i) {
      var c = i % cols, r = Math.floor(i / cols), col = b.marker && MARKERS[b.marker];
      b.w = bwMax; b.h = bhMax;
      b.x = Math.round(x0 + c * (bwMax + gx)); b.y = Math.round(y + r * (bhMax + gy));
      mk.push({ id: P(b.id), type: 'rectangle', x: b.x, y: b.y, width: b.w, height: b.h, backgroundColor: col ? col.fill : '#ffffff', label: { text: b.label, fontSize: FS } });
    });
    var rows = Math.ceil(n / cols);
    edges.forEach(function (e) {
      var a = ids[e.from], b = ids[e.to];
      [[e.from, a], [e.to, b]].forEach(function (p) {
        if (!p[1] || p[1].kind !== 'box') fail(file, e.line, '', '"' + p[0] + '" is not a box here', 'arrows join boxes; declared boxes here: ' + (boxes.map(function (x) { return x.id; }).join(', ') || 'none'));
      });
      var col = e.marker && MARKERS[e.marker];
      mk.push({ id: P(e.from + '_to_' + e.to), type: 'arrow', start: { id: P(e.from) }, end: { id: P(e.to) }, strokeColor: col ? col.ink : INK, strokeWidth: 2 });
      if (e.label) {
        var ax = (a.x + a.w / 2 + b.x + b.w / 2) / 2, ay = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
        var vertical = Math.abs(a.x - b.x) < 4, horizontal = Math.abs(a.y - b.y) < 4;
        var txt, s;
        if (horizontal) {
          var gapW = Math.abs(b.x - a.x) - bwMax;
          txt = wrap(e.label, chars(Math.max(gapW - 8, 60))); s = size(txt);
          mk.push({ id: mk.id('lbl'), type: 'text', x: ax - s.w / 2, y: ay - 8 - s.h, text: txt, fontSize: FS, strokeColor: col ? col.ink : INK, textAlign: 'center' });
        } else {
          var rightRoom = (rx + rw) - (ax + 8), leftRoom = (ax - 8) - rx;
          var onRight = side === 'right' ? false : rightRoom >= leftRoom;
          txt = wrap(e.label, chars(onRight ? rightRoom : leftRoom)); s = size(txt);
          mk.push({ id: mk.id('lbl'), type: 'text', x: onRight ? ax + 14 : ax - 14 - s.w, y: ay - s.h / 2 - (vertical ? 0 : 6), text: txt, fontSize: FS, strokeColor: col ? col.ink : INK, textAlign: onRight ? 'left' : 'right' });
        }
      }
    });
    y += rows * bhMax + (rows - 1) * gy + SECTION;
  } else if (edges.length) {
    fail(file, edges[0].line, '', 'arrow with no boxes in this ' + (scope ? 'panel' : 'file'), 'declare the boxes first: a: box "A"');
  }

  // 4. free text and the caption, centred
  stats.concat(notes).forEach(function (t) {
    var col = t.marker && MARKERS[t.marker], txt = wrap(t.text, chars(W - 2 * M)), s = size(txt);
    mk.push({ id: mk.id('txt'), type: 'text', x: Math.round((W - s.w) / 2), y: y, text: txt, fontSize: FS, strokeColor: col ? col.ink : INK, textAlign: 'center' });
    y += s.h + 10;
  });
  return { els: mk.els, h: Math.max(0, y - SECTION + 10) };
}

// Parsed document -> element array.
export function sketchToElements(doc, file) {
  var out = [];
  var cols = Math.min(doc.cols, Math.max(1, doc.panels.length));
  var width = doc.panels.length ? cols * PW + (cols - 1) * PGAP : 520;
  var y = 0;
  if (doc.title) {
    var t = wrap(doc.title, chars(width)), s = size(t);
    out.push({ id: 'title', type: 'text', x: Math.round((width - s.w) / 2), y: 0, text: t, fontSize: FS, textAlign: 'center' });
    y = s.h + 18;
  }
  if (doc.body.length) {
    var body = layoutBody(doc.body, width, '', doc.grid, file);
    shift(body.els, 0, y); out = out.concat(body.els); y += body.h + 24;
  }
  var rows = [];
  doc.panels.forEach(function (p, i) { (rows[Math.floor(i / cols)] = rows[Math.floor(i / cols)] || []).push(i); });
  rows.forEach(function (row) {
    var laid = row.map(function (i) {
      var p = doc.panels[i];
      var head = wrap(p.title, chars(PW - 2 * M)), hs = size(head);
      var stmts = p.stmts.slice();
      if (p.note) stmts.push({ kind: 'note', text: p.note, marker: null, line: p.line });
      var body = layoutBody(stmts, PW, 'p' + (i + 1) + '_', p.grid, file);
      return { head: head, hs: hs, body: body, top: hs.h + 22, num: i };
    });
    var H = Math.max.apply(null, laid.map(function (l) { return l.top + l.body.h + 16; }));
    laid.forEach(function (l, c) {
      var ox = c * (PW + PGAP), p = 'p' + (l.num + 1) + '_';
      out.push({ id: p + 'frame', type: 'rectangle', x: ox, y: y, width: PW, height: H, strokeWidth: 3 });
      out.push({ id: p + 'title', type: 'text', x: ox + Math.round((PW - l.hs.w) / 2), y: y + 9, text: l.head, fontSize: FS, textAlign: 'center' });
      out.push({ id: p + 'rule', type: 'line', x: ox, y: y + l.top - 4, points: [[0, 0], [PW, 0]], strokeWidth: 2 });
      shift(l.body.els, ox, y + l.top + 8);
      out = out.concat(l.body.els);
    });
    y += H + PGAP;
  });
  return out;
}

export function sketchToSkeleton(source, file) {
  return sketchToElements(parseSketch(source, file), file);
}
