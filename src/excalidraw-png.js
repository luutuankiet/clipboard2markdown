// Excalidraw scene -> PNG for `c2m excalidraw --png`. Node only, no browser,
// no network: excalidraw's own exportToSvg runs under jsdom (bundled into
// vendor/excalidraw/ by scripts/build-excalidraw-bundle.mjs), then resvg turns
// the SVG into PNG with the fonts excalidraw embedded in it.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const VENDOR = fileURLToPath(new URL('../vendor/excalidraw/', import.meta.url));
// Font requests go to this origin and are answered from VENDOR/fonts; the
// .invalid TLD guarantees nothing could ever resolve it.
const ASSET_ORIGIN = 'http://c2m-fonts.invalid/';

export const MAX_PIXELS = 25000000; // Google Docs refuses larger images
export const DOC_SCALE = 3;
export const REVIEW_LONG_SIDE = 1000;
export const CACHE_MAX_AGE_MS = 24 * 3600 * 1000;

export function defaultRenderDir(env) {
  env = env || process.env;
  var base = env.XDG_CACHE_HOME || join(env.HOME || homedir(), '.cache');
  return join(base, 'c2m', 'renders');
}

// Deletes PNG renders older than maxAge directly in `dir`. Only ever called on
// the default cache folder; never recurses, never touches anything but *.png.
export function cleanRenderCache(dir, options) {
  var now = (options && options.now) || Date.now();
  var maxAge = (options && options.maxAgeMs) || CACHE_MAX_AGE_MS;
  var removed = [];
  if (!existsSync(dir)) return removed;
  readdirSync(dir).forEach(function (name) {
    if (!/\.png$/i.test(name)) return;
    var p = join(dir, name);
    var st;
    try { st = statSync(p); } catch { return; }
    if (!st.isFile() || now - st.mtimeMs <= maxAge) return;
    try { unlinkSync(p); removed.push(p); } catch { /* raced with another run */ }
  });
  return removed;
}

// Largest scale <= DOC_SCALE whose output stays within MAX_PIXELS, stepping
// down 0.01 at a time from the closed-form guess so rounding never overshoots.
export function pickScale(width, height) {
  var s = Math.min(DOC_SCALE, Math.floor(Math.sqrt(MAX_PIXELS / (width * height)) * 100) / 100);
  while (s > 0.01 && Math.ceil(width * s) * Math.ceil(height * s) > MAX_PIXELS) s = Math.round((s - 0.01) * 100) / 100;
  return s;
}

// ------------------------------------------------------------ excalidraw ---

var exportToSvgPromise;

