import { describe, it, expect } from 'vitest';
import { buildSkeleton } from '../../src/diagrams/skeleton.js';
import { runExcalidraw } from '../../bin/excalidraw.js';

const box = (id, x, y, extra) => Object.assign({ id, type: 'rectangle', x, y, width: 160, height: 70, label: { text: id } }, extra);
const byId = (scene) => Object.fromEntries(scene.elements.map((e) => [e.id, e]));

describe('c2m excalidraw skeleton', () => {
  it('turns a label into bound text centred in its container', () => {
    const { scene, warnings } = buildSkeleton([box('api', 0, 0)]);
    const els = byId(scene);
    expect(els['api-label']).toMatchObject({ type: 'text', text: 'api', containerId: 'api' });
    expect(els.api.boundElements).toEqual([{ id: 'api-label', type: 'text' }]);
    const t = els['api-label'];
    expect(t.x + t.width / 2).toBeCloseTo(80);
    expect(t.y + t.height / 2).toBeCloseTo(35);
    expect(warnings).toEqual([]);
  });

  it('binds arrows both ways, short and MCP-style alike', () => {
    const { scene, warnings } = buildSkeleton([
      box('a', 0, 0), box('b', 400, 0),
      { id: 'e1', type: 'arrow', start: { id: 'a' }, end: { id: 'b' } },
      { id: 'e2', type: 'arrow', startBinding: { elementId: 'b' }, endBinding: { elementId: 'a', focus: 0, gap: 1 } },
    ]);
    const els = byId(scene);
    expect(els.e1.startBinding.elementId).toBe('a');
    expect(els.e1.endBinding.elementId).toBe('b');
    expect(els.e2.startBinding.elementId).toBe('b');
    expect(els.a.boundElements.map((b) => b.id)).toEqual(expect.arrayContaining(['e1', 'e2']));
    expect(els.e1).not.toHaveProperty('start');
    expect(els.e1.points[1][0]).toBeGreaterThan(200); // routed between the two boxes
    expect(warnings).toEqual([]);
  });

  it('previews nodes by shape, edges with labels, and free text as notes', () => {
    const { preview } = buildSkeleton([
      box('api', 0, 0), box('db', 400, 0, { type: 'ellipse', width: 200, height: 100 }),
      box('ok', 400, 300, { type: 'diamond', width: 200, height: 140 }),
      { id: 'r', type: 'arrow', start: { id: 'api' }, end: { id: 'db' }, label: { text: 'reads' } },
      { id: 'n', type: 'text', x: 0, y: 200, text: 'hello' },
    ]);
    expect(preview).toContain('api[api]');
    expect(preview).toContain('db((db))');
    expect(preview).toContain('ok{ok}');
    expect(preview).toContain('api -->|reads| db');
    expect(preview).toContain('%% note: hello');
  });

  it('warns about overlap, oversized labels, loose arrows, duplicates and MCP commands', () => {
    const { warnings } = buildSkeleton([
      box('a', 0, 0), box('b', 100, 20),
      box('tiny', 0, 300, { width: 40, height: 30, label: { text: 'a very long label' } }),
      { id: 'x', type: 'arrow', x: 0, y: 500, end: { id: 'ghost' } },
      box('a', 900, 900),
      { type: 'cameraUpdate', width: 800, height: 600 },
    ]);
    const text = warnings.join('\n');
    expect(text).toMatch(/"a" and "b" overlap/);
    expect(text).toMatch(/label of "tiny" does not fit/);
    expect(text).toMatch(/arrow "x" start is not attached/);
    expect(text).toMatch(/end points at "ghost"/);
    expect(text).toMatch(/duplicate id "a"/);
    expect(text).toMatch(/dropped .*cameraUpdate/);
  });

  it('stays quiet when a group box fully contains its members', () => {
    const { warnings } = buildSkeleton([
      { id: 'grp', type: 'rectangle', x: -40, y: -40, width: 700, height: 200, label: { text: 'group' } },
      box('a', 0, 0), box('b', 400, 0),
      { id: 'e', type: 'arrow', start: { id: 'a' }, end: { id: 'b' } },
    ]);
    expect(warnings).toEqual([]);
  });

  it('rejects input that is not an element array, without printing a link', async () => {
    const out = [], err = [];
    const io = { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } };
    expect(() => buildSkeleton({ nope: 1 })).toThrow(/JSON array/);
    expect(await runExcalidraw(['/does/not/exist.json'], io)).toBe(1);
    expect(out).toEqual([]);
    expect(err.join('')).toMatch(/cannot read/);
  });
});
