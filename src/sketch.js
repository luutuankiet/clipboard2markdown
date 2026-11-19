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
const SMALL = 12;          // `small` text: 12 px, still 10 pt at the 2-column page scale
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
const POSES = ['point', 'cheer', 'sit', 'shrug', 'run'];   // body; combine freely with a mood
const PROPS = ['laptop', 'clock', 'server', 'coffee', 'doc'];   // line art beside a figure
const MAXCOLS = 2;         // 3+ panels per row would print under 10 pt at 468 pt page width; extra panels wrap to the next row
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
    // a check or cross must start a line, and only where the layout can draw it
    var plain = function (t, where) {
      if (MARK_ANY.test(t)) err('a check or cross mark cannot go in ' + where, 'put it at the start of a line of a box, bubble, stat, note or bar text:  stat "\u2713 Fast\\n\u2717 Slow"');
      return t;
    };
    var lead = function (t) {
      String(t).split('\n').forEach(function (l) { var m = MARK_RE.exec(l); if (MARK_ANY.test(m ? l.slice(m[0].length) : l)) err('a check or cross mark must start a line', 'move it to the start:  "\u2713 text"; one mark per line, \\n between lines'); });
      return t;
    };
    // trailing markers and slots, in any order
    var rest = function (from, allow) {
      var o = { marker: null, slot: null, mood: null, pose: null, prop: null, bold: false, small: false, words: [] };
      for (var i = from; i < tk.length; i++) {
        var w = word(i);
        if (w && MARKERS[w]) { if (o.marker) err('two colour markers on one line (' + o.marker + ', ' + w + ')', 'use only one of accent, bad, good'); o.marker = w; }
        else if (w && SLOTS.indexOf(w) >= 0 && allow.slot) o.slot = w.slice(1);
        else if (w && MOODS.indexOf(w) >= 0 && allow.mood) o.mood = w;
        else if (w && POSES.indexOf(w) >= 0 && allow.mood) o.pose = w;
        else if (w && PROPS.indexOf(w) >= 0 && allow.mood) o.prop = w;
        else if (w === 'bold' && !allow.nobold) o.bold = true;
        else if (w === 'small' && !allow.nobold) o.small = true;
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
    if (first === 'title') { doc.title = plain(str(1, 'title'), 'the title'); return; }
    if (first === 'panel') {
      var r = rest(2, { nobold: true });
      panel = { title: plain(str(1, 'panel title'), 'a panel title'), note: null, stmts: [], line: line };
      if (r.words.length) {
        if (r.words[0].v !== 'note' || !r.words[1] || !r.words[1].q || r.words.length > 2) err('after the panel title only note "caption" is allowed', 'write: panel "Title" note "One-line caption."');
        panel.note = r.words[1].v;
      }
      doc.panels.push(panel); return;
    }
    if (first === 'grid') {
      // grid N cols | grid R x C | grid RxC. Inside a panel it sets the box columns;
      // at the top level it is the same as strip (panels per row).
      var gm = /^(?:(\d)\s*x\s*)?(\d)(?:\s*cols?)?$/.exec(tk.slice(1).map(function (t) { return t.v; }).join(' '));
      var g = gm ? Number(gm[2]) : NaN;
      if (!(g >= 1 && g <= 4)) err('grid needs a column count from 1 to 4', 'write: grid 2 cols   (or grid 2 x 2; inside a panel it sets the box columns, at the top level the panels per row)');
      if (panel && indented) panel.grid = g; else if (doc.panels.length || !doc.body.length) doc.cols = g; else doc.grid = g;
      return;
    }
    if (first === 'stat' || first === 'text' || first === 'note') {
      var rs = rest(2, {});
      if (rs.words.length) err('unexpected text after the quoted string: ' + rs.words.map(function (t) { return t.v; }).join(' '), 'quote the whole text once; add \\n for a line break; bold underlines it');
      target.push({ kind: first === 'note' ? 'note' : 'stat', text: lead(str(1, 'text')), marker: rs.marker, bold: rs.bold, small: rs.small, line: line }); return;
    }
    if (first === 'bar') {
      var nb = Number(word(2));
      if (!tk[1] || !tk[1].q || !(nb >= 0) || word(2) === null) err('a bar is written: bar "label" N [marker]', 'e.g. bar "Import: 1 s" 1   (bars in one panel are scaled to the largest N)');
      var rbar = rest(3, {});
      if (rbar.words.length) err('unexpected text after the bar value', 'write: bar "label" N [accent|bad|good] [bold]');
      target.push({ kind: 'bar', text: lead(tk[1].v), n: nb, marker: rbar.marker, bold: rbar.bold, small: rbar.small, line: line }); return;
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
      target.push({ kind: 'edge', from: word(0), to: word(2), label: plain(label, 'an arrow label'), marker: re.marker, bold: re.bold, small: re.small, line: line }); return;
    }
    var w0 = word(0), w1 = word(1);
    if (w1 === 'says' || w1 === 'thinks') {
      var rb = rest(3, {});
      if (rb.words.length) err('unexpected text after the quoted string', 'one quoted string, \\n for line breaks');
      target.push({ kind: 'bubble', who: w0, think: w1 === 'thinks', text: lead(str(2, 'speech')), marker: rb.marker, bold: rb.bold, small: rb.small, line: line }); return;
    }
    if (w0 && tk[1] && !tk[1].q && tk[1].v === ':') {
      var kind = word(2);
      if (kind === 'figure') {
        var rf = rest(3, { slot: true, mood: true });
        var name = '';
        if (rf.words.length) { if (rf.words.length > 1 || !rf.words[0].q) err('a figure takes at most one quoted name', 'write: me: figure happy sit laptop @left "You"'); name = plain(rf.words[0].v, 'a figure name'); }
        target.push({ kind: 'figure', id: w0, mood: rf.mood || 'ok', pose: rf.pose, prop: rf.prop, slot: rf.slot, name: name, marker: rf.marker, bold: rf.bold, line: line }); return;
      }
      if (kind === 'same') {
        var rs2 = rest(3, {});
        if (rs2.words.length !== 1 || !rs2.words[0].q) err('same needs one quoted label', 'write: ' + w0 + ': same "Cancelled" bad   (repeats the box ' + w0 + ' from an earlier panel, same place and size)');
        target.push({ kind: 'box', same: true, id: w0, label: lead(rs2.words[0].v), marker: rs2.marker, bold: rs2.bold, small: rs2.small, line: line }); return;
      }
      if (kind === 'box') {
        var rx = rest(3, {});
        if (rx.words.length !== 1 || !rx.words[0].q) err('a box needs one quoted label', 'write: db: box "Source\\nDB" good');
        target.push({ kind: 'box', id: w0, label: lead(rx.words[0].v), marker: rx.marker, bold: rx.bold, small: rx.small, line: line }); return;
      }
      err('unknown kind "' + kind + '" after "' + w0 + ':"', 'use figure, box or same');
    }
    err('cannot read this line', 'statements: strip N cols | title "t" | panel "t" [note "c"] | id: figure [mood] [pose] [prop] | id: box "l" | id says "t" | a -> b "l" | stat "t" | note "t" | bar "l" N | grid N cols');
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
function chars(px, fs) { return Math.max(4, Math.floor(px / (CW * (fs || FS)))); }
function size(text, fs) {
  fs = fs || FS;
  var ls = String(text).split('\n');
  return { w: Math.ceil(Math.max.apply(null, ls.map(function (l) { return l.length; })) * CW * fs), h: Math.ceil(ls.length * LH * fs), n: ls.length };
}

// Check and cross marks. The font has no glyphs for them, so a line that starts
// with one is drawn as strokes in a column to the left of the text.
var MARK_RE = /^\s*([\u2713\u2714\u2717\u2718\u2715])\s*/;
var MARK_ANY = /[\u2713\u2714\u2717\u2718\u2715]/;
var MARK_W = 28;            // extra width a text with marks needs
function wrapMarked(text, maxChars) {
  var marks = [], lines = [];
  String(text).split('\n').forEach(function (para) {
    var m = MARK_RE.exec(para), w = wrap(m ? para.slice(m[0].length) : para, maxChars).split('\n');
    if (m) marks.push({ line: lines.length, ok: '\u2713\u2714'.indexOf(m[1]) >= 0 });
    lines = lines.concat(w);
  });
  return { text: lines.join('\n'), marks: marks };
}
function drawMarks(mk, marks, x, y0, fs, ink) {
  marks.forEach(function (m) {
    var cy = y0 + (m.line + 0.5) * LH * fs, s = fs * 0.85, c = ink || INK;
    if (m.ok) mk.push({ id: mk.id('mark'), type: 'line', x: x, y: cy, points: [[0, 0], [s * 0.3, s * 0.4], [s * 0.9, -s * 0.5]], strokeWidth: 3, strokeColor: c });
    else {
      mk.push({ id: mk.id('mark'), type: 'line', x: x, y: cy - s * 0.4, points: [[0, 0], [s * 0.8, s * 0.8]], strokeWidth: 3, strokeColor: c });
      mk.push({ id: mk.id('mark'), type: 'line', x: x + s * 0.8, y: cy - s * 0.4, points: [[0, 0], [-s * 0.8, s * 0.8]], strokeWidth: 3, strokeColor: c });
    }
  });
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

// ---- figures: poses and props ---------------------------------------------

// Limbs for a pose, relative to the figure's centre line. Each limb is a list
// of points from its joint; d is +1 when the panel centre is to the right.
function limbs(pose, d) {
  var legs = [[[0, 0], [-22, 38]], [[0, 0], [22, 38]]];
  switch (pose) {
    case 'point': return { arms: [[[0, 0], [-d * 20, 26]], [[0, 0], [d * 38, -6]]], legs: legs };
    case 'cheer': return { arms: [[[0, 0], [-26, -28]], [[0, 0], [26, -28]]], legs: legs };
    case 'shrug': return { arms: [[[0, 0], [-22, 10], [-32, -6]], [[0, 0], [22, 10], [32, -6]]], legs: legs };
    case 'run': return { arms: [[[0, 0], [d * 24, -10]], [[0, 0], [-d * 22, 14]]], legs: [[[0, 0], [d * 26, 12], [d * 34, 38]], [[0, 0], [-d * 24, 14], [-d * 36, 34]]] };
    case 'sit': return { arms: [[[0, 0], [d * 28, 18]], [[0, 0], [-8, 24]]], legs: [[[0, 0], [d * 30, 0], [d * 30, 34]], [[0, 0], [d * 24, 4], [d * 24, 34]]] };
    default: return { arms: [[[0, 0], [-30, 22]], [[0, 0], [30, -14]]], legs: legs };
  }
}

// Line-art props, drawn inside a 40 x 40 box at (x, y). Lines and one ellipse
// or rectangle each; no fill, no colour.
function drawProp(mk, name, x, y) {
  var ln = function (px, py, pts, w) { mk.push({ id: mk.id('prop'), type: 'line', x: x + px, y: y + py, points: pts, strokeWidth: w || 2 }); };
  if (name === 'laptop') {
    ln(5, 8, [[0, 0], [30, 0], [30, 20], [0, 20], [0, 0]]);
    ln(0, 32, [[0, 0], [40, 0], [36, 6], [4, 6], [0, 0]]);
  } else if (name === 'clock') {
    mk.push({ id: mk.id('prop'), type: 'ellipse', x: x + 3, y: y + 3, width: 34, height: 34, strokeWidth: 2, backgroundColor: '#ffffff' });
    ln(20, 20, [[0, 0], [0, -10]]);
    ln(20, 20, [[0, 0], [8, 4]]);
  } else if (name === 'server') {
    mk.push({ id: mk.id('prop'), type: 'rectangle', x: x + 5, y: y + 1, width: 30, height: 38, strokeWidth: 2, backgroundColor: '#ffffff' });
    [10, 20, 30].forEach(function (dy) { ln(5, dy, [[0, 0], [30, 0]], 1); ln(10, dy - 5, [[0, 0], [1, 0]], 4); });
  } else if (name === 'coffee') {
    ln(6, 14, [[0, 0], [0, 18], [4, 24], [20, 24], [24, 18], [24, 0], [0, 0]]);
    ln(30, 18, [[0, 0], [6, 0], [6, 10], [0, 10]]);
    ln(12, 2, [[0, 0], [3, -4], [0, -8]], 1);
    ln(20, 2, [[0, 0], [3, -4], [0, -8]], 1);
  } else if (name === 'doc') {
    ln(6, 3, [[0, 0], [20, 0], [28, 8], [28, 34], [0, 34], [0, 0]]);
    ln(26, 3, [[0, 0], [0, 8], [8, 8]], 1);
    [16, 22, 28].forEach(function (dy) { ln(12, dy, [[0, 0], [16, 0]], 1); });
  }
}

// ---- layout ---------------------------------------------------------------

function layoutBody(stmts, W, scope, grid, file) {
  var mk = Maker(scope + 'e');
  var P = function (id) { return scope + id; };
  var figs = stmts.filter(function (s) { return s.kind === 'figure'; });
  var bubbles = stmts.filter(function (s) { return s.kind === 'bubble'; });
  var boxes = stmts.filter(function (s) { return s.kind === 'box'; });
  var edges = stmts.filter(function (s) { return s.kind === 'edge'; });
  var bars = stmts.filter(function (s) { return s.kind === 'bar'; });
  var stats = stmts.filter(function (s) { return s.kind === 'stat'; });
  var notes = stmts.filter(function (s) { return s.kind === 'note'; });
  var ids = {};
  stmts.forEach(function (s) {
    if (s.id) {
      if (ids[s.id]) fail(file, s.line, '', 'id "' + s.id + '" is declared twice in this ' + (scope ? 'panel' : 'file'), 'rename one; ids only need to be unique inside their panel');
      ids[s.id] = s;
    }
  });
  var sw = function (s, base) { return s.bold ? 5 : (base || 2); };

  // figure slots
  var used = {};
  figs.forEach(function (f) { if (f.slot) { if (used[f.slot]) fail(file, f.line, '', 'two figures in @' + f.slot, 'give each figure its own @left, @right or @center'); used[f.slot] = 1; } });
  var order = figs.length === 3 ? ['left', 'center', 'right'] : ['left', 'right', 'center'];
  figs.forEach(function (f) { if (!f.slot) { f.slot = order.filter(function (s) { return !used[s]; })[0]; if (!f.slot) fail(file, f.line, '', 'more than 3 figures in one panel', 'split the scene into two panels'); used[f.slot] = 1; } });
  figs.forEach(function (f) {
    f.nameText = f.name ? wrap(f.name, 12) : '';
    f.hw = Math.max(40, f.nameText ? Math.ceil(size(f.nameText).w / 2) + 2 : 0);
    f.cx = f.slot === 'left' ? M + f.hw : f.slot === 'right' ? W - M - f.hw : W / 2;
    f.d = f.slot === 'right' ? -1 : 1;
  });
  var figBubbles = [], boxBubbles = [], speakers = {};
  bubbles.forEach(function (b) {
    var f = ids[b.who];
    if (!f || (f.kind !== 'figure' && f.kind !== 'box')) fail(file, b.line, '', '"' + b.who + '" is not a figure or box here', 'declare it first:  ' + b.who + ': figure @left "Name"   or   ' + b.who + ': box "Name"   (declared here: ' + (Object.keys(ids).join(', ') || 'nothing') + ')');
    if (speakers[b.who]) fail(file, b.line, '', '"' + b.who + '" already has a bubble in this panel', 'one bubble per figure or box; merge the two into one with \\n');
    speakers[b.who] = 1; b.fig = f;
    (f.kind === 'figure' ? figBubbles : boxBubbles).push(b);
  });
  boxBubbles.forEach(function (b) { b.fig.bub = b; });

  var y = 0;
  // 1. figure bubbles, stacked in statement order. Each bubble leans toward its
  // speaker, and its width is cut so that no earlier bubble's tail runs through it.
  var tails = [];
  figBubbles.forEach(function (b) {
    var f = b.fig, k = b.think ? Math.SQRT2 : 1;
    var lo = M, hi = W - M;
    tails.forEach(function (t) { if ((t[0] + t[1]) / 2 < f.cx) lo = Math.max(lo, t[1] + 8); else hi = Math.min(hi, t[0] - 8); });
    if (hi - lo < 70) fail(file, b.line, '', 'the bubble for "' + b.who + '" has no room beside the other speakers tails', 'move one speaker to its own panel, or give the figures @left and @right');
    var text = wrap(b.text, chars(((hi - lo) / k) - 20));
    var s = size(text);
    b.text2 = text;
    b.w = Math.min(hi - lo, Math.ceil((s.w + 20) * k) + (b.think ? 8 : 0));
    b.h = Math.ceil((s.h + 20) * k);
    var x = f.slot === 'left' ? M : f.slot === 'right' ? W - M - b.w : Math.round((W - b.w) / 2);
    b.x = Math.max(lo, Math.min(hi - b.w, x));
    b.y = y;
    b.tx = Math.max(b.x + 14, Math.min(b.x + b.w - 14, f.cx));
    tails.push([Math.min(b.tx, f.cx) - 10, Math.max(b.tx, f.cx) + 10]);
    y += b.h + 30;
  });
  if (figBubbles.length) y = y - 30 + TAIL;
  var figTop = y;

  // 2. figures and their tails
  var fgl = function (s) { return s.bold ? { strokeWidth: 5 } : {}; };
  figBubbles.forEach(function (b) {
    var f = b.fig, col = b.marker && MARKERS[b.marker];
    var by = b.y + b.h, tx = b.tx, tipY = figTop - 6;
    mk.push({ id: P(b.who + '_' + (b.think ? 'thinks' : 'says')), type: b.think ? 'ellipse' : 'rectangle', x: b.x, y: b.y, width: b.w, height: b.h, strokeWidth: sw(b),
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
  var figH = 0, boundFig = {};
  edges.forEach(function (e) { boundFig[e.from] = 1; boundFig[e.to] = 1; });
  figs.forEach(function (f) {
    var col = f.marker && MARKERS[f.marker], cx = f.cx, t = figTop, sw3 = f.bold ? 5 : 3, d = f.d;
    mk.push({ id: P(f.id + '_head'), type: 'ellipse', x: cx - 17, y: t, width: 34, height: 34, strokeWidth: sw3, backgroundColor: col ? col.fill : '#ffffff' });
    [-6, 6].forEach(function (dx) { mk.push({ id: mk.id('eye'), type: 'line', x: cx + dx, y: t + 14, points: [[0, 0], [1, 0]], strokeWidth: 5 }); });
    var mouth = f.mood === 'happy' ? [[0, 0], [8, 7], [16, 0]] : f.mood === 'sad' ? [[0, 7], [8, 0], [16, 7]] : [[0, 0], [16, 0]];
    mk.push({ id: mk.id('mouth'), type: 'line', x: cx - 8, y: t + 23, points: mouth, strokeWidth: 2 });
    mk.push({ id: mk.id('torso'), type: 'line', x: cx, y: t + 34, points: [[0, 0], [0, 44]], strokeWidth: sw3 });
    var L = limbs(f.pose, d);
    L.arms.forEach(function (pts) { mk.push({ id: mk.id('arm'), type: 'line', x: cx, y: t + 46, points: pts, strokeWidth: sw3 }); });
    L.legs.forEach(function (pts) { mk.push({ id: mk.id('leg'), type: 'line', x: cx, y: t + 78, points: pts, strokeWidth: sw3 }); });
    if (f.pose === 'sit') {            // desk in front of the figure, toward the panel centre
      mk.push({ id: mk.id('desk'), type: 'line', x: cx + d * 22, y: t + 66, points: [[0, 0], [d * 50, 0]], strokeWidth: 3 });
      mk.push({ id: mk.id('desk'), type: 'line', x: cx + d * 66, y: t + 66, points: [[0, 0], [0, 46]], strokeWidth: 3 });
    }
    if (f.pose === 'run') {            // speed lines behind
      [[26, 36], [34, 52], [26, 68]].forEach(function (p) { mk.push({ id: mk.id('speed'), type: 'line', x: cx - d * (p[0] + 14), y: t + p[1], points: [[0, 0], [-d * 14, 0]], strokeWidth: 1 }); });
    }
    if (f.prop) {
      var px = f.pose === 'sit' ? cx + d * 24 : cx + d * (f.pose === 'point' ? 46 : 36);
      var py = f.pose === 'sit' ? t + 24 : t + 52;
      drawProp(mk, f.prop, d > 0 ? px : px - 40, py);
    }
    if (boundFig[f.id]) {              // invisible hit area, so an arrow can start or end on the figure
      mk.push({ id: P(f.id), type: 'rectangle', x: cx - 28, y: t - 2, width: 56, height: 120, strokeColor: 'transparent', backgroundColor: 'transparent', strokeWidth: 1 });
    }
    f.rect = { x: cx - 28, y: t - 2, w: 56, h: 120 };
    var h = 120;
    if (f.nameText) {
      var s = size(f.nameText);
      mk.push({ id: mk.id('name'), type: 'text', x: cx - s.w / 2, y: t + 122, text: f.nameText, fontSize: FS, textAlign: 'center' });
      h = 122 + s.h;
    }
    figH = Math.max(figH, h);
  });
  if (figs.length) y = figTop + figH + SECTION;
  else if (figBubbles.length) y = figTop;

  // 3. boxes, their bubbles and the arrows
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
    while (cols > 1 && cols * bwMax + (cols - 1) * 50 > rw) cols--;     // an explicit grid still has to fit the panel
    var labelH = 0;
    edges.forEach(function (e) { if (e.label) labelH = Math.max(labelH, size(wrap(e.label, chars(side ? rw - bwMax / 2 - 10 : 130))).h); });
    var gy = Math.max(64, labelH ? labelH + 28 : 0);
    var gx = cols > 1 ? Math.max(cols * bwMax + (cols - 1) * 90 <= rw ? 90 : 50, Math.min(130, (rw - cols * bwMax) / (cols - 1))) : 0;
    var totalW = cols * bwMax + (cols - 1) * gx;
    var x0 = side === 'left' ? rx : side === 'right' ? rx + rw - totalW : rx + (rw - totalW) / 2;
    var rows = Math.ceil(n / cols), pitch = bwMax + gx;
    boxes.forEach(function (b, i) { b.c = i % cols; b.r = Math.floor(i / cols); });

    // bubbles that sit above a box: a box with an arrow coming in from the row above
    // keeps the arrow's centre line clear by putting its bubble to one side of it
    var rowExtra = [];
    for (var ri = 0; ri < rows; ri++) rowExtra[ri] = 0;
    boxes.forEach(function (b) {
      var bb = b.bub;
      if (!bb) return;
      var linked = edges.some(function (e) { var o = e.from === b.id ? ids[e.to] : e.to === b.id ? ids[e.from] : null; return o && o.kind === 'box' && o.r < b.r; });
      var cap = Math.min(rw, 210);
      if (cols > 1) cap = Math.min(cap, Math.floor(pitch * (linked ? 0.6 : 1)) - 10);
      var k = bb.think ? Math.SQRT2 : 1;
      bb.linked = linked;
      bb.text2 = wrap(bb.text, chars((linked ? Math.min(cap, bwMax / 2 + 60) : cap) / k - 20));
      var s = size(bb.text2);
      bb.w = Math.min(cap, Math.ceil((s.w + 20) * k) + (bb.think ? 8 : 0));
      bb.h = Math.ceil((s.h + 20) * k);
      rowExtra[b.r] = Math.max(rowExtra[b.r], bb.h + 26);
    });
    var rowTop = [], cur = y;
    for (var rr = 0; rr < rows; rr++) {
      cur += rowExtra[rr] + (rr > 0 ? gy : 0);
      rowTop[rr] = cur;
      cur += bhMax;
    }
    boxes.forEach(function (b) {
      var col = b.marker && MARKERS[b.marker];
      b.w = bwMax; b.h = bhMax;
      b.x = Math.round(x0 + b.c * pitch); b.y = Math.round(rowTop[b.r]);
      mk.push({ id: P(b.id), type: 'rectangle', x: b.x, y: b.y, width: b.w, height: b.h, strokeWidth: sw(b), backgroundColor: col ? col.fill : '#ffffff', label: { text: b.label, fontSize: FS } });
      var bb = b.bub;
      if (bb) {
        var bcol = bb.marker && MARKERS[bb.marker], mid = b.x + b.w / 2;
        bb.y = b.y - 26 - bb.h;
        if (bb.linked) {
          var leftRoom = (mid - 12) - rx, rightRoom = (rx + rw) - (mid + 12);
          bb.x = leftRoom >= rightRoom ? Math.round(mid - 12 - bb.w) : Math.round(mid + 12);
        } else bb.x = Math.round(Math.max(rx, Math.min(rx + rw - bb.w, mid - bb.w / 2)));
        bb.x = Math.max(M, Math.min(W - M - bb.w, bb.x));
        var tipX = bb.linked ? (bb.x < mid ? b.x + b.w * 0.25 : b.x + b.w * 0.75) : mid;
        var btx = Math.max(bb.x + 14, Math.min(bb.x + bb.w - 14, tipX)), by2 = bb.y + bb.h, tip = b.y - 4;
        mk.push({ id: P(b.id + '_' + (bb.think ? 'thinks' : 'says')), type: bb.think ? 'ellipse' : 'rectangle', x: bb.x, y: bb.y, width: bb.w, height: bb.h, strokeWidth: sw(bb),
          backgroundColor: bcol ? bcol.fill : '#ffffff', label: { text: bb.text2, fontSize: FS } });
        if (bb.think) {
          [[0.3, 9], [0.62, 6], [0.9, 4]].forEach(function (d) {
            mk.push({ id: mk.id('dot'), type: 'line', x: btx + (tipX - btx) * d[0], y: by2 + (tip - by2) * d[0], points: [[0, 0], [1, 0]], strokeWidth: d[1] });
          });
        } else {
          mk.push({ id: mk.id('tail'), type: 'line', x: btx - 9, y: by2, points: [[0, 0], [tipX - btx + 9, tip - by2], [18, 0]], strokeWidth: 2 });
        }
      }
    });
    y = rowTop[rows - 1] + bhMax + SECTION;
  } else if (edges.length && !figs.length) {
    fail(file, edges[0].line, '', 'arrow with no boxes in this ' + (scope ? 'panel' : 'file'), 'declare the boxes first: a: box "A"');
  }
  if (edges.length) {
    var anchor = function (id) { var s = ids[id]; return s && s.kind === 'figure' ? { x: s.rect.x, y: s.rect.y, w: s.rect.w, h: s.rect.h } : s && s.kind === 'box' ? s : null; };
    edges.forEach(function (e) {
      var a = anchor(e.from), b = anchor(e.to);
      [[e.from, a], [e.to, b]].forEach(function (p) {
        if (!p[1]) fail(file, e.line, '', '"' + p[0] + '" is not a box or figure here', 'arrows join boxes and figures; declared here: ' + (Object.keys(ids).filter(function (k) { return ids[k].kind === 'box' || ids[k].kind === 'figure'; }).join(', ') || 'none'));
      });
      var col = e.marker && MARKERS[e.marker];
      mk.push({ id: P(e.from + '_to_' + e.to), type: 'arrow', start: { id: P(e.from) }, end: { id: P(e.to) }, strokeColor: col ? col.ink : INK, strokeWidth: e.bold ? 4 : 2 });
      if (e.label) {
        var acx = a.x + a.w / 2, bcx = b.x + b.w / 2;
        var ax = (acx + bcx) / 2, ay = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
        var vertical = Math.abs(a.x - b.x) < 4 && Math.abs(a.w - b.w) < 4, horizontal = Math.abs(a.y - b.y) < 4;
        var txt, s;
        var lx = side ? rx : M, lw = side ? rw : W - 2 * M;
        if (horizontal) {
          var gapW = Math.abs(bcx - acx) - (a.w + b.w) / 2;
          txt = wrap(e.label, chars(Math.max(gapW - 8, 60))); s = size(txt);
          mk.push({ id: mk.id('lbl'), type: 'text', x: ax - s.w / 2, y: ay - 8 - s.h, text: txt, fontSize: FS, strokeColor: col ? col.ink : INK, textAlign: 'center' });
        } else {
          var rightRoom = (lx + lw) - (ax + 8), leftRoom = (ax - 8) - lx;
          var onRight = side === 'right' ? false : rightRoom >= leftRoom;
          txt = wrap(e.label, chars(onRight ? rightRoom : leftRoom)); s = size(txt);
          var below = vertical && ids[e.to] && ids[e.to].bub;     // a bubble sits just above the target; keep the label under the source
          var lyc = below ? a.y + a.h + 6 + s.h / 2 : ay - (vertical ? 0 : 6);
          mk.push({ id: mk.id('lbl'), type: 'text', x: onRight ? ax + 14 : ax - 14 - s.w, y: lyc - s.h / 2, text: txt, fontSize: FS, strokeColor: col ? col.ink : INK, textAlign: onRight ? 'left' : 'right' });
        }
      }
    });
  }

  // 4. bars, scaled to the largest in this panel
  if (bars.length) {
    var maxN = Math.max.apply(null, bars.map(function (b) { return b.n; })) || 1, bwFull = W - 2 * M;
    bars.forEach(function (b) {
      var col = b.marker && MARKERS[b.marker], txt = wrap(b.text, chars(bwFull)), s = size(txt);
      mk.push({ id: mk.id('bl'), type: 'text', x: M, y: y, text: txt, fontSize: FS, strokeColor: col ? col.ink : INK, textAlign: 'left' });
      y += s.h + 4;
      mk.push({ id: mk.id('bar'), type: 'rectangle', x: M, y: y, width: Math.max(6, Math.round(b.n / maxN * bwFull)), height: 18, strokeWidth: sw(b), backgroundColor: col ? col.fill : '#ffffff' });
      y += 18 + 12;
    });
    y += SECTION - 12;
  }

  // 5. free text and the caption, centred; bold underlines each line
  stats.concat(notes).forEach(function (t) {
    var col = t.marker && MARKERS[t.marker], txt = wrap(t.text, chars(W - 2 * M)), s = size(txt);
    mk.push({ id: mk.id('txt'), type: 'text', x: Math.round((W - s.w) / 2), y: y, text: txt, fontSize: FS, strokeColor: col ? col.ink : INK, textAlign: 'center' });
    if (t.bold) txt.split('\n').forEach(function (l, i) {
      var lw = Math.ceil(l.length * CW * FS * 0.92);
      mk.push({ id: mk.id('ul'), type: 'line', x: Math.round((W - lw) / 2), y: y + (i + 1) * LH * FS - 1, points: [[0, 0], [lw, 0]], strokeWidth: 3 });
    });
    y += s.h + 10 + (t.bold ? 4 : 0);
  });
  return { els: mk.els, h: Math.max(0, y - SECTION + 10) };
}

// Parsed document -> element array.
export function sketchToElements(doc, file) {
  var out = [];
  var cols = Math.min(doc.cols, MAXCOLS, Math.max(1, doc.panels.length));
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
      var ox = c * (PW + PGAP) + (doc.cols > MAXCOLS && laid.length < cols ? Math.round((cols - laid.length) * (PW + PGAP) / 2) : 0), p = 'p' + (l.num + 1) + '_';
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
