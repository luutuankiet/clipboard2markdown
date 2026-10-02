// Regenerates the synthetic .excalidraw scenes in this directory.
//   node tests/fixtures-diagrams/build-fixtures.mjs
// All content is invented. The expected .mmd files are hand-written; do not
// regenerate them from the converter's output.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let seed = 1;
const base = (type, id, x, y, w, h, extra) => ({
  id, type, x, y, width: w, height: h, angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent',
  fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [],
  frameId: null, roundness: null, seed: seed++, version: 1, versionNonce: seed * 7, isDeleted: false,
  boundElements: [], updated: 1700000000000, link: null, locked: false, ...extra,
});
const text = (id, x, y, s, extra) => base('text', id, x, y, s.length * 11, 25, {
  text: s, originalText: s, fontSize: 20, fontFamily: 5, textAlign: 'center', verticalAlign: 'middle',
  containerId: null, lineHeight: 1.25, autoResize: true, boundElements: null, ...extra,
});
// A shape with a bound label.
const box = (els, type, id, x, y, w, h, label) => {
  const s = base(type, id, x, y, w, h, { boundElements: [{ type: 'text', id: id + '_label' }] });
  els.push(s, text(id + '_label', x + 10, y + h / 2 - 12, label, { containerId: id }));
  return s;
};
// A shape whose label is free text placed inside it.
const looseBox = (els, type, id, x, y, w, h, label) => {
  els.push(base(type, id, x, y, w, h), text(id + '_t', x + 12, y + h / 2 - 12, label));
};
const arrow = (els, id, x1, y1, x2, y2, opts = {}) => {
  const a = base(opts.type || 'arrow', id, x1, y1, Math.abs(x2 - x1), Math.abs(y2 - y1), {
    points: [[0, 0], [x2 - x1, y2 - y1]], startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: 'arrow', strokeStyle: opts.style || 'solid', ...opts.extra,
  });
  if (opts.from) { a.startBinding = { elementId: opts.from, focus: 0, gap: 5 }; }
  if (opts.to) { a.endBinding = { elementId: opts.to, focus: 0, gap: 5 }; }
  els.push(a);
  if (opts.boundLabel) {
    a.boundElements = [{ type: 'text', id: id + '_label' }];
    els.push(text(id + '_label', (x1 + x2) / 2 - 20, (y1 + y2) / 2 - 12, opts.boundLabel, { containerId: id }));
  }
  return a;
};
const bindTo = (els, shapeId, arrowId) => {
  els.find((e) => e.id === shapeId).boundElements.push({ type: 'arrow', id: arrowId });
};
const scene = (elements) => ({ type: 'excalidraw', version: 2, source: 'https://excalidraw.com', elements, appState: { viewBackgroundColor: '#ffffff', gridSize: null }, files: {} });
const write = (name, els) => fs.writeFileSync(path.join(dir, name + '.excalidraw'), JSON.stringify(scene(els), null, 2) + '\n');

// 1. bound arrows with bound labels, left to right
{
  const e = [];
  box(e, 'rectangle', 'gateway', 0, 0, 180, 70, 'API gateway');
  box(e, 'rectangle', 'auth', 300, 0, 180, 70, 'Auth service');
  box(e, 'rectangle', 'ledger', 600, 0, 180, 70, 'Ledger DB');
  arrow(e, 'a1', 185, 35, 295, 35, { from: 'gateway', to: 'auth', boundLabel: 'verifies' });
  arrow(e, 'a2', 485, 35, 595, 35, { from: 'auth', to: 'ledger', boundLabel: 'reads' });
  bindTo(e, 'gateway', 'a1'); bindTo(e, 'auth', 'a1'); bindTo(e, 'auth', 'a2'); bindTo(e, 'ledger', 'a2');
  write('01-bound-arrows', e);
}

// 2. unbound arrows, free-text labels placed near them, top to bottom
{
  const e = [];
  box(e, 'rectangle', 'intake', 0, 0, 200, 70, 'Intake form');
  box(e, 'rectangle', 'triage', 0, 200, 200, 70, 'Triage queue');
  box(e, 'rectangle', 'archive', 0, 400, 200, 70, 'Archive');
  arrow(e, 'u1', 100, 76, 100, 194);                // ends a few px off the boxes
  e.push(text('u1_note', 112, 120, 'submits'));
  arrow(e, 'u2', 100, 280, 100, 365);               // end lands 35px above the box: snapped
  e.push(text('u2_note', 112, 310, 'after 30 days'));
  write('02-unbound-arrows', e);
}

