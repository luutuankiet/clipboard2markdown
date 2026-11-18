// @vitest-environment node
// Scene lint (src/lint.js) and its CLI surface: --strict and `c2m lint`.
// Fixtures live in tests/fixtures-lint/: old-mermaid-faults.scene.json is what
// Mermaid input produced before 0.8.0 (frame too narrow, literal <br>, diamond
// too small); audited-too-wide.scene.json is a real diagram that prints at 6 pt.
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { lintScene } from '../../src/lint.js';
import { runExcalidraw } from '../../bin/excalidraw.js';
import { buildSkeleton } from '../../src/diagrams/skeleton.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures-lint');
const fx = (n) => path.join(dir, n);
const load = (n) => JSON.parse(readFileSync(fx(n), 'utf8'));

const run = async (argv) => {
  const out = [], err = [];
  const io = { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } };
  const code = await runExcalidraw(argv, io);
  return { code, stdout: out.join(''), stderr: err.join('') };
};

describe('lintScene', () => {
  it('finds a frame too narrow, a literal <br> and a too-small diamond', () => {
    const { findings } = lintScene(load('old-mermaid-faults.scene.json'));
    expect(findings.map((f) => f.cls).sort()).toEqual(['a', 'c', 'e']);
    expect(findings.every((f) => f.level === 'error')).toBe(true);
    expect(findings.find((f) => f.cls === 'a').message).toMatch(/sticks out of frame "Warehouse" by 117 px/);
  });

  it('flags text under 8 pt at page width, and --page-pt moves the line', () => {
    const scene = load('audited-too-wide.scene.json');
    const f = lintScene(scene).findings;
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ cls: 'f', level: 'error' });
    expect(lintScene(scene, { pagePt: 1000 }).findings).toEqual([]);
  });

  it('flags overlapping nodes but not full nesting', () => {
    const overlap = buildSkeleton(load('overlap.json')).scene;
    expect(lintScene(overlap).findings.map((f) => f.cls)).toEqual(['b']);
    const nested = buildSkeleton([
      { id: 'out', type: 'rectangle', x: 0, y: 0, width: 400, height: 300, label: 'Group' },
      { id: 'in', type: 'rectangle', x: 60, y: 80, width: 200, height: 80, label: 'Inner' },
    ]).scene;
    expect(lintScene(nested).findings).toEqual([]);
  });

  it('flags a node straddling a frame', () => {
    const scene = buildSkeleton([
      { id: 'out', type: 'rectangle', x: 0, y: 0, width: 400, height: 300, label: 'Group' },
      { id: 'in', type: 'rectangle', x: 60, y: 80, width: 200, height: 80, label: 'Inner' },
      { id: 'half', type: 'rectangle', x: 300, y: 200, width: 200, height: 80, label: 'Half' },
    ]).scene;
    expect(lintScene(scene).findings.some((f) => f.cls === 'a' && /straddles/.test(f.message))).toBe(true);
  });

  it('flags unbound arrows floating in empty space', () => {
    const f = lintScene(load('loose-arrow.json')).findings;
    expect(f).toHaveLength(2);
    expect(f.every((x) => x.cls === 'd' && x.level === 'error')).toBe(true);
  });

  it('flags text wider than its box', () => {
    const scene = buildSkeleton([
      { id: 'svc', type: 'rectangle', x: 0, y: 0, width: 80, height: 60, label: 'A very long service name' },
    ]).scene;
    expect(lintScene(scene).findings.map((f) => f.cls)).toContain('e');
  });

  it('a well-formed bound diagram has no findings', () => {
    const scene = buildSkeleton([
      { id: 'a', type: 'rectangle', x: 0, y: 0, width: 160, height: 70, label: 'API' },
      { id: 'b', type: 'rectangle', x: 300, y: 0, width: 160, height: 70, label: 'DB' },
      { id: 'ab', type: 'arrow', start: { id: 'a' }, end: { id: 'b' } },
    ]).scene;
    expect(lintScene(scene).findings).toEqual([]);
  });
});