function installDom() {
  var bundle = join(VENDOR, 'excalidraw.bundle.mjs');
  if (!existsSync(bundle)) {
    throw new Error('the Excalidraw renderer is missing (' + bundle + '); in a clone, run npm install');
  }
  return import('jsdom').then(function (m) {
    var dom = new m.JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
    var win = dom.window;
    var g = globalThis;
    ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'DOMParser',
      'XMLSerializer', 'getComputedStyle', 'devicePixelRatio', 'HTMLCanvasElement', 'Image', 'location',
      'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia'].forEach(function (k) {
      if (win[k] === undefined) return;
      try { Object.defineProperty(g, k, { value: win[k], configurable: true, writable: true }); } catch { /* read-only */ }
    });

    // jsdom has no canvas. Excalidraw probes a 2D context when its module
    // loads; export uses the text sizes already stored in the scene, so a
    // stand-in context is enough and produces the same SVG as a real one.
    win.HTMLCanvasElement.prototype.getContext = function () {
      var ctx = {
        filter: 'none', font: '20px sans-serif', canvas: this,
        measureText: function (t) {
          var px = parseFloat((/(\d+(?:\.\d+)?)px/.exec(this.font) || [])[1] || 20);
          return { width: t.length * px * 0.55, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2, fontBoundingBoxAscent: px * 0.9, fontBoundingBoxDescent: px * 0.25 };
        },
      };
      return new Proxy(ctx, {
        get: function (o, k) { return k in o ? o[k] : function () {}; },
        set: function (o, k, v) { o[k] = v; return true; },
      });
    };

    // No CSS Font Loading API in jsdom either.
    function FontFace(family, source, desc) { Object.assign(this, { family: family, source: source, status: 'loaded' }, desc); }
    FontFace.prototype.load = function () { return Promise.resolve(this); };
    g.FontFace = win.FontFace = FontFace;
    var fonts = new Set();
    Object.defineProperty(win.document, 'fonts', {
      value: {
        add: function (f) { fonts.add(f); }, delete: function (f) { return fonts.delete(f); },
        has: function (f) { return fonts.has(f); }, check: function () { return true; },
        load: function () { return Promise.resolve([]); }, ready: Promise.resolve(),
        forEach: function (cb) { fonts.forEach(cb); }, [Symbol.iterator]: function () { return fonts[Symbol.iterator](); },
        addEventListener: function () {}, removeEventListener: function () {},
      },
    });

    // Excalidraw fetches the fonts it embeds from its asset path; answer those
    // from the vendored copies. Everything else goes to the real fetch (the
    // only other request during export is a data: URL for the subsetter).
    var realFetch = g.fetch;
    g.fetch = win.fetch = function (url, init) {
      var s = String(url && url.url ? url.url : url);
      if (s.startsWith(ASSET_ORIGIN)) {
        var rel = decodeURIComponent(s.slice(ASSET_ORIGIN.length).split(/[?#]/)[0]);
        var file = join(VENDOR, rel);
        if (!file.startsWith(VENDOR) || !existsSync(file)) return Promise.resolve(new Response(null, { status: 404 }));
        return Promise.resolve(new Response(readFileSync(file), { headers: { 'content-type': 'font/woff2' } }));
      }
      // A font the vendored copy lacks (Xiaolai, CJK) makes excalidraw retry
      // on a public CDN; answer that locally too so no request leaves.
      if (/\/fonts\/[^/]+\/[^/]+\.woff2(?:$|[?#])/.test(s)) return Promise.resolve(new Response(null, { status: 404 }));
      return realFetch(url, init);
    };
    win.EXCALIDRAW_ASSET_PATH = ASSET_ORIGIN;
    return import(pathToFileURL(bundle).href);
  }).then(function (m) { return m.exportToSvg; });
}

export async function sceneToSvg(scene) {
  if (!exportToSvgPromise) exportToSvgPromise = installDom();
  var exportToSvg = await exportToSvgPromise;
  var elements = (scene.elements || []).filter(function (e) { return !e.isDeleted; });
  if (!elements.length) throw new Error('the scene has no elements to draw');
  // Excalidraw reports the missing CJK font on console.error; the caller gets
  // one warning from hasCjkText instead.
  var consoleError = console.error;
  console.error = function (first) {
    if (typeof first === 'string' && /^Failed to fetch font family/.test(first)) return;
    consoleError.apply(console, arguments);
  };
  try {
    var svg = await exportToSvg({
      elements: elements,
      appState: Object.assign({}, scene.appState, { exportBackground: true, viewBackgroundColor: '#ffffff' }),
      files: scene.files || {},
    });
    return svg.outerHTML;
  } finally {
    console.error = consoleError;
  }
}

// CJK text needs Xiaolai, which the package leaves out (13 MB); it renders blank.
export function hasCjkText(scene) {
  return (scene.elements || []).some(function (e) {
    return !e.isDeleted && e.type === 'text' && /[⺀-鿿가-힯豈-﫿＀-￯]/.test(e.text || '');
  });
}

// ------------------------------------------------------------------ resvg ---

// resvg ignores @font-face, and resvg-js 2.6.2 silently ignores fontBuffers, so
// the woff2 fonts excalidraw embedded are decoded to TTF files and passed as
// fontFiles. With system fonts off, a glyph no Excalidraw font has is dropped
// instead of switching the whole label to a system font.
async function extractFonts(svgText, dir) {
  var wawoff2 = (await import('wawoff2')).default;
  var files = [];
  var re = /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g;
  var m;
  while ((m = re.exec(svgText))) {
    var f = join(dir, files.length + '.ttf');
    writeFileSync(f, Buffer.from(await wawoff2.decompress(Buffer.from(m[1], 'base64'))));
    files.push(f);
  }
  return files;
}

// Returns { png, review, width, height, scale, reviewWidth, reviewHeight }.
export async function svgToPngs(svgText) {
  var { Resvg } = await import('@resvg/resvg-js');
  var dir = mkdtempSync(join(tmpdir(), 'c2m-fonts-'));
  try {
    var fontFiles = await extractFonts(svgText, dir);
    if (/<text[\s>]/.test(svgText) && !fontFiles.length) {
      // Without this check the text would quietly come out in a fallback font.
      throw new Error('no fonts were embedded in the SVG, text would render in the wrong font');
    }
    var font = { fontFiles: fontFiles, loadSystemFonts: false, defaultFontFamily: 'Excalifont' };
    var render = function (fitTo) {
      return new Resvg(svgText, { fitTo: fitTo, background: '#ffffff', font: font }).render();
    };
    var probe = new Resvg(svgText, { font: font });
    var w = probe.width, h = probe.height;

    var scale = pickScale(w, h);
    var doc = render({ mode: 'zoom', value: scale });
    while (doc.width * doc.height > MAX_PIXELS && scale > 0.01) {
      scale = Math.round((scale - 0.01) * 100) / 100;
      doc = render({ mode: 'zoom', value: scale });
    }

    var long = Math.max(w, h);
    var reviewLong = Math.min(REVIEW_LONG_SIDE, Math.round(long * 2));
    var review = render(w >= h ? { mode: 'width', value: reviewLong } : { mode: 'height', value: reviewLong });

    return {
      png: doc.asPng(), width: doc.width, height: doc.height, scale: scale,
      review: review.asPng(), reviewWidth: review.width, reviewHeight: review.height,
      fonts: fontFiles.length,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function renderScene(scene) {
  return svgToPngs(await sceneToSvg(scene));
}
