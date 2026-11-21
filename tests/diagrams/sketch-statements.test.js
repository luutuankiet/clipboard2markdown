// @vitest-environment node
// One compact test per statement of the comic format: each draws what it says,
// stays clean under lint, and its error cases carry a fix hint.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sketchToSkeleton, parseSketch } from '../../src/sketch.js';
import { buildSkeleton } from '../../src/diagrams/skeleton.js';
import { lintScene } from '../../src/lint.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures-sketch');
const draw = (src) => sketchToSkeleton(src, 't.c2m');
// opts.gaps: skip the 30 px spacing rule, for a tail-joined bubble or a prop held beside a head
const clean = (src, opts = {}) => {
  const built = buildSkeleton(draw(src));
  expect(built.warnings.filter((w) => !/^outline:/.test(w) && !(opts.gaps && /px apart/.test(w)))).toEqual([]);
  expect(lintScene(built.scene).findings.filter((x) => !(opts.gaps && /px apart/.test(JSON.stringify(x))))).toEqual([]);
  return built.scene.elements;
};
const fails = (src, re) => {
  let msg = '';
  try { draw(src); } catch (e) { msg = e.message; }
  expect(msg).toMatch(re);
  expect(msg).toMatch(/fix: /);
};
const byId = (els, re) => els.filter((e) => re.test(String(e.id)));
const texts = (els) => els.filter((e) => e.type === 'text').map((e) => e.text).join('\n');