describe('colour budget (g)', () => {
  const boxes = (colours) => colours.map((c, i) => ({ id: 'n' + i, type: 'rectangle', x: i * 260, y: 0, width: 200, height: 70, label: 'N' + i, backgroundColor: c }));
  const g = (colours) => lintScene(buildSkeleton(boxes(colours)).scene).findings.filter((f) => f.cls === 'g');

  it('warns on more than 3 filled shapes, or more than 2 colours', () => {
    const four = g(['#a5d8ff', '#a5d8ff', '#a5d8ff', '#a5d8ff']);
    expect(four).toHaveLength(1);
    expect(four[0]).toMatchObject({ level: 'warn' });
    expect(four[0].message).toBe('4 filled shapes in 1 colours; keep everything white and colour only the 1 to 3 that carry the point');
    expect(g(['#a5d8ff', '#b2f2bb', '#ffec99'])[0].message).toMatch(/^3 filled shapes in 3 colours/);
  });

  it('treats transparent, white and greys as neutral, and allows up to 3 filled shapes in 2 colours', () => {
    expect(g(['transparent', '#ffffff', 'white', '#f1f3f5', '#868e96'])).toEqual([]);
    expect(g(['#a5d8ff', '#a5d8ff', '#b2f2bb'])).toEqual([]);
  });

  it('does not count a frame that contains other shapes', () => {
    const els = [{ id: 'f', type: 'rectangle', x: -40, y: -80, width: 900, height: 300, label: 'Group', backgroundColor: '#a5d8ff' }, ...boxes(['#b2f2bb', '#b2f2bb', '#b2f2bb'])];
    expect(lintScene(buildSkeleton(els).scene).findings.filter((f) => f.cls === 'g')).toEqual([]);
  });

  it('new shapes default to no fill, and Mermaid shapes to white', async () => {
    const { scene } = buildSkeleton([{ id: 'a', type: 'rectangle', x: 0, y: 0, width: 160, height: 70, label: 'A' }]);
    expect(scene.elements.find((e) => e.id === 'a').backgroundColor).toBe('transparent');
    const { mermaidToScene } = await import('../../src/mermaid-input.js');
    const r = await mermaidToScene('flowchart TD\n  a[A] --> b{B}');
    r.scene.elements.filter((e) => ['rectangle', 'diamond', 'ellipse'].includes(e.type)).forEach((e) => expect(e.backgroundColor).toBe('#ffffff'));
  }, 60000);
});

describe('arrow ends on diamond and ellipse outlines', () => {
  it('a diagonal arrow leaves a diamond on its slanted side, not at the box corner', () => {
    const { scene } = buildSkeleton([
      { id: 'd', type: 'diamond', x: 0, y: 0, width: 240, height: 120, label: 'Ok?' },
      { id: 'r', type: 'rectangle', x: 400, y: 300, width: 160, height: 70, label: 'Next' },
      { id: 'ar', type: 'arrow', start: { id: 'd' }, end: { id: 'r' } },
    ]);
    const a = scene.elements.find((e) => e.id === 'ar');
    const dx = Math.abs(a.x - 120) / 120, dy = Math.abs(a.y - 60) / 60;
    expect(dx + dy).toBeGreaterThan(0.95);
    expect(dx + dy).toBeLessThan(1.15); // on the outline plus the binding gap; the box corner would give about 2
    expect(lintScene(scene).findings).toEqual([]);
  });

  it('an arrow meets an ellipse on its curve', () => {
    const { scene } = buildSkeleton([
      { id: 'e', type: 'ellipse', x: 0, y: 0, width: 200, height: 100, label: 'DB' },
      { id: 'r', type: 'rectangle', x: 400, y: 300, width: 160, height: 70, label: 'Next' },
      { id: 'ar', type: 'arrow', start: { id: 'e' }, end: { id: 'r' } },
    ]);
    const a = scene.elements.find((e) => e.id === 'ar');
    const k = Math.hypot((a.x - 100) / 100, (a.y - 50) / 50);
    expect(k).toBeGreaterThan(0.95);
    expect(k).toBeLessThan(1.15);
  });
});

describe('--strict and c2m lint', () => {
  it('non-strict prints findings as warnings and still exits 0', async () => {
    const r = await run([fx('fan-out.mmd'), '--no-upload']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/warning: lint f \(error\)/);
  }, 60000);

  it('--strict on a bad .mmd exits 1, prints the findings, writes nothing', async () => {
    const out = mkdtempSync(path.join(tmpdir(), 'c2m-strict-'));
    const r = await run(['--strict', '--png', out, fx('fan-out.mmd')]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/--strict: lint found errors/);
    expect(r.stderr).toMatch(/lint f \(error\)/);
    expect(r.stdout).toBe('');
    expect(existsSync(path.join(out, 'fan-out.png'))).toBe(false);
  }, 60000);

  it('--strict on a bad JSON element array exits 1 with no link', async () => {
    const r = await run(['--strict', fx('overlap.json')]);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/lint b \(error\)/);
  });

  it('--strict on a good .mmd exits 0 (the br, subgraph and diamond case, once faulty)', async () => {
    const r = await run(['--strict', '--no-upload', fx('subgraph-br-diamond.mmd')]);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
  }, 60000);

  it('c2m lint (--lint-only) reports per file and exits 1 if any has an error', async () => {
    const r = await run(['--lint-only', fx('subgraph-br-diamond.mmd'), fx('audited-too-wide.scene.json')]);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/subgraph-br-diamond\.mmd: .*0 findings/);
    expect(r.stdout).toMatch(/audited-too-wide\.scene\.json: .*1 finding/);
    expect(r.stdout).toMatch(/lint f \(error\)/);
  }, 60000);

  it('--page-pt changes the font-size check', async () => {
    const r = await run(['--lint-only', '--page-pt', '1000', fx('audited-too-wide.scene.json')]);
    expect(r.code).toBe(0);
  });
});
