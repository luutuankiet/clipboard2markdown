#!/usr/bin/env node
// Live check against the real json.excalidraw.com backend. Not run in CI.
//   node scripts/diagrams-smoke.mjs
// Uploads a synthetic scene, loads it back, edits it by link through the CLI,
// and loads the new link back. Prints both links; uploads are public-but-
// encrypted and cannot be deleted, so only synthetic content goes here.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveScene, loadScene, sceneToMermaid } from '../src/diagrams/index.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const scene = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures-diagrams/03-nested-groups.excalidraw'), 'utf8'));
const fail = (msg) => { console.error('FAIL ' + msg); process.exit(1); };

const original = await saveScene(scene);
console.log('original link: ' + original);
const loaded = await loadScene(original);
if (JSON.stringify(loaded.elements) !== JSON.stringify(scene.elements)) fail('round trip changed elements');
console.log('ok   upload -> download returns identical elements (' + loaded.elements.length + ')');

const ops = [
  { op: 'rename', node: 'parser', label: 'Schema-aware parser' },
  { op: 'add', id: 'dedupe', label: 'Deduplicator', near: 'parser', side: 'below' },
  { op: 'connect', from: 'parser', to: 'dedupe', label: 'batches' },
  { op: 'connect', from: 'dedupe', to: 'store', dashed: true },
];
const r = spawnSync(process.execPath, [path.join(root, 'bin/diagrams.js'), 'edit', original, '--ops', JSON.stringify(ops), '--show-mermaid'], { encoding: 'utf8' });
if (r.status !== 0) fail('edit exited ' + r.status + ': ' + r.stderr);
const edited = r.stdout.trim();
if (!/^https:\/\/excalidraw\.com\/#json=[\w-]+,[\w-]+$/.test(edited)) fail('edit stdout is not exactly one link: ' + JSON.stringify(r.stdout));
console.log('edited link:   ' + edited);

const after = sceneToMermaid(await loadScene(edited)).text;
for (const want of ['parser[Schema-aware parser]', 'dedupe[Deduplicator]', 'parser -->|batches| dedupe', 'dedupe -.-> store']) {
  if (!after.includes(want)) fail('edited scene is missing ' + want + '\n' + after);
}
console.log('ok   edited link reads back with all four changes');
if (JSON.stringify((await loadScene(original)).elements) !== JSON.stringify(scene.elements)) fail('original link changed');
console.log('ok   original link unchanged');
console.log('\n' + after);
