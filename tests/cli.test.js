// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { detectDirection } from '../bin/cli.js';

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
