// @vitest-environment node
// Compact comic format (src/sketch.js): parse errors carry the line number and
// a fix hint, the layout is clean under lint, and the CLI takes .c2m files.
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSketch, sketchToSkeleton } from '../../src/sketch.js';
import { buildSkeleton } from '../../src/diagrams/skeleton.js';
import { lintScene } from '../../src/lint.js';
import { runExcalidraw } from '../../bin/excalidraw.js';

// The PNG renderer must not reach the network; only data: URLs (font wasm) pass.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const s = String(url && url.url ? url.url : url);
  if (s.startsWith('data:')) return realFetch(url, init);
  return Promise.reject(new Error('network disabled in tests: ' + s));
};

const sample = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures-sketch', 'comic.c2m');
const text = readFileSync(sample, 'utf8');

const run = async (argv) => {
  const out = [], err = [];
  const io = { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } };
  const code = await runExcalidraw(argv, io);
  return { code, stdout: out.join(''), stderr: err.join('') };
};
const fails = (src, re) => {
  let msg = '';
  try { parseSketch(src, 't.c2m'); sketchToSkeleton(src, 't.c2m'); } catch (e) { msg = e.message; }
  expect(msg).toMatch(re);
  expect(msg).toMatch(/fix: /);
};

describe('parseSketch errors', () => {
  it('names the file and line of an unreadable statement', () => {
    fails('panel "A"\n  me: figure\n  gibberish here', /^t\.c2m:3: /);
  });
  it('rejects an unquoted bubble text', () => {
    fails('panel "A"\n  me: figure\n  me says hello', /t\.c2m:3: .*quoted/);
  });
  it('rejects an empty panel', () => {
    fails('panel "A"\npanel "B"\n  x: box "X"', /t\.c2m:1: .*no statements/);
  });
  it('rejects a bubble for an undeclared figure', () => {
    fails('panel "A"\n  ghost says "boo"', /t\.c2m:2: .*not a figure/);
  });
  it('rejects an arrow with no boxes', () => {
    fails('panel "A"\n  a -> b', /t\.c2m:2: /);
  });
  it('rejects an unknown kind', () => {
    fails('panel "A"\n  x: blob "X"', /t\.c2m:2: .*unknown kind/);
  });
  it('rejects a duplicate id and a second bubble', () => {
    fails('panel "A"\n  x: box "X"\n  x: box "Y"', /t\.c2m:3: .*twice/);
    fails('panel "A"\n  m: figure\n  m says "a"\n  m says "b"', /t\.c2m:4: .*already has a bubble/);
  });
  it('rejects an empty file', () => {
    fails('# only a comment\n', /nothing to draw/);
  });
});

describe('sample comic', () => {
  it('lays out cleanly: no lint findings, no builder warnings', () => {
    const els = sketchToSkeleton(text, 'comic.c2m');
    const built = buildSkeleton(els);
    expect(built.warnings).toEqual([]);
    const { findings } = lintScene(built.scene);
    expect(findings).toEqual([]);
  });
  it('is far shorter than the JSON it replaces', () => {
    const json = JSON.stringify(sketchToSkeleton(text, 'comic.c2m'));
    expect(text.length).toBeLessThan(1000);
    expect(json.length).toBeGreaterThan(text.length * 5);
  });
  it('is the same scene however many times it runs', () => {
    expect(JSON.stringify(sketchToSkeleton(text, 'a.c2m'))).toBe(JSON.stringify(sketchToSkeleton(text, 'a.c2m')));
  });
});

describe('c2m excalidraw <file>.c2m', () => {
  it('--strict --no-upload exits 0 with a mermaid preview and no warnings', async () => {
    const r = await run(['--strict', '--no-upload', sample]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('```mermaid');
    expect(r.stdout).not.toMatch(/^warning:/m);
  }, 240000);
  it('--png writes comic.png', async () => {
    const out = mkdtempSync(path.join(tmpdir(), 'c2m-sketch-'));
    const r = await run(['--strict', '--no-upload', '--png', out, sample]);
    expect(r.code).toBe(0);
    expect(existsSync(path.join(out, 'comic.png'))).toBe(true);
  }, 240000);
  it('a parse error exits 1 with the line number', async () => {
    const bad = path.join(mkdtempSync(path.join(tmpdir(), 'c2m-sketch-')), 'bad.c2m');
    (await import('fs')).writeFileSync(bad, 'panel "A"\n  me says hi\n');
    const r = await run(['--no-upload', bad]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('bad.c2m:2');
  }, 240000);
});
