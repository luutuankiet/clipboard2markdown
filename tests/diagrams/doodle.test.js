// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { doodleSkeleton, imageInfo, isDoodleSpec, layoutDoodle, wrapText } from '../../src/doodle.js';
import { fixImageSymbols } from '../../src/excalidraw-png.js';

// A 1x1 PNG header is enough: layout reads only the IHDR size.
function pngOf(w, h) {
  var b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const info = { width: 1000, height: 400 };
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('doodle layout', () => {
  it('recognises a spec and reads PNG size', () => {
    expect(isDoodleSpec({ image: 'a.png', notes: [] })).toBe(true);
    expect(isDoodleSpec([{ id: 'a' }])).toBe(false);
    expect(imageInfo(pngOf(640, 480))).toMatchObject({ mimeType: 'image/png', width: 640, height: 480 });
    expect(() => imageInfo(Buffer.from('GIF89a........'))).toThrow(/PNG or JPEG/);
  });

  it('wraps long notes at word boundaries and keeps given breaks', () => {
    expect(wrapText('one two three four', 9)).toBe('one two\nthree\nfour');
    expect(wrapText('a\nb', 9)).toBe('a\nb');
  });

  it('keeps every note off the picture and off each other, even when crowded', () => {
    var notes = [];
    for (var i = 0; i < 12; i++) notes.push({ text: 'note number ' + i + ' says something long enough to wrap', target: [10 + i * 80, 10 + (i % 4) * 90, 40, 30] });
    notes.push({ text: 'corner top', target: [5, 5], side: 'top' }, { text: 'corner left', target: [5, 5], side: 'left' });
    var lay = layoutDoodle({ image: 'x.png', notes: notes }, info);
    var pic = { x: 0, y: 0, w: lay.W, h: lay.H };
    lay.notes.forEach((n, i) => {
      expect(hit(n, pic), 'note ' + i + ' on picture').toBe(false);
      lay.notes.slice(i + 1).forEach((m) => expect(hit(n, m), 'notes overlap').toBe(false));
    });
  });

  it('picks the nearest side and aims arrows at the target', () => {
    var lay = layoutDoodle({ image: 'x.png', notes: [
      { text: 'left', target: [20, 200] }, { text: 'right', target: [990, 200] },
      { text: 'box', target: [400, 380, 100, 10] },
    ] }, info);
    expect(lay.notes.map((n) => n.side)).toEqual(['left', 'right', 'bottom']);
    expect(lay.notes[0].end).toEqual({ x: 20, y: 200 });
    expect(lay.notes[2].end.y).toBeGreaterThan(390); // just outside the box's bottom edge
  });

  it('scales targets with "width" and rejects bad input', () => {
    var lay = layoutDoodle({ image: 'x.png', width: 500, notes: [{ text: 'a', target: [100, 100] }] }, info);
    expect(lay.H).toBe(200);
    expect(lay.notes[0].end).toEqual({ x: 50, y: 50 });
    expect(() => layoutDoodle({ image: 'x', notes: [{ text: 'a', target: [2000, 1] }] }, info)).toThrow(/outside/);
    expect(() => layoutDoodle({ image: 'x', notes: [{ text: 'a', target: [1] }] }, info)).toThrow(/target/);
    expect(() => layoutDoodle({ image: 'x', notes: [{ text: 'a', target: [1, 1], side: 'up' }] }, info)).toThrow(/side/);
    expect(() => layoutDoodle({ image: 'x', notes: [] }, info)).toThrow(/empty/);
  });

  it('builds an image element with its file, a box, a note and a curved arrow', () => {
    var b = doodleSkeleton({ image: 'x.png', notes: [{ text: 'hi', target: [1, 1, 5, 5] }] }, pngOf(100, 50), 0);
    expect(b.elements.map((e) => e.type)).toEqual(['image', 'rectangle', 'rectangle', 'text', 'arrow']);
    expect(b.files['doodle-image'].dataURL).toMatch(/^data:image\/png;base64,/);
    var arrow = b.elements[4];
    expect(arrow.points).toHaveLength(3);
    expect(arrow.roundness).toEqual({ type: 2 });
  });

  it('makes resvg scale pictures to their placed size', () => {
    var svg = '<symbol id="image-a"><image href="data:x" preserveAspectRatio="none" width="100%" height="100%"></image></symbol>';
    expect(fixImageSymbols(svg)).toContain('<symbol id="image-a" viewBox="0 0 100 100" preserveAspectRatio="none">');
    expect(fixImageSymbols(svg)).toContain('width="100" height="100"');
  });
});
