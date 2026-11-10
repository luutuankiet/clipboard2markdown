// @vitest-environment node
// c2m excalidraw --png: the real renderer (vendored excalidraw bundle, jsdom,
// resvg) end to end. Needs vendor/excalidraw/, which `npm install` builds.
// Regenerate the reference image with UPDATE_PNG_FIXTURES=1 npx vitest run tests/diagrams/png.test.js
// and look at it before committing: the label must be in Excalifont.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { runExcalidraw } from '../../bin/excalidraw.js';
import { createFakeBackend } from './fake-backend.js';
import { decodePng, meanDiff, pngSize } from './png-decode.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REFERENCE = path.join(root, 'tests/fixtures-png/excalifont-label.review.png');
const HOUR = 3600 * 1000;

// Any request the renderer makes is recorded; only data: URLs (the font
// subsetter's wasm) are allowed through.
const requests = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const s = String(url && url.url ? url.url : url);
  if (s.startsWith('data:')) return realFetch(url, init);
  requests.push(s);
  return Promise.reject(new Error('network disabled in tests: ' + s));
};

let tmp;
const write = (name, value) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, JSON.stringify(value));
  return p;
};
const run = async (argv, extra = {}) => {
  const out = [], err = [];
  const io = { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, ...extra };
  const code = await runExcalidraw(argv, io);
  return { code, stdout: out.join(''), stderr: err.join('') };
};

const twoBoxes = [
  { id: 'api', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: 'API gateway' }, backgroundColor: '#a5d8ff' },
  { id: 'db', type: 'rectangle', x: 400, y: 0, width: 200, height: 80, label: { text: 'Postgres' } },
  { id: 'e', type: 'arrow', start: { id: 'api' }, end: { id: 'db' }, label: { text: 'reads' } },
];

