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
const MAXCOLS = 3;         // more than 3 panels per row would print under 10 pt at 468 pt page width; extra panels wrap to the next row
const BOXCAP = 210;        // widest box text in px; longer labels wrap
const SLOTS = ['@left', '@right', '@center'];
const TOPSLOTS = ['@top-left', '@top-right', '@top'];   // a box on a row of its own at the top of the panel

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
      String(t).split('\n').forEach(function (l) { l = l.replace(TILDE_RE, ''); var m = MARK_RE.exec(l); if (MARK_ANY.test(m ? l.slice(m[0].length) : l)) err('a check or cross mark must start a line', 'move it to the start:  "\u2713 text"; one mark per line, \\n between lines'); });
      return t;
    };
    // trailing markers and slots, in any order
    var rest = function (from, allow) {
      var o = { marker: null, slot: null, mood: null, pose: null, prop: null, bold: false, small: false, words: [] };
      for (var i = from; i < tk.length; i++) {
        var w = word(i);
        if (w && MARKERS[w]) { if (o.marker) err('two colour markers on one line (' + o.marker + ', ' + w + ')', 'use only one of accent, bad, good'); o.marker = w; }
        else if (w && SLOTS.indexOf(w) >= 0 && allow.slot) o.slot = w.slice(1);
        else if (w && TOPSLOTS.indexOf(w) >= 0 && allow.top) o.top = w === '@top' ? 'center' : w.slice(5);
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
      if (!(n >= 1 && n <= MAXCOLS)) err('strip needs a column count from 1 to 3', n > MAXCOLS ? 'write: strip 3 cols   (at most 3 panels fit a row at 10 pt; the 4th panel starts a second row)' : 'write: strip 2 cols   (2 columns fit a 468 pt page at 14 pt text)');
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
        var rx = rest(3, { top: true });
        if (rx.words.length !== 1 || !rx.words[0].q) err('a box needs one quoted label', 'write: db: box "Source\\nDB" good [@top-right]');
        target.push({ kind: 'box', top: rx.top, id: w0, label: lead(rx.words[0].v), marker: rx.marker, bold: rx.bold, small: rx.small, line: line }); return;
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
// with one is drawn as strokes in a column to the left of the text. A line that
// starts with ~ is small (SMALL px) even when the statement is not.
var MARK_RE = /^\s*([✓✔✗✘✕])\s*/;
var MARK_ANY = /[✓✔✗✘✕]/;
var TILDE_RE = /^\s*~\s?/;
var MARK_W = 28;            // extra width a text with marks needs

// Text -> lines with their own font size and optional mark. maxPx is the room for
// the text; a marked block gives up MARK_W of it to the mark column.
function block(text, small, maxPx) {
  var marked = false, raw = [], lines = [];
  String(text).split('\n').forEach(function (p) {
    var sm = !!small, t = TILDE_RE.exec(p), mark = null;
    if (t) { sm = true; p = p.slice(t[0].length); }
    var m = MARK_RE.exec(p);
    if (m) { mark = '✓✔'.indexOf(m[1]) >= 0 ? 'ok' : 'x'; p = p.slice(m[0].length); marked = true; }
    raw.push({ p: p, fs: sm ? SMALL : FS, mark: mark });
  });
  raw.forEach(function (r) {
    wrap(r.p, chars(maxPx - (marked ? MARK_W : 0), r.fs)).split('\n').forEach(function (t, i) { lines.push({ t: t, fs: r.fs, mark: i === 0 ? r.mark : null }); });
  });
  var w = 0, h = 0;
  lines.forEach(function (l) { w = Math.max(w, l.t.length * CW * l.fs); h += LH * l.fs; });
  return { lines: lines, marked: marked, mixed: lines.some(function (l) { return l.fs !== lines[0].fs; }), w: Math.ceil(w) + (marked ? MARK_W : 0), h: Math.ceil(h) };
}
function drawMark(mk, ok, x, cy, fs, ink) {
  var s = fs * 0.85, c = ink || INK;
  if (ok) mk.push({ id: mk.id('mark'), type: 'line', x: x, y: cy, points: [[0, 0], [s * 0.3, s * 0.4], [s * 0.9, -s * 0.5]], strokeWidth: 3, strokeColor: c });
  else {
    mk.push({ id: mk.id('mark'), type: 'line', x: x, y: cy - s * 0.4, points: [[0, 0], [s * 0.8, s * 0.8]], strokeWidth: 3, strokeColor: c });
    mk.push({ id: mk.id('mark'), type: 'line', x: x + s * 0.8, y: cy - s * 0.4, points: [[0, 0], [-s * 0.8, s * 0.8]], strokeWidth: 3, strokeColor: c });
  }
}
// Put a block of text in the area [bx, bx + bw] with its top at by. One text
// element when every line is alike; one per line when sizes differ or marks are drawn.
function emit(mk, blk, bx, by, bw, o) {
  var ink = o && o.ink, left = o && o.align === 'left';
  if (!blk.marked && !blk.mixed) {
    mk.push({ id: mk.id('txt'), type: 'text', x: Math.round(left ? bx : bx + (bw - blk.w) / 2), y: by, text: blk.lines.map(function (l) { return l.t; }).join('\n'), fontSize: blk.lines[0].fs, strokeColor: ink || INK, textAlign: left ? 'left' : 'center' });
    return;
  }
  var y = by, x0 = left ? bx : bx + (bw - blk.w) / 2;
  blk.lines.forEach(function (l) {
    var lh = LH * l.fs, lw = Math.ceil(l.t.length * CW * l.fs);
    var tx = blk.marked ? x0 + MARK_W : (left ? bx : bx + (bw - lw) / 2);
    if (l.t) mk.push({ id: mk.id('txt'), type: 'text', x: Math.round(tx), y: y, text: l.t, fontSize: l.fs, strokeColor: ink || INK, textAlign: 'left' });
    if (l.mark) drawMark(mk, l.mark === 'ok', x0 + 2, y + lh / 2, l.fs, ink);
    y += lh;
  });
}
// A rectangle or ellipse with its text: a bound label when the text is plain,
// loose text laid over the shape otherwise.
function shapeText(mk, shape, blk) {
  if (!blk.marked && !blk.mixed) {
    shape.label = { text: blk.lines.map(function (l) { return l.t; }).join('\n'), fontSize: blk.lines[0].fs };
    mk.push(shape);
  } else {
    mk.push(shape);
    emit(mk, blk, shape.x, shape.y + (shape.height - blk.h) / 2, shape.width, {});
  }
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

// reg remembers where each box landed (x, y, w, h inside its panel) so a later
// `id: same "Label"` can repeat it; need holds the widest label of every id that
// is repeated, so the original is drawn big enough for all of its labels.
function layoutBody(stmts, W, scope, grid, file, reg, need, cross) {
  var mk = Maker(scope + 'e');
  var P = function (id) { return scope + id; };
  var figs = stmts.filter(function (s) { return s.kind === 'figure'; });
  var bubbles = stmts.filter(function (s) { return s.kind === 'bubble'; });
  var boxes = stmts.filter(function (s) { return s.kind === 'box' && !s.same && !s.top; });
  var tops = stmts.filter(function (s) { return s.kind === 'box' && s.top && !s.same; });
  var fixed = stmts.filter(function (s) { return s.kind === 'box' && s.same; });
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
  var cap = Math.min(BOXCAP, W - 2 * M - 24);   // box text wraps to the panel before the panel has to grow

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

  var pushBox = function (b) {
    var col = b.marker && MARKERS[b.marker];
    shapeText(mk, { id: P(b.id), type: 'rectangle', x: b.x, y: b.y, width: b.w, height: b.h, strokeWidth: sw(b), backgroundColor: col ? col.fill : '#ffffff' }, b.blk);
  };
  var y = 0;
  // 0. boxes with @top-left, @top-right or @top (centre): a row of their own above everything
  tops.forEach(function (b) {
    b.blk = block(b.label, b.small, cap);
    var nd = need[b.id] || { w: 0, h: 0 };
    b.w = Math.max(80, b.blk.w + 24, nd.w); b.h = Math.max(52, b.blk.h + 24, nd.h);
    if (stmts.some(function (s) { return s.kind === 'bubble' && s.who === b.id; })) fail(file, b.line, '', 'a box with @top' + (b.top === 'center' ? '' : '-' + b.top) + ' cannot have a bubble', 'drop the slot so the box sits in the box rows, where it can speak:  ' + b.id + ': box "' + b.label.replace(/\n/g, '\\n') + '"   (or let a figure say it)');
  });
  var pinnedTop = fixed.filter(function (b) { return reg[b.id] && reg[b.id].top; });
  if (tops.length || pinnedTop.length) {
    var tbands = {};
    tops.forEach(function (b) { if (tbands[b.top]) fail(file, b.line, '', 'two boxes at the same top slot', 'give each box its own @top-left, @top-right or @top'); tbands[b.top] = 1; });
    var th = Math.max.apply(null, tops.map(function (b) { return b.h; }).concat(pinnedTop.map(function (b) { return reg[b.id].h; })));
    tops.forEach(function (b) {
      b.x = b.top === 'left' ? M : b.top === 'right' ? W - M - b.w : Math.round((W - b.w) / 2); b.y = 0;
      pushBox(b);
      if (b.id) reg[b.id] = { x: b.x, y: b.y, w: b.w, h: b.h, top: true };
    });
    y = th + 34;
  }
  // 1. figure bubbles, stacked in statement order. Each bubble leans toward its
  // speaker, and its width is cut so that no earlier bubble's tail runs through it.
  var tails = [];
  figBubbles.forEach(function (b) {
    var f = b.fig, k = b.think ? Math.SQRT2 : 1;
    var lo = M, hi = W - M;
    tails.forEach(function (t) { if ((t[0] + t[1]) / 2 < f.cx) lo = Math.max(lo, t[1] + 8); else hi = Math.min(hi, t[0] - 8); });
    if (hi - lo < 70) fail(file, b.line, '', 'the bubble for "' + b.who + '" has no room beside the other speakers tails', 'move one speaker to its own panel, or give the figures @left and @right');
    var s = block(b.text, b.small, ((hi - lo) / k) - 20);
    b.blk = s;
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
    shapeText(mk, { id: P(b.who + '_' + (b.think ? 'thinks' : 'says')), type: b.think ? 'ellipse' : 'rectangle', x: b.x, y: b.y, width: b.w, height: b.h, strokeWidth: sw(b),
      backgroundColor: col ? col.fill : '#ffffff' }, b.blk);
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

  // 3. boxes, their bubbles and the arrows. `same` boxes are pinned to where the
  // original sat; new boxes in the panel flow below them.
  var rx = M, rw = W - 2 * M, side = null, bwMax = 0, bhMax = 0, cols = 1, pitch = 0, rows = 0;
  var prepBub = function (b, linked, cap, linkW) {
    var bb = b.bub, k = bb.think ? Math.SQRT2 : 1;
    bb.linked = linked;
    bb.blk = block(bb.text, bb.small, (linked ? Math.min(cap, linkW) : cap) / k - 20);
    bb.w = Math.min(cap, Math.ceil((bb.blk.w + 20) * k) + (bb.think ? 8 : 0));
    bb.h = Math.ceil((bb.blk.h + 20) * k);
  };
  var drawBub = function (b) {
    var bb = b.bub;
    if (!bb) return;
    var bcol = bb.marker && MARKERS[bb.marker], mid = b.x + b.w / 2;
    bb.y = b.y - 26 - bb.h;
    if (bb.linked) {
      var leftRoom = (mid - 12) - rx, rightRoom = (rx + rw) - (mid + 12);
      bb.x = leftRoom >= rightRoom ? Math.round(mid - 12 - bb.w) : Math.round(mid + 12);
    } else bb.x = Math.round(Math.max(rx, Math.min(rx + rw - bb.w, mid - bb.w / 2)));
    bb.x = Math.max(M, Math.min(W - M - bb.w, bb.x));
    var tipX = bb.linked ? (bb.x < mid ? b.x + b.w * 0.25 : b.x + b.w * 0.75) : mid;
    var btx = Math.max(bb.x + 14, Math.min(bb.x + bb.w - 14, tipX)), by2 = bb.y + bb.h, tip = b.y - 4;
    shapeText(mk, { id: P(b.id + '_' + (bb.think ? 'thinks' : 'says')), type: bb.think ? 'ellipse' : 'rectangle', x: bb.x, y: bb.y, width: bb.w, height: bb.h, strokeWidth: sw(bb),
      backgroundColor: bcol ? bcol.fill : '#ffffff' }, bb.blk);
    if (bb.think) {
      [[0.3, 9], [0.62, 6], [0.9, 4]].forEach(function (d) {
        mk.push({ id: mk.id('dot'), type: 'line', x: btx + (tipX - btx) * d[0], y: by2 + (tip - by2) * d[0], points: [[0, 0], [1, 0]], strokeWidth: d[1] });
      });
    } else {
      mk.push({ id: mk.id('tail'), type: 'line', x: btx - 9, y: by2, points: [[0, 0], [tipX - btx + 9, tip - by2], [18, 0]], strokeWidth: 2 });
    }
  };
  var fixedBottom = y, boxTop = y;
  fixed.forEach(function (b) {
    var r = reg[b.id];
    if (!r) fail(file, b.line, '', '"' + b.id + '" is repeated with same, but no earlier panel declares it', 'declare it first in an earlier panel:  ' + b.id + ': box "Label"   (then ' + b.id + ': same "New label" in a later panel)');
    b.blk = block(b.label, b.small, cap);
    b.x = r.x; b.y = r.y; b.w = r.w; b.h = r.h;
    var lower = function (req, line) {      // this panel needs the box lower than the first panel put it: the build is redone once with the box lowered there
      if (b.y >= req) return;
      if (need.final) fail(file, line, '', 'the box "' + b.id + '" cannot sit at the same place in this panel', 'take a figure or a bubble out of this panel');
      need[b.id].y = Math.max(need[b.id].y || 0, req); need.dirty = true;
    };
    if (r.top) { b.lower = function () {}; } else { lower(boxTop, b.line); b.lower = lower; }
    fixedBottom = Math.max(fixedBottom, b.y + b.h + SECTION);
  });
  if (boxes.length) {
    boxes.forEach(function (b) {
      b.blk = block(b.label, b.small, cap);
      var nd = need[b.id] || { w: 0, h: 0 };
      b.w = Math.max(80, b.blk.w + 24, nd.w); b.h = Math.max(52, b.blk.h + 24, nd.h);
    });
    bwMax = Math.max.apply(null, boxes.map(function (b) { return b.w; }));
    bhMax = Math.max.apply(null, boxes.map(function (b) { return b.h; }));
    var sides = figs.map(function (f) { return f.slot; }).filter(function (s, i, a) { return a.indexOf(s) === i; });
    if (figs.length && sides.length === 1 && sides[0] !== 'center' && !grid) {
      var edgeL = Math.max.apply(null, figs.map(function (f) { return f.cx + f.hw; })) + 10;
      var edgeR = Math.min.apply(null, figs.map(function (f) { return f.cx - f.hw; })) - 10;
      var r0 = sides[0] === 'left' ? edgeL : M, r1 = sides[0] === 'left' ? W - M : edgeR;
      var room = (r1 - r0) - bwMax / 2 - 10;
      var labelsFit = edges.every(function (e) { var s = size(wrap(e.label || 'x', chars(room, e.small ? SMALL : FS)), e.small ? SMALL : FS); return s.n <= 3; });
      if (bwMax <= r1 - r0 && labelsFit && !fixed.length) { side = sides[0]; rx = r0; rw = r1 - r0; }
    }
    var n = boxes.length;
    cols = grid || (side ? 1 : (n * bwMax + (n - 1) * 90 <= rw ? n : 1));
    cols = Math.min(cols, n);
    while (cols > 1 && cols * bwMax + (cols - 1) * 50 > rw) cols--;     // an explicit grid still has to fit the panel
    var labelH = 0;
    edges.forEach(function (e) { if (e.label) { var efs = e.small ? SMALL : FS; labelH = Math.max(labelH, size(wrap(e.label, chars(side ? rw - bwMax / 2 - 10 : 130, efs)), efs).h); } });
    var gy = Math.max(64, labelH ? labelH + 28 : 0);
    var gx = cols > 1 ? Math.max(cols * bwMax + (cols - 1) * 90 <= rw ? 90 : 50, Math.min(130, (rw - cols * bwMax) / (cols - 1))) : 0;
    var totalW = cols * bwMax + (cols - 1) * gx;
    var x0 = side === 'left' ? rx : side === 'right' ? rx + rw - totalW : rx + (rw - totalW) / 2;
    rows = Math.ceil(n / cols); pitch = bwMax + gx;
    boxes.forEach(function (b, i) { b.c = i % cols; b.r = Math.floor(i / cols); });

    // bubbles that sit above a box: a box with an arrow coming in from the row above
    // keeps the arrow's centre line clear by putting its bubble to one side of it
    var rowExtra = [];
    for (var ri = 0; ri < rows; ri++) rowExtra[ri] = 0;
    boxes.forEach(function (b) {
      if (!b.bub) return;
      var linked = edges.some(function (e) { var o = e.from === b.id ? ids[e.to] : e.to === b.id ? ids[e.from] : null; return o && o.kind === 'box' && o.r < b.r; });
      var cap = Math.min(rw, 210);
      if (cols > 1) cap = Math.min(cap, Math.floor(pitch * (linked ? 0.6 : 1)) - 10);
      prepBub(b, linked, cap, bwMax / 2 + 60);
      rowExtra[b.r] = Math.max(rowExtra[b.r], b.bub.h + 26);
    });
    var rowTop = [], cur = Math.max(y, fixedBottom);
    for (var rr = 0; rr < rows; rr++) {
      cur += rowExtra[rr] + (rr > 0 ? gy : 0);
      boxes.forEach(function (b) { if (b.r === rr && need[b.id] && need[b.id].y) cur = Math.max(cur, need[b.id].y); });
      rowTop[rr] = cur;
      cur += bhMax;
    }
    boxes.forEach(function (b) {
      b.w = bwMax; b.h = bhMax;
      b.x = Math.round(x0 + b.c * pitch); b.y = Math.round(rowTop[b.r]);
      pushBox(b); drawBub(b);
      if (b.id) reg[b.id] = { x: b.x, y: b.y, w: b.w, h: b.h };
    });
    y = rowTop[rows - 1] + bhMax + SECTION;
  }
  fixed.forEach(function (b) {
    pushBox(b);
    if (b.bub) {
      var linked = edges.some(function (e) { var o = e.from === b.id ? ids[e.to] : e.to === b.id ? ids[e.from] : null; return o && o.kind === 'box' && typeof o.y === 'number' && o.y + o.h <= b.y; });
      prepBub(b, linked, Math.min(rw, 210), b.w / 2 + 60);
      b.lower(boxTop + b.bub.h + 26, b.bub.line);
      drawBub(b);
    }
  });
  if (fixed.length) y = Math.max(y, fixedBottom);
  if (edges.length) {
    var anchor = function (id) { var s = ids[id]; return s && s.kind === 'figure' ? { x: s.rect.x, y: s.rect.y, w: s.rect.w, h: s.rect.h } : s && s.kind === 'box' ? s : null; };
    edges = edges.filter(function (e) {     // an end that is not here is looked up in the other panels once all are placed
      if (anchor(e.from) && anchor(e.to)) return true;
      cross.push({ e: e, scope: scope }); return false;
    });
    edges.forEach(function (e) {
      var a = anchor(e.from), b = anchor(e.to);
      var col = e.marker && MARKERS[e.marker];
      mk.push({ id: P(e.from + '_to_' + e.to), type: 'arrow', start: { id: P(e.from) }, end: { id: P(e.to) }, strokeColor: col ? col.ink : INK, strokeWidth: e.bold ? 4 : 2 });
      if (e.label) {
        var acx = a.x + a.w / 2, bcx = b.x + b.w / 2;
        var ax = (acx + bcx) / 2, ay = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
        var vertical = Math.abs(a.x - b.x) < 4 && Math.abs(a.w - b.w) < 4, horizontal = Math.abs(a.y - b.y) < 4;
        var txt, s, efs = e.small ? SMALL : FS;
        var lx = side ? rx : M, lw = side ? rw : W - 2 * M;
        if (horizontal) {
          var gapW = Math.abs(bcx - acx) - (a.w + b.w) / 2;
          txt = wrap(e.label, chars(Math.max(gapW - 8, 60), efs)); s = size(txt, efs);
          mk.push({ id: mk.id('lbl'), type: 'text', x: ax - s.w / 2, y: ay - 8 - s.h, text: txt, fontSize: efs, strokeColor: col ? col.ink : INK, textAlign: 'center' });
        } else {
          var rightRoom = (lx + lw) - (ax + 8), leftRoom = (ax - 8) - lx;
          var onRight = side === 'right' ? false : rightRoom >= leftRoom;
          txt = wrap(e.label, chars(onRight ? rightRoom : leftRoom, efs)); s = size(txt, efs);
          var below = vertical && ids[e.to] && ids[e.to].bub;     // a bubble sits just above the target; keep the label under the source
          var lyc = below ? a.y + a.h + 6 + s.h / 2 : ay - (vertical ? 0 : 6);
          mk.push({ id: mk.id('lbl'), type: 'text', x: onRight ? ax + 14 : ax - 14 - s.w, y: lyc - s.h / 2, text: txt, fontSize: efs, strokeColor: col ? col.ink : INK, textAlign: onRight ? 'left' : 'right' });
        }
      }
    });
  }

  // 4. bars, scaled to the largest in this panel
  if (bars.length) {
    var maxN = Math.max.apply(null, bars.map(function (b) { return b.n; })) || 1, bwFull = W - 2 * M;
    bars.forEach(function (b) {
      var col = b.marker && MARKERS[b.marker], blk = block(b.text, b.small, bwFull);
      emit(mk, blk, M, y, bwFull, { align: 'left', ink: col ? col.ink : INK });
      y += blk.h + 4;
      mk.push({ id: mk.id('bar'), type: 'rectangle', x: M, y: y, width: Math.max(6, Math.round(b.n / maxN * bwFull)), height: 18, strokeWidth: sw(b), backgroundColor: col ? col.fill : '#ffffff' });
      y += 18 + 12;
    });
    y += SECTION - 12;
  }

  // 5. free text and the caption, centred; bold underlines each line
  stats.concat(notes).forEach(function (t) {
    var col = t.marker && MARKERS[t.marker], blk = block(t.text, t.small, W - 2 * M), uy = y;
    emit(mk, blk, 0, y, W, { ink: col ? col.ink : INK });
    if (t.bold) blk.lines.forEach(function (l) {
      var lw = Math.ceil(l.t.length * CW * l.fs * 0.92);
      uy += LH * l.fs;
      mk.push({ id: mk.id('ul'), type: 'line', x: Math.round(blk.marked ? (W - blk.w) / 2 + MARK_W : (W - lw) / 2), y: uy - 1, points: [[0, 0], [lw, 0]], strokeWidth: 3 });
    });
    y += blk.h + 10 + (t.bold ? 4 : 0);
  });
  return { els: mk.els, h: Math.max(0, y - SECTION + 10) };
}

// Parsed document -> element array.
export function sketchToElements(doc, file) {
  var need = {}, out = build(doc, file, need);
  if (need.dirty) { need.final = true; out = build(doc, file, need); }   // a repeated box sits lower in its first panel when a later panel needs room above it
  return out;
}
function build(doc, file, need) {
  var out = [];
  var cols = Math.min(doc.cols, MAXCOLS, Math.max(1, doc.panels.length));
  var PW = cols >= 3 ? 226 : 256, PGAP = 32;    // 3 panels in a row are narrower so the text still prints at 10 pt
  var width = doc.panels.length ? cols * PW + (cols - 1) * PGAP : 520;
  var y = 0, reg = {}, again = {}, cross = [], seen = {};
  // `id: same` with no earlier box of that id is simply its first declaration
  [doc.body].concat(doc.panels.map(function (p) { return p.stmts; })).forEach(function (stmts) {
    stmts.forEach(function (st) { if (st.kind === 'box') { if (st.same && !seen[st.id]) st.same = false; seen[st.id] = 1; } });
  });
  var scan = function (stmts) { stmts.forEach(function (st) { if (st.kind === 'box' && st.same) again[st.id] = 1; }); };
  scan(doc.body); doc.panels.forEach(function (p) { scan(p.stmts); });
  var want = function (stmts) { stmts.forEach(function (st) { if (st.kind === 'box' && again[st.id]) { var bl = block(st.label, st.small, Math.min(BOXCAP, PW - 2 * M - 24)), n0 = need[st.id] || { w: 0, h: 0 }; need[st.id] = { w: Math.max(n0.w, bl.w + 24), h: Math.max(n0.h, bl.h + 24), y: n0.y || 0 }; } }); };
  want(doc.body); doc.panels.forEach(function (p) { want(p.stmts); });
  if (doc.title) {
    var t = wrap(doc.title, chars(width)), s = size(t);
    out.push({ id: 'title', type: 'text', x: Math.round((width - s.w) / 2), y: 0, text: t, fontSize: FS, textAlign: 'center' });
    y = s.h + 18;
  }
  if (doc.body.length) {
    var body = layoutBody(doc.body, width, '', doc.grid, file, reg, need, cross);
    shift(body.els, 0, y); out = out.concat(body.els); y += body.h + 24;
  }
  var rows = [];
  doc.panels.forEach(function (p, i) { (rows[Math.floor(i / cols)] = rows[Math.floor(i / cols)] || []).push(i); });
  rows.forEach(function (row) {
    var c0 = cross.length;
    var lay = function (RW) {
      cross.length = c0;
      return row.map(function (i) {
        var p = doc.panels[i];
        var head = wrap(p.title, chars(RW - 2 * M)), hs = size(head);
        var stmts = p.stmts.slice();
        if (p.note) stmts.push({ kind: 'note', text: p.note, marker: null, line: p.line });
        var body = layoutBody(stmts, RW, 'p' + (i + 1) + '_', p.grid, file, reg, need, cross);
        return { head: head, hs: hs, body: body, top: hs.h + 22, num: i };
      });
    };
    // a panel grows to fit its widest box: lay out once, measure, lay out again at the width that fits
    var RW = PW, laid = lay(PW);
    var grow = Math.max.apply(null, laid.map(function (l) { return overflow(l.body.els, PW); }));
    if (grow > 0) { RW = PW + Math.ceil(grow / 2) * 2; laid = lay(RW); }
    var H = Math.max.apply(null, laid.map(function (l) { return l.top + l.body.h + 16; }));
    laid.forEach(function (l, c) {
      var ox = c * (RW + PGAP) + (doc.cols > MAXCOLS && laid.length < cols ? Math.round((cols - laid.length) * (RW + PGAP) / 2) : 0), p = 'p' + (l.num + 1) + '_';
      out.push({ id: p + 'frame', type: 'rectangle', x: ox, y: y, width: RW, height: H, strokeWidth: 3 });
      out.push({ id: p + 'title', type: 'text', x: ox + Math.round((RW - l.hs.w) / 2), y: y + 9, text: l.head, fontSize: FS, textAlign: 'center' });
      out.push({ id: p + 'rule', type: 'line', x: ox, y: y + l.top - 4, points: [[0, 0], [RW, 0]], strokeWidth: 2 });
      shift(l.body.els, ox, y + l.top + 8);
      out = out.concat(l.body.els);
    });
    y += H + PGAP;
  });
  return out.concat(crossArrows(doc, cross, file));
}

// How far a panel body pokes out of a panel W wide (left plus right), so the
// frame can grow by that much; the layout centres its items, so growth is shared.
function overflow(els, W) {
  var lo = M, hi = W - M;
  els.forEach(function (e) {
    if (typeof e.x !== 'number' || e.type === 'line' || e.type === 'arrow' || e.containerId) return;
    var w = typeof e.width === 'number' ? e.width : e.type === 'text' && typeof e.text === 'string' ? size(e.text, e.fontSize || FS).w : 0;
    lo = Math.min(lo, e.x); hi = Math.max(hi, e.x + w);
  });
  return Math.ceil((M - lo) + (hi - (W - M)));
}

// Arrows whose ends sit in different panels (or are written at the top level):
// an id resolves to the arrow's own panel first, then to the one panel that declares it.
function crossArrows(doc, cross, file) {
  if (!cross.length) return [];
  var where = {};
  doc.panels.forEach(function (p, i) {
    p.stmts.forEach(function (st) { if (st.id && (st.kind === 'box' || st.kind === 'figure')) (where[st.id] = where[st.id] || []).push('p' + (i + 1) + '_'); });
  });
  var mk = Maker('x');
  cross.forEach(function (c) {
    var e = c.e;
    var res = function (id) {
      var at = where[id] || [];
      if (c.scope && at.indexOf(c.scope) >= 0) return c.scope + id;
      if (at.length === 1) return at[0] + id;
      if (!at.length) fail(file, e.line, '', '"' + id + '" is not a box or figure in any panel', 'declare it first:  ' + id + ': box "Label"   (boxes in panels: ' + (Object.keys(where).join(', ') || 'none') + ')');
      fail(file, e.line, '', '"' + id + '" is declared in panels ' + at.map(function (s) { return s.slice(1, -1); }).join(', ') + ', so this arrow cannot tell which one it means', 'give each its own id (' + id + '1, ' + id + '2), or write the arrow inside the panel that holds both ends');
    };
    var fa = res(e.from), fb = res(e.to);
    var col = e.marker && MARKERS[e.marker];
    // the label rides on the arrow itself: between panels there is no free room beside it
    var arrow = { id: fa + '_to_' + fb, type: 'arrow', start: { id: fa }, end: { id: fb }, strokeColor: col ? col.ink : INK, strokeWidth: e.bold ? 4 : 2 };
    if (e.label) arrow.label = { text: wrap(e.label, chars(110, e.small ? SMALL : FS)), fontSize: e.small ? SMALL : FS };
    mk.push(arrow);
  });
  return mk.els;
}

export function sketchToSkeleton(source, file) {
  return sketchToElements(parseSketch(source, file), file);
}
