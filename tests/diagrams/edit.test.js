// @vitest-environment node
// Feature 2 through its seam: editLink, against an in-memory backend. Every
// assertion reads the newly uploaded scene back as Mermaid.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { editLink, loadScene, saveScene, sceneToMermaid } from '../../src/diagrams/index.js';
import { createFakeBackend } from './fake-backend.js';
import { parseMermaid } from './mermaid-semantics.js';

const sceneDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures-diagrams');
const readScene = (name) => JSON.parse(fs.readFileSync(path.join(sceneDir, name + '.excalidraw'), 'utf8'));

async function run(sceneName, ops) {
  const backend = createFakeBackend();
  const original = readScene(sceneName);
  const url = await saveScene(original, { fetch: backend.fetch });
  const result = await editLink(url, ops, { fetch: backend.fetch });
  const after = await loadScene(result.url, { fetch: backend.fetch });
  return { backend, original, url, result, after, mermaid: parseMermaid(sceneToMermaid(after).text) };
}

// Everything except the listed element ids must be exactly as it was.
function expectUntouched(original, after, touched) {
  const byId = new Map(after.elements.map((e) => [e.id, e]));
  original.elements.filter((e) => !touched.includes(e.id)).forEach((e) => {
    expect(byId.get(e.id), e.id).toEqual(e);
  });
}