// 3. nested groups, plus an arrow ending on a group box
{
  const e = [];
  e.push(base('rectangle', 'platform', 300, 0, 600, 420));
  e.push(text('platform_title', 320, 10, 'Platform'));
  e.push(base('rectangle', 'ingest', 330, 60, 540, 160));
  e.push(text('ingest_title', 350, 70, 'Ingest'));
  box(e, 'rectangle', 'reader', 360, 120, 180, 70, 'Feed reader');
  box(e, 'rectangle', 'parser', 640, 120, 180, 70, 'Parser');
  box(e, 'rectangle', 'store', 500, 300, 180, 70, 'Event store');
  box(e, 'rectangle', 'client', 0, 170, 180, 70, 'Client app');
  arrow(e, 'n1', 545, 155, 635, 155, { from: 'reader', to: 'parser' });
  bindTo(e, 'reader', 'n1'); bindTo(e, 'parser', 'n1');
  arrow(e, 'n2', 730, 195, 600, 295);               // unbound, into the store
  arrow(e, 'n3', 185, 205, 296, 260);               // ends on the platform border, far from any node
  e.push(text('n3_note', 200, 245, 'pushes'));
  write('03-nested-groups', e);
}

// 4. dashed, headless and double-headed arrows, and a line with a head
{
  const e = [];
  box(e, 'rectangle', 'left', 0, 0, 160, 60, 'Left');
  box(e, 'rectangle', 'mid', 300, 0, 160, 60, 'Middle');
  box(e, 'rectangle', 'right', 600, 0, 160, 60, 'Right');
  box(e, 'rectangle', 'far', 900, 0, 160, 60, 'Far');
  arrow(e, 's1', 165, 30, 295, 30, { style: 'dashed' });
  arrow(e, 's2', 465, 30, 595, 30, { extra: { endArrowhead: null } });
  arrow(e, 's3', 765, 30, 895, 30, { extra: { startArrowhead: 'arrow' } });
  arrow(e, 's4', 80, 65, 380, 65, { type: 'line', style: 'dotted', extra: { startArrowhead: null, endArrowhead: 'triangle', points: [[0, 0], [150, 60], [300, 0]] } });
  e.push(base('line', 'decor', 0, 200, 1000, 0, { points: [[0, 0], [1000, 0]], startArrowhead: null, endArrowhead: null }));
  write('04-arrow-styles', e);
}

// 5. ellipse, diamond and a rectangle labelled by loose text
{
  const e = [];
  box(e, 'ellipse', 'start', 0, 0, 140, 140, 'Start');
  box(e, 'diamond', 'check', 0, 250, 200, 140, 'Valid?');
  looseBox(e, 'rectangle', 'done', 0, 500, 200, 70, 'Done');
  arrow(e, 'f1', 70, 145, 100, 245, { from: 'start', to: 'check' });
  arrow(e, 'f2', 100, 395, 100, 495, { from: 'check', to: 'done' });
  e.push(text('f2_note', 112, 430, 'yes'));
  bindTo(e, 'start', 'f1'); bindTo(e, 'check', 'f1'); bindTo(e, 'check', 'f2');
  write('05-shapes', e);
}

// 6. readable vs random element ids
{
  const e = [];
  box(e, 'rectangle', 'billing', 0, 0, 180, 70, 'Billing');
  box(e, 'rectangle', 'Qx7-Lm2pZr9_WvB4nKd0s', 300, 0, 180, 70, 'Invoices');
  box(e, 'rectangle', 'end', 600, 0, 180, 70, 'Keyword id');
  box(e, 'rectangle', '9starts_with_digit', 900, 0, 180, 70, 'Digit id');
  arrow(e, 'r1', 185, 35, 295, 35);
  arrow(e, 'r2', 485, 35, 595, 35);
  arrow(e, 'r3', 785, 35, 895, 35);
  write('06-ids', e);
}

// 7. free notes, and one arrow with an unmatched end
{
  const e = [];
  box(e, 'rectangle', 'cache', 0, 0, 180, 70, 'Cache');
  box(e, 'rectangle', 'origin', 0, 250, 180, 70, 'Origin');
  box(e, 'rectangle', 'edge1', 300, 250, 180, 70, 'Edge node');
  box(e, 'rectangle', 'logs', 300, 500, 180, 70, 'Access logs');
  arrow(e, 'm1', 90, 75, 90, 245);
  arrow(e, 'm3', 185, 285, 295, 285);
  arrow(e, 'm4', 390, 325, 390, 495, { style: 'dotted' });
  arrow(e, 'm2', 185, 35, 500, 35);                  // points at nothing: 3 of 4 resolve
  e.push(text('m2_note', 300, 5, 'evicts'));
  e.push(text('free1', 600, 400, 'TODO confirm TTL with ops'));
  write('07-notes-unmatched', e);
}

