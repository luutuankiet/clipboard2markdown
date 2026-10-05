// @vitest-environment node
// Runs bin/diagrams.js as a process. A directory stands in for the backend
// through the C2M_DIAGRAMS_FAKE_BACKEND test hook.
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { seededBackend, FIXTURE_KEY } from './seeded-backend.js';
import { parseMermaid } from './mermaid-semantics.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'bin', 'diagrams.js');
let backendDir;

const run = (args) => spawnSync(process.execPath, [cli, ...args], {
  encoding: 'utf8',
  env: { ...process.env, C2M_DIAGRAMS_FAKE_BACKEND: backendDir },
});
const link = (id) => `https://excalidraw.com/#json=${id},${FIXTURE_KEY}`;

describe('c2m-diagrams CLI', () => {
  beforeAll(async () => {
    backendDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2m-diagrams-'));
    const backend = await seededBackend();
    for (const [id, bytes] of backend.store) fs.writeFileSync(path.join(backendDir, id), bytes);
  });

  it('expand prints the same Markdown the page produces', () => {
    const input = path.join(root, 'tests/fixtures-diagram-md/link-forms.input.md');
    const r = run(['expand', input]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(fs.readFileSync(path.join(root, 'tests/fixtures-diagram-md/link-forms.expected.md'), 'utf8'));
    expect(r.stderr).toContain('expanded 4 of 4 diagrams');
  });

  it('expand --write then strip --write restores the file byte-for-byte', () => {
    const file = path.join(backendDir, '..', path.basename(backendDir) + '-doc.md');
    const original = fs.readFileSync(path.join(root, 'tests/fixtures-diagram-md/duplicate-and-table.input.md'), 'utf8');
    fs.writeFileSync(file, original);
    expect(run(['expand', file, '--write']).status).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toContain('excalidraw-mermaid:begin groups03');
    const r = run(['strip', file, '--write']);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });

  it('expand exits non-zero when a link fails, still printing the document', () => {
    const r = run(['expand', path.join(root, 'tests/fixtures-diagram-md/failing-link.input.md')]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('%% could not load: scene not found (HTTP 404)');
  });

  it('expand retries a temporary failure instead of reporting it', () => {
    fs.writeFileSync(path.join(backendDir, 'shapes05.fail'), '503');
    const r = run(['expand', path.join(root, 'tests/fixtures-diagram-md/link-forms.input.md')]);
    expect(fs.existsSync(path.join(backendDir, 'shapes05.fail'))).toBe(false);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('expanded 4 of 4 diagrams');
  });

  it('show prints Mermaid for a link and for a local file', () => {
    const fromLink = run(['show', link('bound01')]);
    expect(fromLink.status).toBe(0);
    expect(fromLink.stdout).toContain('gateway -->|verifies| auth');
    const fromFile = run(['show', path.join(root, 'tests/fixtures-diagrams/10-image.excalidraw')]);
    expect(fromFile.status).toBe(0);
    expect(fromFile.stderr).toContain('warning: 1 embedded image(s) cannot be read');
  });

  it('edit prints only the new link; --show-mermaid goes to stderr', () => {
    const r = run(['edit', link('bound01'), '--ops', '[{"op":"rename","node":"ledger","label":"Ledger v2"}]', '--show-mermaid']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^https:\/\/excalidraw\.com\/#json=local\d+,[A-Za-z0-9_-]+$/);
    expect(r.stdout.trim().split('\n')).toHaveLength(1);
    expect(r.stderr).toContain('ledger[Ledger v2]');
    const back = run(['show', r.stdout.trim()]);
    expect(parseMermaid(back.stdout).nodes).toContain('ledger|Ledger v2|rect');
  });

  it('edit --no-upload --out works on a local file without touching the backend', () => {
    const before = fs.readdirSync(backendDir).length;
    const out = path.join(backendDir, '..', path.basename(backendDir) + '-out.excalidraw');
    const opsFile = path.join(backendDir, '..', path.basename(backendDir) + '-ops.json');
    fs.writeFileSync(opsFile, JSON.stringify([{ op: 'add', id: 'cache', label: 'Cache', near: 'gateway', side: 'below' }]));
    const r = run(['edit', path.join(root, 'tests/fixtures-diagrams/01-bound-arrows.excalidraw'), '--ops-file', opsFile, '--no-upload', '--out', out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('cache[Cache]');
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).elements.some((e) => e.id === 'cache')).toBe(true);
    expect(fs.readdirSync(backendDir).length).toBe(before);
  });

  it('edit with a bad reference fails, uploads nothing, and names valid ids', () => {
    const before = fs.readdirSync(backendDir).length;
    const r = run(['edit', link('bound01'), '--ops', '[{"op":"remove","node":"nope"}]']);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/unknown node or subgraph "nope".*valid ids: auth, gateway, ledger/);
    expect(fs.readdirSync(backendDir).length).toBe(before);
  });

  it('unknown commands exit non-zero with usage', () => {
    const r = run(['frobnicate', 'x']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage: c2m diagrams');
  });
});