describe('c2m statements', () => {
  it('says on a box puts a bubble above the box', () => {
    const els = clean('panel "A"\n  db: box "DB"\n  db says "ready"', { gaps: true });
    const bub = byId(els, /_db_says$/)[0], box = byId(els, /_db$/)[0];
    expect(bub.y + bub.height).toBeLessThanOrEqual(box.y);
    fails('panel "A"\n  db: box "DB"\n  db says "a"\n  db says "b"', /already has a bubble/);
  });
  it('arrows can start and end on figures', () => {
    const els = clean('panel "A"\n  me: figure @left "Me"\n  db: box "DB"\n  me -> db "asks"');
    const arrow = byId(els, /me_to_db$/)[0];
    expect(arrow.type).toBe('arrow');
    expect(byId(els, /_me$/)[0].type).toBe('rectangle');
  });
  it('every pose and prop draws lines without lint findings', () => {
    ['point', 'cheer', 'sit', 'shrug', 'run'].forEach((pose) => {
      const els = clean('panel "A"\n  me: figure ' + pose + ' @left "Me"');
      expect(byId(els, /arm|leg/).length).toBeGreaterThan(2);
    });
    ['laptop', 'clock', 'server', 'coffee', 'doc'].forEach((prop) => {
      expect(byId(clean('panel "A"\n  me: figure sit ' + prop + ' @left "Me"', { gaps: true }), /prop/).length).toBeGreaterThan(0);
    });
  });
  it('bold thickens strokes and underlines stats', () => {
    const els = clean('panel "A"\n  stat "Big" bold\n  b: box "B" bold');
    expect(byId(els, /ul\d+$/).length).toBe(1);
    expect(byId(els, /_b$/)[0].strokeWidth).toBe(5);
  });
  it('bar scales to the largest value in the panel', () => {
    const els = clean('panel "A"\n  bar "One" 1\n  bar "Four" 4');
    const [a, b] = byId(els, /bar\d+$/);
    expect(b.width).toBeGreaterThan(a.width * 3.5);
    fails('panel "A"\n  bar "x"', /bar "label" N/);
  });
  it('grid lays boxes in N columns and in R x C', () => {
    const xs = (g) => {
      const els = clean('panel "A"\n  grid ' + g + '\n  a: box "A"\n  b: box "B"\n  c: box "C"\n  d: box "D"');
      return ['a', 'b', 'c', 'd'].map((k) => byId(els, new RegExp('_' + k + '$'))[0].x);
    };
    [xs('2 cols'), xs('2 x 2')].forEach((x) => { expect(x[0]).toBe(x[2]); expect(x[1]).toBeGreaterThan(x[0]); });
    fails('panel "A"\n  grid 9\n  a: box "A"', /grid needs/);
  });
  it('bubbles wrap: 2 panels per row, and 3 panels fit one row at 10 pt', () => {
    const two = clean('strip 2 cols\npanel "A"\n  m: figure\n  m says "hello there, long long long line to wrap"\npanel "B"\n  x: box "X"');
    expect(byId(two, /_m_says$/)[0].width).toBeLessThan(256);
    const three = clean('strip 3 cols\n' + [1, 2, 3].map((i) => 'panel "' + i + '"\n  m: figure\n  m says "hi"').join('\n'));
    const ys = byId(three, /frame$/).map((f) => f.y);
    expect(new Set(ys).size).toBe(1);
    const four = clean('strip 3 cols\n' + [1, 2, 3, 4].map((i) => 'panel "' + i + '"\n  m: figure').join('\n'));
    expect(new Set(byId(four, /frame$/).map((f) => f.y)).size).toBe(2);
    expect(() => parseSketch('strip 4 cols\npanel "A"\n  m: figure', 't.c2m')).toThrow(/strip needs a column count from 1 to 3/);
  });
  it('same repeats a box at the same place and size with a new label', () => {
    const els = clean('strip 2 cols\npanel "A"\n  b: box "run\\nning"\n  m: figure\n  m says "go"\npanel "B"\n  b: same "Cancelled"');
    const [a, b] = [byId(els, /^p1_b$/)[0], byId(els, /^p2_b$/)[0]];
    const f1 = byId(els, /^p1_frame$/)[0], f2 = byId(els, /^p2_frame$/)[0];
    expect([b.x - f2.x, b.y - f2.y, b.width, b.height]).toEqual([a.x - f1.x, a.y - f1.y, a.width, a.height]);
    expect(els.find((e) => e.type === 'text' && e.containerId === b.id).text).toBe('Cancelled');
    // same before any box of that id is just its first declaration
    const first = clean('panel "A"\n  a: box "A"\n  b: same "X" bold\n  a -> b "go"');
    expect(byId(first, /^p1_b$/)[0].type).toBe('rectangle');
  });
  it('small draws 12 px text, never below 8 pt at page width', () => {
    const els = clean('panel "A"\n  note "tiny" small\n  stat "normal"');
    const sizes = els.filter((e) => e.type === 'text' && /tiny|normal/.test(e.text)).map((e) => e.fontSize).sort();
    expect(sizes).toEqual([12, 16]);
    expect(12 * 468 / 520).toBeGreaterThanOrEqual(8);
  });
  it('a line starting with ~ is small inside a normal box', () => {
    const els = clean('panel "A"\n  b: box "Big\\n~ (skipped)"');
    const fs = (t) => els.find((e) => e.type === 'text' && e.text.includes(t)).fontSize;
    expect([fs('Big'), fs('skipped')]).toEqual([16, 12]);
  });
  it('check and cross marks are strokes, not glyphs, and lint does not call them arrows', () => {
    const els = clean('panel "A"\n  b: box "✓ Passed\\n✗ Failed"');
    expect(texts(els)).not.toMatch(/[✓✗]/);
    expect(byId(els, /mark\d+$/).length).toBe(3);
    fails('panel "A"\n  b: box "Passed ✓"', /must start a line/);
    fails('panel "A"\n  stat "x" \n  m: figure "a ✓"', /cannot go in/);
  });
  it('a top slot puts a box on a row above the figures', () => {
    const els = clean('panel "A"\n  b: box "Build" @top-right\n  m: figure @left "Me"\n  m says "hi"');
    const box = byId(els, /_b$/)[0], bub = byId(els, /_m_says$/)[0], frame = byId(els, /frame$/)[0];
    expect(box.y + box.height).toBeLessThan(bub.y);
    expect(box.x + box.width).toBeGreaterThan(frame.x + 200);
    fails('panel "A"\n  b: box "x" @top\n  b2: box "y" @top\n', /same top slot/);
  });
  it('long box labels wrap instead of stretching the box', () => {
    const els = clean('panel "A"\n  b: box "Not allowed: this label is long and wraps"');
    expect(byId(els, /_b$/)[0].width).toBeLessThan(256 - 24);
  });
  it('the two example comics render clean under lint', () => {
    ['c1-not-allowed.c2m', 'c2-only-error.c2m'].forEach((f) => clean(readFileSync(path.join(dir, f), 'utf8')));
  });
  it('a panel grows to fit its widest box, so its frame never cuts a box', () => {
    // long labels wrap to the panel first; the frame never cuts a box
    const els = clean('strip 3 cols\n' + [1, 2, 3].map((i) => 'panel "' + i + '"\n  a: box "Stays on: evicted after 70 to 140 s idle" bold\n  b: box "Cold start: none"').join('\n'));
    const f = byId(els, /^p1_frame$/)[0], a = byId(els, /^p1_a$/)[0];
    expect(a.x).toBeGreaterThan(f.x);
    expect(a.x + a.width).toBeLessThan(f.x + f.width);
    // a label that cannot wrap makes the panel wider instead
    const wide = clean('strip 2 cols\npanel "1"\n  a: box "idFromName(hub).get(x)"\npanel "2"\n  b: box "y"');
    const f1 = byId(wide, /^p1_frame$/)[0], f2 = byId(wide, /^p2_frame$/)[0], w = byId(wide, /^p1_a$/)[0];
    expect(f1.width).toBeGreaterThan(256);
    expect(w.x).toBeGreaterThan(f1.x);
    expect(w.x + w.width).toBeLessThan(f2.x);
  });
  it('arrows join boxes in different panels, written in a panel or at the top level', () => {
    const els = clean('strip 2 cols\npanel "In"\n  e: box "emu"\n  r: box "router"\npanel "Out"\n  g: box "gateway"\n  r -> g "dials out"\ne -> g');
    const arrows = els.filter((x) => x.type === 'arrow').map((x) => x.id);
    expect(arrows).toEqual(expect.arrayContaining(['p1_r_to_p2_g', 'p1_e_to_p2_g']));
    fails('strip 2 cols\npanel "A"\n  h: box "hub"\npanel "B"\n  h: box "hub"\n  x: box "x"\npanel "C"\n  y: box "y"\n  y -> h', /declared in panels 1, 2/);
    fails('panel "A"\n  a: box "A"\n  a -> zz', /"zz" is not a box or figure in any panel/);
  });
  it('a bubble on an @top box says how to rewrite it', () => {
    fails('panel "A"\n  hub: box "hub" @top-left\n  hub says "hi"', /drop the slot.*hub: box "hub"/);
  });
});
