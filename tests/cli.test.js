// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { detectDirection } from '../bin/cli.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const cli = new URL('../bin/cli.js', import.meta.url).pathname;

describe('detectDirection', () => {
  it('auto-detects HTML clipboard -> to-md', () => {
    expect(detectDirection('html', false, false)).toBe('to-md');
  });

  it('auto-detects plain-text clipboard -> to-html', () => {
    expect(detectDirection('text', false, false)).toBe('to-html');
  });

  it('--to-md overrides auto-detect when clipboard is text', () => {
    expect(detectDirection('text', true, false)).toBe('to-md');
  });

  it('--to-md overrides auto-detect when clipboard is html', () => {
    expect(detectDirection('html', true, false)).toBe('to-md');
  });

  it('--to-html overrides auto-detect when clipboard is html', () => {
    expect(detectDirection('html', false, true)).toBe('to-html');
  });

  it('--to-html overrides auto-detect when clipboard is text', () => {
    expect(detectDirection('text', false, true)).toBe('to-html');
  });

  it('--to-md takes precedence over --to-html when both are set', () => {
    expect(detectDirection('html', true, true)).toBe('to-md');
  });
});

describe('main bin', () => {
  // `npx <pkg>` with no -p runs the bin named after the unscoped package; with
  // several bins and none of that name it fails "could not determine executable"
  it('is named after the package, so bare npx finds it', () => {
    expect(pkg.bin[pkg.name.split('/').pop()]).toBe('bin/cli.js');
  });

  it('routes the diagrams subcommand', () => {
    const r = spawnSync(process.execPath, [cli, 'diagrams', '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('usage: c2m diagrams');
  });
});
