// @vitest-environment node
// Runs every tests/fixtures-diagrams/*.excalidraw against its .mmd, compared
// semantically. Add a pair and it is picked up; no test code needed.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sceneToMermaid } from '../../src/diagrams/index.js';
import { parseMermaid } from './mermaid-semantics.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures-diagrams');
const fixtures = fs.readdirSync(dir).filter((f) => f.endsWith('.excalidraw')).sort();

describe('excalidraw scene -> mermaid', () => {
  it('finds fixtures', () => expect(fixtures.length).toBeGreaterThanOrEqual(10));

  fixtures.forEach((file) => {
    it(`converts ${file}`, () => {
      const scene = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const expected = fs.readFileSync(path.join(dir, file.replace(/\.excalidraw$/, '.mmd')), 'utf8');
      const first = sceneToMermaid(scene);
      expect(parseMermaid(first.text)).toEqual(parseMermaid(expected));
      // Same scene, same ids, same text: agents refer to nodes by these ids.
      expect(sceneToMermaid(JSON.parse(JSON.stringify(scene))).text).toBe(first.text);
    });
  });
});
