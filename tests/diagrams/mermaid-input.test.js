// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mermaidToScene, prepareMermaid } from '../../src/mermaid-input.js';

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
    // The LR source is redrawn top-down, with a warning.
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/rewrote "flowchart LR" to TD/);
  }, 60000);

  it('turns a sequence diagram into actors, lifelines and messages', async () => {
    var r = await mermaidToScene('sequenceDiagram\n  A->>B: ask\n  B-->>A: answer');
    var types = r.scene.elements.map((e) => e.type);
    expect(types.filter((t) => t === 'rectangle').length).toBeGreaterThanOrEqual(4);
    expect(types.filter((t) => t === 'arrow')).toHaveLength(2);
  }, 60000);

  it('turns <br>, <br/> and <br /> into line breaks and sizes the boxes for them', async () => {
    var r = await mermaidToScene('flowchart TD\n  a[One<br>two] --> b{Yes<br/>or<br />no}');
    var texts = r.scene.elements.filter((e) => e.type === 'text');
    texts.forEach((t) => expect(t.text).not.toMatch(/<br/i));
    expect(texts.map((t) => t.text)).toEqual(expect.arrayContaining(['One\ntwo', 'Yes\nor\nno']));
    var byId = Object.fromEntries(r.scene.elements.map((e) => [e.id, e]));
    var diamondText = texts.find((t) => t.containerId === 'b');
    expect(byId.b.height).toBeGreaterThanOrEqual(2 * diamondText.height + 40 - 1);
    expect(r.warnings).toEqual([]);
  }, 60000);

  it('rewrites flowchart LR and graph LR to TD, nothing else', () => {
    expect(prepareMermaid('flowchart LR\n a-->b').text).toMatch(/^flowchart TD/);
    expect(prepareMermaid('graph LR\n a-->b').warnings).toHaveLength(1);
    expect(prepareMermaid('flowchart TD\n a-->b').warnings).toEqual([]);
    expect(prepareMermaid('sequenceDiagram\n A->>B: LR').text).toContain('LR');
  });

  it('grows a subgraph frame around its children, so the lint finds nothing', async () => {
    var r = await mermaidToScene('flowchart TD\n  subgraph S[Source]\n    a[A stage table with a long label here]\n  end');
    var frame = r.scene.elements.find((e) => e.id === 'S');
    var a = r.scene.elements.find((e) => e.id === 'a');
    expect(frame.x).toBeLessThanOrEqual(a.x - 20);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(a.x + a.width + 20);
  }, 60000);

  it('reports a parse error in words', async () => {
    await expect(mermaidToScene('flowchart LR\n  a[ --> ')).rejects.toThrow(/Mermaid did not parse/);
    await expect(mermaidToScene('  ')).rejects.toThrow(/empty/);
  }, 60000);
});
