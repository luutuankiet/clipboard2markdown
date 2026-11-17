// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mermaidToScene } from '../../src/mermaid-input.js';

// Runs the real converter under jsdom, like `c2m excalidraw x.mmd`.
describe('Mermaid input', () => {
  it('turns a flowchart into styled, bound shapes', async () => {
    var r = await mermaidToScene('flowchart LR\n  a[Extract] --> b{OK?}\n  b -->|yes| c((Load))');
    var byId = Object.fromEntries(r.scene.elements.map((e) => [e.id, e]));
    expect(byId.a.type).toBe('rectangle');
    expect(byId.b.type).toBe('diamond');
    expect(byId.c.type).toBe('ellipse');
    ['a', 'b', 'c'].forEach((id) => expect(byId[id]).toMatchObject({ backgroundColor: '#ffffff', strokeColor: '#1e1e1e' }));
    var texts = r.scene.elements.filter((e) => e.type === 'text').map((e) => e.text.replace(/\n/g, ''));
    expect(texts).toEqual(expect.arrayContaining(['Extract', 'OK?', 'Load', 'yes']));
    // No label is wrapped mid-word: shapes are sized for Excalifont.
    r.scene.elements.filter((e) => e.type === 'text').forEach((e) => expect(e.text).not.toContain('\n'));
    expect(r.scene.elements.filter((e) => e.type === 'arrow')).toHaveLength(2);
    expect(r.preview).toContain('flowchart LR');
    expect(r.warnings).toEqual([]);
  }, 60000);

  it('turns a sequence diagram into actors, lifelines and messages', async () => {
    var r = await mermaidToScene('sequenceDiagram\n  A->>B: ask\n  B-->>A: answer');
    var types = r.scene.elements.map((e) => e.type);
    expect(types.filter((t) => t === 'rectangle').length).toBeGreaterThanOrEqual(4);
    expect(types.filter((t) => t === 'arrow')).toHaveLength(2);
  }, 60000);

  it('reports a parse error in words', async () => {
    await expect(mermaidToScene('flowchart LR\n  a[ --> ')).rejects.toThrow(/Mermaid did not parse/);
    await expect(mermaidToScene('  ')).rejects.toThrow(/empty/);
  }, 60000);
});
