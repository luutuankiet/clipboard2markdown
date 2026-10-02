// Every flowchart the reader writes must parse in real Mermaid, or the page's
// preview and any agent piping it onward would break.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mermaid from 'mermaid';
import { sceneToMermaid } from '../../src/diagrams/index.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures-diagrams');
const parses = (text) => mermaid.parse(text, { suppressErrors: false }).then(() => true);

describe('generated Mermaid parses', () => {
  fs.readdirSync(dir).filter((f) => f.endsWith('.excalidraw')).forEach((f) => {
    it(f, async () => {
      const r = sceneToMermaid(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), { sourceUrl: 'https://excalidraw.com/#json=abc,def' });
      if (r.kind === 'flowchart') await expect(parses(r.text)).resolves.toBe(true);
    });
  });

  it('quotes labels with Mermaid-special characters', async () => {
    const label = 'Say "hi" [now] {or} (later)\nsecond line; end';
    const scene = { elements: [
      { id: 'end', type: 'rectangle', x: 0, y: 0, width: 300, height: 90, boundElements: [{ type: 'text', id: 't' }] },
      { id: 't', type: 'text', x: 5, y: 5, width: 280, height: 50, text: label, originalText: label, containerId: 'end' },
      { id: 'b', type: 'rectangle', x: 0, y: 200, width: 100, height: 60 },
      { id: 'bt', type: 'text', x: 10, y: 210, width: 50, height: 25, text: 'B|C', originalText: 'B|C' },
      { id: 'ar', type: 'arrow', x: 50, y: 95, width: 0, height: 100, points: [[0, 0], [0, 100]], endArrowhead: 'arrow' },
      { id: 'al', type: 'text', x: 60, y: 130, width: 60, height: 25, text: 'a|b "c"', originalText: 'a|b "c"' },
    ] };
    const r = sceneToMermaid(scene);
    expect(r.text).toContain('#quot;hi#quot;');
    expect(r.text).toContain('<br/>');
    await expect(parses(r.text)).resolves.toBe(true);
  });
});
