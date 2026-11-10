// Layout warnings stand in for looking at a picture: each fixture under
// tests/fixtures-layout/ is drawn through `c2m excalidraw --no-upload` and must
// print its own warning, and the clean one none at all.
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { runExcalidraw } from '../../bin/excalidraw.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures-layout');

const run = async (name) => {
  const out = [], err = [];
  const io = { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } };
  const code = await runExcalidraw([path.join(dir, name), '--no-upload'], io);
  const warnings = out.join('').split('\n').filter((l) => l.startsWith('warning: '));
  return { code, stderr: err.join(''), warnings };
};

describe('layout warnings', () => {
  it.each([
    ['overflow.json', 'warning: label of "svc" does not fit'],
    ['crossing.json', 'warning: arrows "ad" and "cb" cross'],
    ['crowded.json', 'warning: "api" and "db" are 10 px apart'],
  ])('%s warns: %s', async (file, expected) => {
    const r = await run(file);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect(r.warnings.some((w) => w.startsWith(expected))).toBe(true);
    expect(r.warnings).toHaveLength(1);
  });

  it('a clean scene prints no warning', async () => {
    const r = await run('clean.json');
    expect(r.code).toBe(0);
    expect(r.warnings).toEqual([]);
  });
});
