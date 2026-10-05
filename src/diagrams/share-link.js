// Excalidraw share links: parse, download + decrypt, encrypt + upload.
//
// Wire format mirrors upstream excalidraw `compressData` / `encryption`:
//   concatBuffers(...bufs) = uint32BE(1) + for each buf: uint32BE(len) + bytes
//   inner   = deflate(concatBuffers(utf8("null"), utf8(sceneJSON)))
//   payload = concatBuffers(utf8(encodingMetadata), iv12, AES-GCM-128(key, iv, inner))
// The key lives only in the link fragment (`#json=<id>,<jwk.k>`), so the backend
// never sees plaintext.
//
// Platform-neutral on purpose: only `fetch`, WebCrypto and pako, so the page and
// the Node CLI share this file. `fetch` is always injectable for tests.

import { deflate, inflate } from 'pako';

export const DEFAULT_BACKEND_BASE = 'https://json.excalidraw.com/api/v2/';
const SHARE_ORIGIN = 'https://excalidraw.com/';
const CONCAT_BUFFERS_VERSION = 1;
const ENCODING_METADATA = { version: 2, compression: 'pako@1', encryption: 'AES-GCM' };

// Hosts whose `#json=` links are served by the public excalidraw.com backend.
// Self-hosted backends are out of scope: client-facing links stay on excalidraw.com.
const SHARE_HOSTS = { 'excalidraw.com': DEFAULT_BACKEND_BASE, 'www.excalidraw.com': DEFAULT_BACKEND_BASE };

// Matches a share link anywhere in text. Backslashes are allowed inside the id and
// key because Google's Markdown export escapes `_` and `-` as `\_` and `\-`.
export const SHARE_LINK_PATTERN = /https?:\/\/(?:www\.)?excalidraw\.com\/?#json=[A-Za-z0-9_\-\\]+,[A-Za-z0-9_\-\\]+/g;

export function parseShareLink(url) {
  if (typeof url !== 'string') return null;
  var cleaned = url.trim().replace(/\\([_\-#=,.\/:])/g, '$1').replace(/\\+$/, '');
  var match = /^https?:\/\/((?:www\.)?excalidraw\.com)\/?#json=([A-Za-z0-9_-]+),([A-Za-z0-9_-]+)$/.exec(cleaned);
  if (!match) return null;
  var host = match[1].toLowerCase();
  return {
    id: match[2],
    key: match[3],
    backendBase: SHARE_HOSTS[host],
    url: SHARE_ORIGIN + '#json=' + match[2] + ',' + match[3],
  };
}

export function buildShareUrl(id, key) {
  return SHARE_ORIGIN + '#json=' + id + ',' + key;
}

// ---------------------------------------------------------------- buffers ---

function concatBuffers() {
  var buffers = Array.prototype.slice.call(arguments);
  var total = 4 + buffers.reduce(function (sum, b) { return sum + 4 + b.byteLength; }, 0);
  var out = new Uint8Array(total);
  var view = new DataView(out.buffer);
  view.setUint32(0, CONCAT_BUFFERS_VERSION);
  var cursor = 4;
  buffers.forEach(function (b) {
    view.setUint32(cursor, b.byteLength);
    cursor += 4;
    out.set(b, cursor);
    cursor += b.byteLength;
  });
  return out;
}

function splitBuffers(bytes) {
  var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var version = view.getUint32(0);
  if (version !== CONCAT_BUFFERS_VERSION) {
    throw new Error('unsupported buffer version ' + version);
  }
  var parts = [];
  var cursor = 4;
  while (cursor < bytes.byteLength) {
    var len = view.getUint32(cursor);
    cursor += 4;
    parts.push(bytes.subarray(cursor, cursor + len));
    cursor += len;
  }
  return parts;
}

var utf8 = {
  encode: function (s) { return new TextEncoder().encode(s); },
  decode: function (b) { return new TextDecoder().decode(b); },
};

// ----------------------------------------------------------------- crypto ---

function subtle() {
  var c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error('WebCrypto (crypto.subtle) is not available');
  return c.subtle;
}

function importKey(k, usage) {
  return subtle().importKey('jwk', { kty: 'oct', k: k, alg: 'A128GCM', ext: true }, { name: 'AES-GCM', length: 128 }, false, [usage]);
}

async function generateKey() {
  var key = await subtle().generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt', 'decrypt']);
  var jwk = await subtle().exportKey('jwk', key);
  return jwk.k;
}

export async function decodePayload(bytes, k) {
  var key = await importKey(k, 'decrypt');
  var parts;
  try {
    parts = splitBuffers(bytes);
  } catch (e) {
    parts = null;
  }
  if (!parts || parts.length !== 3) {
    // Pre-2021 links: whole body is AES-GCM with a zero IV, no compression.
    var legacy = await subtle().decrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, key, bytes);
    return JSON.parse(utf8.decode(new Uint8Array(legacy)));
  }
  var iv = parts[1];
  var decrypted = await subtle().decrypt({ name: 'AES-GCM', iv: iv }, key, parts[2]);
  var inner = splitBuffers(inflate(new Uint8Array(decrypted)));
  return JSON.parse(utf8.decode(inner[1]));
}

export async function encodePayload(scene, k) {
  var key = await importKey(k, 'encrypt');
  var inner = concatBuffers(utf8.encode(JSON.stringify(null)), utf8.encode(JSON.stringify(scene)));
  var iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  var encrypted = await subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, deflate(inner));
  return concatBuffers(utf8.encode(JSON.stringify(ENCODING_METADATA)), iv, new Uint8Array(encrypted));
}

// ---------------------------------------------------------------- network ---

function pickFetch(options) {
  var f = (options && options.fetch) || globalThis.fetch;
  if (typeof f !== 'function') throw new Error('no fetch implementation available');
  return f;
}

// Read-only: one GET to the backend named by the link.
export async function loadScene(url, options) {
  var link = parseShareLink(url);
  if (!link) throw new Error('not an excalidraw.com share link');
  var res = await pickFetch(options)(link.backendBase + link.id, { method: 'GET' });
  if (!res.ok) {
    var httpErr = new Error(res.status === 404 ? 'scene not found (HTTP 404)' : 'HTTP ' + res.status);
    httpErr.status = res.status;
    throw httpErr;
  }
  var bytes = new Uint8Array(await res.arrayBuffer());
  var data;
  try {
    data = await decodePayload(bytes, link.key);
  } catch (e) {
    var decryptErr = new Error('could not decrypt scene (wrong key or corrupt payload)');
    decryptErr.reason = 'decrypt';
    throw decryptErr;
  }
  return normalizeScene(data);
}

export function normalizeScene(data) {
  return {
    type: 'excalidraw',
    version: 2,
    source: (data && data.source) || 'https://excalidraw.com',
    elements: (data && data.elements) || [],
    appState: (data && data.appState) || {},
    files: (data && data.files) || {},
  };
}

// Uploads under a fresh key and returns the new share link. Share links are
// immutable: the old link keeps working.
export async function saveScene(scene, options) {
  var base = (options && options.backendBase) || DEFAULT_BACKEND_BASE;
  var k = await generateKey();
  var body = await encodePayload(normalizeScene(scene), k);
  var res = await pickFetch(options)(base + 'post/', { method: 'POST', body: body });
  if (!res.ok) throw new Error('upload failed: HTTP ' + res.status);
  var json = await res.json();
  if (!json || !json.id) throw new Error('upload failed: ' + JSON.stringify(json));
  return buildShareUrl(json.id, k);
}
