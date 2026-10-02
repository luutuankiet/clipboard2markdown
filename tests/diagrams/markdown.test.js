// @vitest-environment node
// Feature 1 through its seam: expandDiagramLinks / stripDiagramBlocks, against
// an in-memory backend so every link goes through real decryption.
//
// tests/fixtures-diagram-md/<name>.input.md -> <name>.expected.md. Add a pair
// and it is picked up. Links use the fake scene ids seeded below.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expandDiagramLinks, stripDiagramBlocks, loadScene } from '../../src/diagrams/index.js';
import { seededBackend } from './seeded-backend.js';

const mdDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures-diagram-md');

const pairs = fs.readdirSync(mdDir).filter((f) => f.endsWith('.input.md')).sort();

describe('expandDiagramLinks / stripDiagramBlocks', () => {
  let backend;
  let expand;
  beforeAll(async () => {
    backend = await seededBackend();
    expand = (md, extra) => expandDiagramLinks(md, { loadScene: (url) => loadScene(url, { fetch: backend.fetch }), ...extra });
  });

  it('finds fixtures', () => expect(pairs.length).toBeGreaterThanOrEqual(4));

  pairs.forEach((file) => {
    const input = fs.readFileSync(path.join(mdDir, file), 'utf8');
    const expected = fs.readFileSync(path.join(mdDir, file.replace('.input.md', '.expected.md')), 'utf8');

    it(`expands ${file}`, async () => {
      expect(await expand(input)).toBe(expected);
    });

    it(`strip undoes expand byte-for-byte: ${file}`, async () => {
      expect(stripDiagramBlocks(await expand(input))).toBe(stripDiagramBlocks(input));
      expect(stripDiagramBlocks(expected)).toBe(stripDiagramBlocks(input));
    });

    it(`re-expanding replaces blocks instead of adding: ${file}`, async () => {
      expect(await expand(expected)).toBe(expected);
    });
  });

  it('only ever GETs, and reports progress and failures', async () => {
    const input = fs.readFileSync(path.join(mdDir, 'failing-link.input.md'), 'utf8');
    const seen = [];
    const report = {};
    backend.requests.length = 0;
    await expand(input, { onProgress: (p) => seen.push(p), report });
    expect(backend.requests.every((r) => r.method === 'GET')).toBe(true);
    expect(report).toEqual({ total: 3, done: 3, failed: 2, outline: 0 });
    expect(seen[0]).toEqual({ total: 3, done: 0, failed: 0, outline: 0 });
  });

  it('expands a link only at its first occurrence', async () => {
    const out = await expand(fs.readFileSync(path.join(mdDir, 'duplicate-and-table.input.md'), 'utf8'));
    expect(out.match(/excalidraw-mermaid:begin bound01/g)).toHaveLength(1);
  });
});
