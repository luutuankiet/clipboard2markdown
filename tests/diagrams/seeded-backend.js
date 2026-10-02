// A fake backend pre-loaded with fixture scenes under fixed ids and one key,
// so Markdown and CLI fixtures can carry stable share links.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encodePayload } from '../../src/diagrams/share-link.js';
import { createFakeBackend } from './fake-backend.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sceneDir = path.join(here, '..', 'fixtures-diagrams');
export const FIXTURE_KEY = 'C0J-T6YLyjITbqXy9z_Kow';
export const SEEDED = { bound01: '01-bound-arrows', groups03: '03-nested-groups', shapes05: '05-shapes', seq08: '08-sequence-outline' };

export async function seededBackend() {
  const backend = createFakeBackend();
  for (const [id, file] of Object.entries(SEEDED)) {
    const scene = JSON.parse(fs.readFileSync(path.join(sceneDir, file + '.excalidraw'), 'utf8'));
    backend.store.set(id, await encodePayload(scene, FIXTURE_KEY));
  }
  return backend;
}