describe('editLink', () => {
  it('prints exactly one new link and leaves the old one working', async () => {
    const { backend, url, result, original } = await run('01-bound-arrows', [{ op: 'rename', node: 'auth', label: 'Identity' }]);
    expect(result.url).toMatch(/^https:\/\/excalidraw\.com\/#json=fake\d+,[A-Za-z0-9_-]+$/);
    expect(result.url).not.toBe(url);
    expect(await loadScene(url, { fetch: backend.fetch })).toEqual({ ...original, files: {} });
  });

  it('rename keeps styling and grows the box to fit', async () => {
    const label = 'Identity and access management service';
    const { mermaid, after, original } = await run('01-bound-arrows', [{ op: 'rename', node: 'auth', label }]);
    expect(mermaid.nodes).toContain(`auth|${label}|rect`);
    const box = after.elements.find((e) => e.id === 'auth');
    const text = after.elements.find((e) => e.id === 'auth_label');
    expect(text.width).toBeGreaterThanOrEqual(label.length * 0.68 * 20);
    expect(box.width).toBeGreaterThanOrEqual(text.width);
    expect(text.x).toBeGreaterThanOrEqual(box.x);
    expect(text.x + text.width).toBeLessThanOrEqual(box.x + box.width);
    expect(box.strokeColor).toBe(original.elements.find((e) => e.id === 'auth').strokeColor);
    expectUntouched(original, after, ['auth', 'auth_label']);
  });

  it('add places a styled box next to the anchor without overlapping', async () => {
    const { mermaid, after, original } = await run('01-bound-arrows', [{ op: 'add', id: 'audit', label: 'Audit log', near: 'auth', side: 'right' }]);
    expect(mermaid.nodes).toContain('audit|Audit log|rect');
    const added = after.elements.find((e) => e.id === 'audit');
    const ledger = after.elements.find((e) => e.id === 'ledger');
    const overlap = added.x < ledger.x + ledger.width && ledger.x < added.x + added.width &&
      added.y < ledger.y + ledger.height && ledger.y < added.y + added.height;
    expect(overlap).toBe(false);
    expectUntouched(original, after, []);
  });

  it('add next to a node inside a group lands in that group, which grows', async () => {
    const { mermaid, after, original } = await run('03-nested-groups', [{ op: 'add', id: 'dedupe', label: 'Deduplicator', near: 'parser', side: 'right' }]);
    expect(mermaid.members).toContain('dedupe in ingest');
    const before = original.elements.find((e) => e.id === 'ingest');
    const grown = after.elements.find((e) => e.id === 'ingest');
    expect(grown.width).toBeGreaterThan(before.width);
    expectUntouched(original, after, ['ingest', 'platform']);
  });

  it('connect draws a bound, labelled, dashed arrow', async () => {
    const { mermaid, after, original } = await run('01-bound-arrows', [{ op: 'connect', from: 'ledger', to: 'gateway', label: 'replays', dashed: true }]);
    expect(mermaid.edges).toContain('ledger -.-> gateway : replays');
    const arrow = after.elements.find((e) => e.type === 'arrow' && e.startBinding && e.startBinding.elementId === 'ledger');
    expect(arrow.endBinding.elementId).toBe('gateway');
    expect(after.elements.find((e) => e.id === 'ledger').boundElements).toContainEqual({ type: 'arrow', id: arrow.id });
    expect(after.elements.find((e) => e.id === 'gateway').boundElements).toContainEqual({ type: 'arrow', id: arrow.id });
    expectUntouched(original, after, ['ledger', 'gateway']);
  });

  it('disconnect removes the arrow and its label, bound or free', async () => {
    const bound = await run('01-bound-arrows', [{ op: 'disconnect', from: 'auth', to: 'ledger' }]);
    expect(bound.mermaid.edges).toEqual(['gateway --> auth : verifies']);
    expect(bound.after.elements.find((e) => e.id === 'a2_label')).toBeUndefined();
    const free = await run('02-unbound-arrows', [{ op: 'disconnect', from: 'intake', to: 'triage' }]);
    expect(free.mermaid.edges).toEqual(['triage --> archive : after 30 days']);
    expect(free.after.elements.find((e) => e.id === 'u1_note')).toBeUndefined();
  });

  it('relabel-edge changes the label the reader sees', async () => {
    const { mermaid } = await run('02-unbound-arrows', [{ op: 'relabel-edge', from: 'triage', to: 'archive', label: 'after 90 days' }]);
    expect(mermaid.edges).toContain('triage --> archive : after 90 days');
  });

  it('remove deletes the node, its label, its arrows and their labels', async () => {
    const { mermaid, after } = await run('01-bound-arrows', [{ op: 'remove', node: 'auth' }]);
    expect(mermaid.nodes).toEqual(['gateway|API gateway|rect', 'ledger|Ledger DB|rect']);
    expect(mermaid.edges).toEqual([]);
    const ids = after.elements.map((e) => e.id);
    ['auth', 'auth_label', 'a1', 'a1_label', 'a2', 'a2_label'].forEach((id) => expect(ids).not.toContain(id));
    const dangling = after.elements.filter((e) => JSON.stringify([e.boundElements, e.startBinding, e.endBinding, e.containerId]).includes('"a1"') || JSON.stringify(e).includes('"auth"'));
    expect(dangling).toEqual([]);
  });

  it('applies several ops in order, later ops seeing earlier ones', async () => {
    const { mermaid } = await run('01-bound-arrows', [
      { op: 'add', id: 'audit', label: 'Audit log', near: 'ledger' },
      { op: 'connect', from: 'ledger', to: 'audit', label: 'streams' },
    ]);
    expect(mermaid.edges).toContain('ledger --> audit : streams');
  });

  it('rejects a bad reference before uploading anything, listing valid ids', async () => {
    const backend = createFakeBackend();
    const url = await saveScene(readScene('01-bound-arrows'), { fetch: backend.fetch });
    backend.requests.length = 0;
    await expect(editLink(url, [
      { op: 'rename', node: 'auth', label: 'fine' },
      { op: 'connect', from: 'gateway', to: 'ledgr' },
    ], { fetch: backend.fetch })).rejects.toThrow(/unknown node or subgraph "ledgr".*valid ids: auth, gateway, ledger/);
    expect(backend.requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('rejects a duplicate id on add', async () => {
    await expect(run('01-bound-arrows', [{ op: 'add', id: 'auth', label: 'x', near: 'gateway' }])).rejects.toThrow(/already exists/);
  });
});