// 8. sequence-diagram-like canvas: must come out as an outline
{
  const e = [];
  ['buyer', 'shop', 'bank'].forEach((id, i) => {
    box(e, 'rectangle', id, i * 300, 0, 160, 60, id[0].toUpperCase() + id.slice(1));
    e.push(base('line', id + '_life', i * 300 + 80, 60, 0, 400, { points: [[0, 0], [0, 400]], strokeStyle: 'dashed', startArrowhead: null, endArrowhead: null }));
  });
  arrow(e, 'q1', 80, 120, 380, 120);
  e.push(text('q1_t', 180, 95, 'order'));
  arrow(e, 'q2', 380, 200, 680, 200);
  e.push(text('q2_t', 480, 175, 'charge'));
  arrow(e, 'q3', 680, 280, 380, 280, { style: 'dashed' });
  e.push(text('q3_t', 480, 255, 'ok'));
  write('08-sequence-outline', e);
}

// 9. deleted elements are ignored
{
  const e = [];
  box(e, 'rectangle', 'kept', 0, 0, 180, 70, 'Kept');
  box(e, 'rectangle', 'other', 300, 0, 180, 70, 'Other');
  box(e, 'rectangle', 'gone', 0, 300, 180, 70, 'Gone');
  e.find((x) => x.id === 'gone').isDeleted = true;
  e.find((x) => x.id === 'gone_label').isDeleted = true;
  arrow(e, 'd1', 185, 35, 295, 35);
  arrow(e, 'd2', 90, 75, 90, 295, { extra: { isDeleted: true } });
  e.push(text('d3', 600, 300, 'deleted note', { isDeleted: true }));
  write('09-deleted', e);
}

// 10. an embedded image
{
  const e = [];
  e.push(base('rectangle', 'zone', 0, 0, 500, 300));
  e.push(text('zone_t', 20, 10, 'Dashboard'));
  box(e, 'rectangle', 'widget', 40, 80, 160, 60, 'Widget');
  e.push(base('image', 'shot', 260, 80, 200, 150, { fileId: 'file-synthetic-1', status: 'saved', scale: [1, 1] }));
  write('10-image', e);
}

// 11. a colour key beside the diagram: boxes no arrow touches, one per style,
// each style also worn by something in the diagram. A stray box far from the
// key shares a key style: it stays a box, tagged like the rest.
{
  const e = [];
  const paint = (id, bg, fill) => Object.assign(e.find((x) => x.id === id), { backgroundColor: bg, fillStyle: fill || 'solid' });
  e.push(base('rectangle', 'zone', 0, 0, 520, 200));
  e.push(text('zone_title', 20, 10, 'Shop zone'));
  box(e, 'rectangle', 'till', 30, 80, 180, 70, 'Till');
  box(e, 'rectangle', 'stock', 310, 80, 180, 70, 'Stock table');
  box(e, 'rectangle', 'feeder', 30, 320, 180, 70, 'Supplier feed');
  box(e, 'rectangle', 'sync', 310, 320, 180, 70, 'Sync job');
  arrow(e, 'k1', 215, 115, 305, 115, { from: 'till', to: 'stock' });
  arrow(e, 'k2', 120, 315, 120, 155, { from: 'feeder', to: 'till' });
  arrow(e, 'k3', 400, 315, 400, 155, { from: 'sync', to: 'stock', style: 'dashed' });
  paint('till', '#a5d8ff'); paint('stock', '#a5d8ff'); paint('feeder', '#e9ecef'); paint('sync', '#e9ecef', 'hachure');
  box(e, 'rectangle', 'key_table', 700, 0, 160, 50, 'Table');
  box(e, 'rectangle', 'key_source', 700, 80, 160, 50, 'Source');
  box(e, 'rectangle', 'key_job', 700, 160, 160, 50, 'Job');
  looseBox(e, 'rectangle', 'key_zone', 700, 240, 160, 80, 'Zone');
  paint('key_table', '#a5d8ff'); paint('key_source', '#e9ecef'); paint('key_job', '#e9ecef', 'hachure');
  box(e, 'rectangle', 'later', 0, 700, 180, 70, 'Later idea');
  paint('later', '#a5d8ff');
  write('11-legend', e);
}
