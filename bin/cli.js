#!/usr/bin/env node
import { JSDOM } from 'jsdom';
import { spawnSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

// Polyfill browser globals required by converter modules (unavailable in Node.js)
const { window: domWindow } = new JSDOM('<!DOCTYPE html>');
globalThis.DOMParser = domWindow.DOMParser;
globalThis.NodeFilter = domWindow.NodeFilter;

// Dynamic imports run after globals are set, ensuring converters can use DOMParser
const { convert } = await import('../src/converter.js');
const { convertMdToHtml } = await import('../src/md-to-html.js');

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const forceToMd = args.includes('--to-md');
  const forceToHtml = args.includes('--to-html');

  try {
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
