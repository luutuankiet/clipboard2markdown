// @vitest-environment node
// The clipboard command through its seam: content + flags in, output, kind and
// notice line out. A seeded in-memory backend stands in for json.excalidraw.com.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import { JSDOM } from 'jsdom';
import { convertClipboard } from '../src/clipboard-convert.js';
import { seededBackend, FIXTURE_KEY } from './diagrams/seeded-backend.js';

const link = (id) => `https://excalidraw.com/#json=${id},${FIXTURE_KEY}`;
let converters;
let backend;

// Wraps the backend: `script[id]` lists what each successive GET for that id
// answers before the real backend does ('503', 'hang', ...).
function scripted(script = {}) {
  const calls = {};
  const fetch = (url, init) => {
    const id = url.split('/').pop();
    calls[id] = (calls[id] || 0) + 1;
    const step = (script[id] || [])[calls[id] - 1];
    if (step === 'hang') return new Promise(() => {});
    if (step) return Promise.resolve({ ok: false, status: Number(step), arrayBuffer: async () => new ArrayBuffer(0) });
    return backend.fetch(url, init);
  };
  return { fetch, calls };
}

const run = (content, extra = {}) => convertClipboard({ content, type: 'html', converters, fetch: scripted().fetch, ...extra });

beforeAll(async () => {
  const { window } = new JSDOM('<!DOCTYPE html>');
  globalThis.DOMParser = window.DOMParser;
  globalThis.NodeFilter = window.NodeFilter;
  const { convert } = await import('../src/converter.js');
  const { convertMdToHtml } = await import('../src/md-to-html.js');
  converters = { convert, convertMdToHtml };
  backend = await seededBackend();
});

afterEach(() => vi.useRealTimers());

describe('rich text -> Markdown', () => {
  it('leaves rich text without links alone and stays quiet', async () => {
    const r = await run('<p>Just <b>text</b></p>');
    expect(r).toEqual({ output: 'Just **text**', kind: 'md', notice: '' });
  });

  it('adds a reading copy under links written as anchor, bare text and list item', async () => {
    const html = `<p>See <a href="${link('bound01')}">the flow</a></p>` +
      `<p>Bare: ${link('shapes05')}</p>` +
      `<ul><li>Listed <a href="${link('groups03')}">${link('groups03')}</a></li></ul>`;
    const r = await run(html);
    expect(r.kind).toBe('md');
    expect(r.notice).toBe('');
    for (const id of ['bound01', 'shapes05', 'groups03']) {
      expect(r.output).toContain(`<!-- excalidraw-mermaid:begin ${id} -->`);
    }
    expect(r.output).toContain('gateway -->|verifies| auth');
  });

  it('--no-diagrams gives plain conversion and never fetches', async () => {
    const html = `<p>See <a href="${link('bound01')}">the flow</a></p>`;
    const fetch = vi.fn();
    const r = await run(html, { diagrams: false, fetch });
    expect(r).toEqual({ output: converters.convert(html), kind: 'md', notice: '' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a 404 is skipped after one attempt: link left as written, notice names it', async () => {
    const s = scripted();
    const r = await run(`<p><a href="${link('missing99')}">gone</a> and <a href="${link('bound01')}">ok</a></p>`, { fetch: s.fetch });
    expect(s.calls.missing99).toBe(1);
    expect(r.output).not.toContain('missing99 -->');
    expect(r.output).not.toContain('could not load');
    expect(r.output).toContain('[gone](' + link('missing99') + ')');
    expect(r.output).toContain('excalidraw-mermaid:begin bound01');
    expect(r.notice).toBe('c2m: 1 of 2 diagrams skipped (404)');
  });

  it('a wrong key is skipped as decrypt, never retried', async () => {
    const s = scripted();
    const r = await run(`<p><a href="https://excalidraw.com/#json=bound01,AAAAAAAAAAAAAAAAAAAAAA">x</a></p>`, { fetch: s.fetch });
    expect(s.calls.bound01).toBe(1);
    expect(r.notice).toBe('c2m: 1 of 1 diagrams skipped (decrypt)');
  });

  it('two 503s then success still gives the reading copy and no notice', async () => {
    vi.useFakeTimers();
    const s = scripted({ bound01: ['503', '503'] });
    const pending = run(`<p><a href="${link('bound01')}">flow</a></p>`, { fetch: s.fetch });
    await vi.advanceTimersByTimeAsync(1000);
    const r = await pending;
    expect(s.calls.bound01).toBe(3);
    expect(r.output).toContain('excalidraw-mermaid:begin bound01');
    expect(r.notice).toBe('');
  });

  it('a link that never answers is skipped at the deadline as timeout; the others still land', async () => {
    vi.useFakeTimers();
    const s = scripted({ shapes05: ['hang', 'hang', 'hang'] });
    const pending = run(`<p><a href="${link('shapes05')}">slow</a> <a href="${link('bound01')}">fast</a></p>`, { fetch: s.fetch });
    await vi.advanceTimersByTimeAsync(6000);
    const r = await pending;
    expect(r.output).not.toContain('excalidraw-mermaid:begin shapes05');
    expect(r.output).toContain('excalidraw-mermaid:begin bound01');
    expect(r.notice).toBe('c2m: 1 of 2 diagrams skipped (timeout)');
  });
});

describe('Markdown -> HTML', () => {
  const md = fs.readFileSync(new URL('./fixtures-diagram-md/markerless-copy.expected.md', import.meta.url), 'utf8') +
    '\n' + fs.readFileSync(new URL('./fixtures-diagram-md/markerless-copy.input.md', import.meta.url), 'utf8');

  it('removes every generated reading copy, keeps links and hand-written Mermaid, never fetches', async () => {
    const fetch = vi.fn();
    const r = await convertClipboard({ content: md, type: 'text', converters, fetch });
    expect(r.kind).toBe('html');
    expect(r.notice).toBe('');
    expect(r.output).not.toContain('generated from');
    expect(r.output).not.toContain('excalidraw-mermaid');
    expect(r.output).toContain(`href="${link('bound01')}"`);
    expect(r.output).toContain('mine --&gt; kept');
    expect(r.output).toContain('also --&gt; mine');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('--no-diagrams converts the Markdown exactly as written', async () => {
    const r = await convertClipboard({ content: md, type: 'text', converters, diagrams: false });
    expect(r.output).toBe(converters.convertMdToHtml(md));
  });

  it('--to-md forces rich-text direction on plain text', async () => {
    const r = await convertClipboard({ content: `<p>${link('bound01')}</p>`, type: 'text', forceToMd: true, converters, fetch: scripted().fetch });
    expect(r.kind).toBe('md');
    expect(r.output).toContain('excalidraw-mermaid:begin bound01');
  });
});
