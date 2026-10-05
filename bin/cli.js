#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

const HELP = `clipboard2markdown (short name: c2m) - clipboard HTML <-> Markdown,
and Excalidraw diagrams for agents

Usage:
  c2m              HTML on the clipboard -> Markdown, plain text -> HTML
  c2m --to-md      force HTML -> Markdown
  c2m --to-html    force Markdown -> HTML
  c2m --help       show this help
  c2m --version    print the version

  c2m excalidraw <file|->   JSON diagram -> excalidraw.com share link and
                            Mermaid preview (see c2m excalidraw --help)
  c2m diagrams <command>    existing share links <-> Mermaid: expand, strip,
                            show, edit (see c2m diagrams --help)

Every command also runs without installing:
  npx -y @luutuankiet/clipboard2markdown excalidraw diagram.json

Clipboard conversion needs macOS (it uses osascript); excalidraw and
diagrams run anywhere Node 20+ runs.
Exit codes: 0 converted, 1 empty clipboard, 2 conversion failed.
`;

// Converters need jsdom's DOM globals; loaded lazily so commands that
// don't touch the clipboard skip the jsdom startup cost
async function loadConverters() {
  const { JSDOM } = await import('jsdom');
  const { window: domWindow } = new JSDOM('<!DOCTYPE html>');
  globalThis.DOMParser = domWindow.DOMParser;
  globalThis.NodeFilter = domWindow.NodeFilter;
  const { convert } = await import('../src/converter.js');
  const { convertMdToHtml } = await import('../src/md-to-html.js');
  return { convert, convertMdToHtml };
}

function readVersion() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return pkg.version;
}

// --- clipboard I/O via JXA (macOS only) ---

function readClipboard() {
  const script = `
ObjC.import("AppKit");
var pb = $.NSPasteboard.generalPasteboard;
var types = ObjC.deepUnwrap(pb.types);
var result;
if (types.indexOf("public.html") !== -1) {
  var data = pb.dataForType("public.html");
  if (!data.isNil()) {
    var str = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
    var content = !str.isNil() ? ObjC.unwrap(str) : "";
    if (content && content.trim().length > 0) {
      result = { type: "html", content: content };
    }
  }
}
if (!result) {
  var plain = ObjC.unwrap(pb.stringForType("public.utf8-plain-text"));
  result = { type: "text", content: plain || "" };
}
JSON.stringify(result);
`;
  const result = spawnSync('osascript', ['-l', 'JavaScript', '-e', script], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Clipboard read failed: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

function writeTextToClipboard(text) {
  const tmp = join(tmpdir(), `c2m_${Date.now()}.txt`);
  writeFileSync(tmp, text, 'utf8');
  const script = `
ObjC.import("AppKit");
var str = $.NSString.stringWithContentsOfFileEncodingError(${JSON.stringify(tmp)}, $.NSUTF8StringEncoding, null);
var pb = $.NSPasteboard.generalPasteboard;
pb.clearContents;
pb.setStringForType(str, "public.utf8-plain-text");
`;
  try {
    const result = spawnSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Clipboard write failed: ${result.stderr}`);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function writeHtmlToClipboard(html) {
  const tmp = join(tmpdir(), `c2m_${Date.now()}.html`);
  writeFileSync(tmp, html, 'utf8');
  const script = `
ObjC.import("AppKit");
var str = $.NSString.stringWithContentsOfFileEncodingError(${JSON.stringify(tmp)}, $.NSUTF8StringEncoding, null);
var htmlData = str.dataUsingEncoding($.NSUTF8StringEncoding);
var pb = $.NSPasteboard.generalPasteboard;
pb.clearContents;
pb.setDataForType(htmlData, "public.html");
pb.setStringForType(str, "public.utf8-plain-text");
`;
  try {
    const result = spawnSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Clipboard write failed: ${result.stderr}`);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

// --- core logic (exported for testing) ---

/**
 * Determine conversion direction.
 * @param {'html'|'text'} clipboardType - what the pasteboard held
 * @param {boolean} forceToMd - --to-md flag was passed
 * @param {boolean} forceToHtml - --to-html flag was passed
 * @returns {'to-md'|'to-html'}
 */
export function detectDirection(clipboardType, forceToMd, forceToHtml) {
  if (forceToMd) return 'to-md';
  if (forceToHtml) return 'to-html';
  return clipboardType === 'html' ? 'to-md' : 'to-html';
}

// --- entry point (only runs when executed directly) ---

// npm installs bin as a symlink, so compare real paths
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const args = process.argv.slice(2);

  // Subcommands dispatch before any clipboard code, so they run off macOS
  if (args[0] === 'excalidraw') {
    const { runExcalidraw } = await import('./excalidraw.js');
    process.exit(await runExcalidraw(args.slice(1), { stdout: process.stdout, stderr: process.stderr }));
  }
  if (args[0] === 'diagrams') {
    const { main } = await import('./diagrams.js');
    try {
      process.exit(await main(args.slice(1), { stdout: process.stdout, stderr: process.stderr }));
    } catch (err) {
      process.stderr.write('error: ' + (err && err.message ? err.message : err) + '\n');
      process.exit(1);
    }
  }

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${readVersion()}\n`);
    process.exit(0);
  }
  if (process.platform !== 'darwin') {
    process.stderr.write('c2m: clipboard conversion needs macOS. See c2m --help.\n');
    process.exit(2);
  }

  const forceToMd = args.includes('--to-md');
  const forceToHtml = args.includes('--to-html');

  try {
    const { convert, convertMdToHtml } = await loadConverters();
    const clipboard = readClipboard();
    if (!clipboard.content || !clipboard.content.trim()) {
      console.error('c2m: empty clipboard');
      process.exit(1);
    }
    const direction = detectDirection(clipboard.type, forceToMd, forceToHtml);
    if (direction === 'to-md') {
      const md = convert(clipboard.content);
      console.error(`c2m: ${clipboard.type} → md (${md.length} chars)`);
      writeTextToClipboard(md);
    } else {
      const html = convertMdToHtml(clipboard.content);
      console.error(`c2m: ${clipboard.type} → html (${html.length} chars)`);
      writeHtmlToClipboard(html);
    }
    process.exit(0);
  } catch (e) {
    console.error(`c2m: ${e.message}`);
    process.exit(2);
  }
}