describe('c2m excalidraw --png', { timeout: 60000 }, () => {
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c2m-png-'));
  });

  it('writes a scale-3 PNG and a review PNG per scene, and prints the ready block', async () => {
    const backend = createFakeBackend();
    const a = write('flow.json', twoBoxes);
    const b = write('single.json', [twoBoxes[0]]);
    const out = path.join(tmp, 'named');
    const r = await run(['--png', out, '--review', a, b], { fetch: backend.fetch });
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);

    for (const name of ['flow', 'single']) {
      const doc = pngSize(fs.readFileSync(path.join(out, name + '.png')));
      const review = pngSize(fs.readFileSync(path.join(out, name + '.review.png')));
      expect(doc.width * doc.height).toBeLessThanOrEqual(25000000);
      expect(Math.max(review.width, review.height)).toBeLessThanOrEqual(1000);
      // Scale 3 and the review copy keep the drawing's aspect ratio.
      expect(doc.width / review.width).toBeGreaterThan(1.4);
      expect(doc.width / doc.height).toBeCloseTo(review.width / review.height, 1);
    }
    // flow: 600 px of shapes plus excalidraw's 10 px export padding each side, times 3.
    expect(pngSize(fs.readFileSync(path.join(out, 'flow.png'))).width).toBe(1860);

    const abs = path.resolve(out, 'flow.png');
    expect(r.stdout).toContain('![flow](attach:flow)\nEdit: https://excalidraw.com/#json=fake0001,');
    expect(r.stdout).toContain('"flow": "@file64:' + abs + '"\nreview: ' + path.resolve(out, 'flow.review.png') + '\n');
    expect(r.stdout).toContain('![single](attach:single)');
    expect(backend.requests.map((q) => q.method)).toEqual(['POST', 'POST']);
    expect(requests).toEqual([]);
  });

  it('steps the scale down for a large scene to stay under 25 megapixels', async () => {
    const big = write('big.json', [
      { id: 'wide', type: 'rectangle', x: 0, y: 0, width: 4000, height: 2500, label: { text: 'big' } },
    ]);
    const out = path.join(tmp, 'big-out');
    const r = await run(['--png', out, '--no-upload', big]);
    expect(r.code).toBe(0);
    const doc = pngSize(fs.readFileSync(path.join(out, 'big.png')));
    expect(doc.width * doc.height).toBeLessThanOrEqual(25000000);
    expect(doc.width * doc.height).toBeGreaterThan(24000000);
    expect(r.stdout).toMatch(/warning: drawn at scale 1\.\d+ to stay under 25,000,000 pixels/);
    expect(r.stdout).not.toMatch(/^Edit: /m);
  });

  it('cleans only old PNGs in the cache folder, never scene JSON, subfolders or a named folder', async () => {
    const cacheHome = path.join(tmp, 'xdg');
    const renders = path.join(cacheHome, 'c2m', 'renders');
    const named = path.join(tmp, 'keep-me');
    fs.mkdirSync(path.join(renders, 'sub'), { recursive: true });
    fs.mkdirSync(named, { recursive: true });
    const old = new Date(Date.now() - 25 * HOUR);
    const files = {
      stale: path.join(renders, 'stale.png'),
      fresh: path.join(renders, 'fresh.png'),
      scene: path.join(renders, 'stale-scene.json'),
      namedOld: path.join(named, 'old.png'),
    };
    for (const p of Object.values(files)) fs.writeFileSync(p, 'x');
    fs.utimesSync(files.stale, old, old);
    fs.utimesSync(files.scene, old, old);
    fs.utimesSync(files.namedOld, old, old);
    fs.utimesSync(path.join(renders, 'sub'), old, old);
    fs.utimesSync(files.fresh, new Date(Date.now() - 23 * HOUR), new Date(Date.now() - 23 * HOUR));

    const input = write('cached.json', [twoBoxes[0]]);
    const env = { XDG_CACHE_HOME: cacheHome, HOME: tmp };

    // A named folder: nothing is cleaned anywhere.
    let r = await run(['--png', named, '--no-upload', input], { env });
    expect(r.code).toBe(0);
    expect(fs.existsSync(files.namedOld)).toBe(true);
    expect(fs.existsSync(files.stale)).toBe(true);

    // The default folder: old renders go, the rest stays.
    r = await run(['--png', '--no-upload', input], { env });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('"cached": "@file64:' + path.join(renders, 'cached.png') + '"');
    expect(fs.existsSync(files.stale)).toBe(false);
    expect(fs.existsSync(files.fresh)).toBe(true);
    expect(fs.existsSync(files.scene)).toBe(true);
    expect(fs.existsSync(path.join(renders, 'sub'))).toBe(true);
    expect(fs.existsSync(files.namedOld)).toBe(true);
    expect(fs.existsSync(input)).toBe(true);
    expect(fs.existsSync(path.join(renders, 'cached.review.png'))).toBe(false);
  });

  it('draws labels in Excalifont, not a fallback font', async () => {
    // A committed scene with fixed seeds: the hand-drawn strokes are seeded,
    // so a scene built fresh would never match the reference pixel for pixel.
    const input = path.join(root, 'tests/fixtures-png/excalifont-label.excalidraw');
    const out = path.join(tmp, 'font');
    const r = await run(['--png', out, '--review', '--no-upload', input]);
    expect(r.code).toBe(0);
    const got = fs.readFileSync(path.join(out, 'excalifont-label.review.png'));
    if (process.env.UPDATE_PNG_FIXTURES) fs.writeFileSync(REFERENCE, got);

    // Same scene, but text drawn the way resvg does when it never gets the
    // embedded fonts: system fonts, which is the silent fallback this guards.
    const { sceneToSvg } = await import('../../src/excalidraw-png.js');
    const { Resvg } = await import('@resvg/resvg-js');
    const svg = await sceneToSvg(JSON.parse(fs.readFileSync(input, 'utf8')));
    const ref = decodePng(fs.readFileSync(REFERENCE));
    const fallback = new Resvg(svg, { fitTo: { mode: 'width', value: ref.width }, background: '#ffffff', font: { loadSystemFonts: true } }).render().asPng();

    const good = meanDiff(decodePng(got), ref);
    const bad = meanDiff(decodePng(fallback), ref);
    expect(good).toBeLessThan(0.5);
    expect(bad).toBeGreaterThan(good + 1);
  });

  it('accepts a whole scene file and warns that CJK text is not drawn', async () => {
    const { buildSkeleton } = await import('../../src/diagrams/skeleton.js');
    const scene = buildSkeleton([{ id: 'n', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: '注文 order' } }]).scene;
    const input = path.join(tmp, 'whole.excalidraw');
    fs.writeFileSync(input, JSON.stringify(scene));
    const out = path.join(tmp, 'whole-out');
    const r = await run(['--png=' + out, '--no-upload', input]);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('![whole](attach:whole)');
    expect(r.stdout).toContain('warning: CJK text is not drawn');
    expect(fs.existsSync(path.join(out, 'whole.png'))).toBe(true);
    expect(requests).toEqual([]);
  });

  it('accepts the shorthand inside a whole scene, as it does in an element array', async () => {
    const backend = createFakeBackend();
    const input = path.join(tmp, 'shorthand.excalidraw');
    fs.writeFileSync(input, JSON.stringify({ type: 'excalidraw', version: 2, elements: twoBoxes }));
    const out = path.join(tmp, 'shorthand-out');
    const r = await run(['--png', out, input], { fetch: backend.fetch });
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    // Same drawing as the array form in the first test.
    expect(pngSize(fs.readFileSync(path.join(out, 'shorthand.png'))).width).toBe(1860);

    const { loadScene } = await import('../../src/diagrams/share-link.js');
    const url = r.stdout.match(/^Edit: (https:\/\/excalidraw\.com\/\S+)$/m)[1];
    const els = (await loadScene(url, { fetch: backend.fetch })).elements;
    const arrow = els.find((e) => e.id === 'e');
    expect(arrow.points).toHaveLength(2);
    expect(arrow.startBinding.elementId).toBe('api');
    expect(arrow.endBinding.elementId).toBe('db');
    expect(els.filter((e) => e.type === 'text' && e.containerId).map((e) => e.text).sort()).toEqual(['API gateway', 'Postgres', 'reads']);
    expect(els.some((e) => 'label' in e || 'start' in e || 'end' in e)).toBe(false);
  });

  it('uploads a full Excalidraw scene unchanged', async () => {
    const backend = createFakeBackend();
    const input = path.join(root, 'tests/fixtures-diagrams/01-bound-arrows.excalidraw');
    const out = path.join(tmp, 'full-out');
    const r = await run(['--png', out, input], { fetch: backend.fetch });
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    const { loadScene } = await import('../../src/diagrams/share-link.js');
    const url = r.stdout.match(/^Edit: (https:\/\/excalidraw\.com\/\S+)$/m)[1];
    const uploaded = await loadScene(url, { fetch: backend.fetch });
    expect(uploaded.elements).toEqual(JSON.parse(fs.readFileSync(input, 'utf8')).elements);
  });

  it('prints the preview and a paste block per diagram, and writes no review PNG by default', async () => {
    const backend = createFakeBackend();
    const a = write('flow.json', twoBoxes);
    const out = path.join(tmp, 'live');
    const r = await run(['--png', out, a], { fetch: backend.fetch });
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(out, 'flow.png'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'flow.review.png'))).toBe(false);
    expect(r.stdout).toContain('```mermaid\nflowchart LR\n');
    expect(r.stdout).toContain('api -->|reads| db');
    expect(r.stdout).toContain('![flow](attach:flow)\nEdit: https://excalidraw.com/#json=fake0001,');
    expect(r.stdout).toContain('"flow": "@file64:' + path.resolve(out, 'flow.png') + '"\n');
    expect(r.stdout).not.toMatch(/review/i);
  });

  it('with --out <folder>/images/ writes the PNG there and prints a relative image line', async () => {
    const backend = createFakeBackend();
    const a = write('request-flow.json', twoBoxes);
    const images = path.join(tmp, 'work', 'images') + path.sep;
    const r = await run([a, '--out', images], { fetch: backend.fetch });
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect(fs.readdirSync(images)).toEqual(['request-flow.png']);
    expect(r.stdout).toContain('```mermaid\n');
    expect(r.stdout).toContain('![request-flow](./images/request-flow.png)\nEdit: https://excalidraw.com/#json=fake0001,');
    expect(r.stdout).not.toContain('@file64:');
    expect(r.stdout).not.toMatch(/review/i);
  });

  it('writes the review PNG only with --review', async () => {
    const a = write('asked.json', [twoBoxes[0]]);
    const out = path.join(tmp, 'asked-out');
    const r = await run(['--png', out, '--review', '--no-upload', a]);
    expect(r.code).toBe(0);
    const review = path.resolve(out, 'asked.review.png');
    expect(Math.max(...Object.values(pngSize(fs.readFileSync(review))))).toBeLessThanOrEqual(1000);
    expect(r.stdout).toContain('review: ' + review + '\n');
  });

  it('refuses two inputs with the same name before drawing anything', async () => {
    const a = write('same.json', twoBoxes);
    fs.mkdirSync(path.join(tmp, 'other'), { recursive: true });
    const b = path.join(tmp, 'other', 'same.json');
    fs.writeFileSync(b, JSON.stringify(twoBoxes));
    const out = path.join(tmp, 'dup-out');
    const r = await run(['--png', out, '--no-upload', a, b]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/both named "same"/);
    expect(fs.existsSync(out)).toBe(false);
  });
});
