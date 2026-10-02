// In-memory stand-in for json.excalidraw.com. Stores posted payloads under
// generated ids and serves them back, so tests exercise the real encryption,
// compression and decryption.
export function createFakeBackend() {
  const store = new Map();
  const requests = [];
  let next = 1;
  const fetch = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    requests.push({ method, url });
    const respond = (status, body) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(new TextDecoder().decode(body)),
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });
    if (method === 'POST' && url.endsWith('/post/')) {
      const id = 'fake' + String(next++).padStart(4, '0');
      store.set(id, new Uint8Array(init.body));
      return respond(200, new TextEncoder().encode(JSON.stringify({ id })));
    }
    const id = url.split('/').pop();
    if (method === 'GET' && store.has(id)) return respond(200, store.get(id));
    return respond(404, new TextEncoder().encode('{}'));
  };
  return { fetch, store, requests };
}
