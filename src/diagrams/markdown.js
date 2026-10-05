// Markdown <-> generated Mermaid blocks.
//
// expandDiagramLinks inserts, after the paragraph / list item / table holding
// each excalidraw.com share link, a block of the form
//
//   <!-- excalidraw-mermaid:begin <id> -->
//   ```mermaid
//   %% generated from <url>; reading copy, ...
//   ...
//   ```
//   <!-- excalidraw-mermaid:end <id> -->
//
// Everything else is left byte-for-byte. Each block is inserted as
// "\n\n" + block right before the newline that ends the host block, so
// stripDiagramBlocks can remove exactly what was added and expand -> strip
// returns the original.

import { parseShareLink, SHARE_LINK_PATTERN } from './share-link.js';
import { sceneToMermaid, headerLine, GENERATED_MARKER } from './scene-to-mermaid.js';
import { failureReason } from './retry.js';

const BLOCK_PATTERN = /(?:\r?\n){0,2}[ \t]*<!-- excalidraw-mermaid:begin ([A-Za-z0-9_-]+) -->[\s\S]*?<!-- excalidraw-mermaid:end \1 -->/g;
// A generated block whose begin/end comments were lost (rich text drops HTML
// comments): a fence whose first line is our header. Any other fence is the
// author's and is never touched.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HEADER_FENCE_PATTERN = new RegExp(
  '(?:\\r?\\n){0,2}^[ \\t]*(`{3,}|~{3,})[ \\t]*(?:mermaid)?[ \\t]*\\r?\\n' +
  '[ \\t]*%% generated from [^\\n;]*; ' + escapeRe(GENERATED_MARKER) + '[^\\n]*\\n' +
  '(?:[^\\n]*\\n)*?[ \\t]*\\1[ \\t]*\\r?$', 'gm');
const LIST_MARKER = /^(\s*)([-*+]|\d+[.)])(\s+)/;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s{0,3}#{1,6}\s/;

export function stripDiagramBlocks(markdown) {
  return String(markdown).replace(BLOCK_PATTERN, '').replace(HEADER_FENCE_PATTERN, '');
}

// Line table with offsets so insertion works on the original string untouched.
function lineTable(text) {
  var lines = [];
  var start = 0;
  while (start <= text.length) {
    var nl = text.indexOf('\n', start);
    var end = nl < 0 ? text.length : nl;
    var contentEnd = end > start && text[end - 1] === '\r' ? end - 1 : end;
    lines.push({ start: start, end: contentEnd, text: text.slice(start, contentEnd) });
    if (nl < 0) break;
    start = nl + 1;
  }
  return lines;
}

function fencedLines(lines) {
  var inside = new Array(lines.length).fill(false);
  var open = null;
  lines.forEach(function (l, i) {
    var m = FENCE.exec(l.text);
    if (open) {
      inside[i] = true;
      if (m && m[1] === open) open = null;
    } else if (m) {
      inside[i] = true;
      open = m[1];
    }
  });
  return inside;
}

var isBlank = function (s) { return /^\s*$/.test(s); };

// Where to insert, and how far to indent, for a link on line `i`.
function hostBlock(lines, i) {
  // List item: nearest marker line above within the same run of non-blank lines.
  var markerLine = -1;
  for (var j = i; j >= 0 && !isBlank(lines[j].text); j--) {
    if (LIST_MARKER.test(lines[j].text)) { markerLine = j; break; }
  }
  if (markerLine >= 0) {
    var m = LIST_MARKER.exec(lines[markerLine].text);
    var indent = ' '.repeat(m[1].length + m[2].length + m[3].length);
    var end = i;
    while (end + 1 < lines.length && !isBlank(lines[end + 1].text) && !LIST_MARKER.test(lines[end + 1].text)) end++;
    return { line: end, indent: indent };
  }
  if (HEADING.test(lines[i].text)) return { line: i, indent: '' };
  var last = i;
  while (last + 1 < lines.length) {
    var next = lines[last + 1].text;
    if (isBlank(next) || HEADING.test(next) || FENCE.test(next) || LIST_MARKER.test(next)) break;
    last++;
  }
  return { line: last, indent: '' };
}

export function renderBlock(id, mermaidText, indent) {
  var body = ['<!-- excalidraw-mermaid:begin ' + id + ' -->', '```mermaid']
    .concat(mermaidText.split('\n'))
    .concat(['```', '<!-- excalidraw-mermaid:end ' + id + ' -->']);
  return body.map(function (l) { return l ? indent + l : l; }).join('\n');
}

// Every share link in the text, first occurrence per scene id, outside code fences.
export function findDiagramLinks(markdown) {
  var text = String(markdown);
  var lines = lineTable(text);
  var fenced = fencedLines(lines);
  var seen = new Set();
  var found = [];
  var re = new RegExp(SHARE_LINK_PATTERN.source, 'g');
  var m;
  var lineIdx = 0;
  while ((m = re.exec(text))) {
    var link = parseShareLink(m[0]);
    if (!link || seen.has(link.id)) continue;
    while (lineIdx + 1 < lines.length && lines[lineIdx + 1].start <= m.index) lineIdx++;
    if (fenced[lineIdx]) continue;
    seen.add(link.id);
    var host = hostBlock(lines, lineIdx);
    found.push({ link: link, offset: lines[host.line].end, indent: host.indent });
  }
  return found;
}

// Replaces any existing generated blocks, then inserts fresh ones. One failing
// link never stops the others.
//
// options.loadScene   url -> scene (required)
// options.parallel    download every link at once instead of one by one
// options.deadlineMs  give up on links not loaded by then (reason "timeout")
// options.onFailure   "block" (default): a visible "could not load" block;
//                     "omit": leave the link as written with no block
// options.report      filled with { total, done, failed, outline, skipped },
//                     skipped = [{ url, reason }] for every failed link
export async function expandDiagramLinks(markdown, options) {
  options = options || {};
  var loadScene = options.loadScene;
  if (typeof loadScene !== 'function') throw new Error('expandDiagramLinks needs options.loadScene');
  var onProgress = options.onProgress || function () {};
  var omitFailures = options.onFailure === 'omit';
  var text = stripDiagramBlocks(markdown);
  var links = findDiagramLinks(text);
  var stats = { total: links.length, done: 0, failed: 0, outline: 0 };
  var skipped = [];
  onProgress(Object.assign({}, stats));

  function render(item, scene) {
    var result = sceneToMermaid(scene, { sourceUrl: item.link.url });
    if (result.kind === 'outline') stats.outline++;
    return result.text;
  }
  function settle(item, outcome) {
    var mermaid = null;
    if (outcome.ok) {
      try {
        mermaid = render(item, outcome.scene);
      } catch (err) {
        outcome = { ok: false, err: err };
      }
    }
    if (!outcome.ok) {
      var err = outcome.err;
      stats.failed++;
      skipped.push({ url: item.link.url, reason: failureReason(err) });
      if (!omitFailures) {
        mermaid = headerLine(item.link.url) + '\n%% could not load: ' + String(err && err.message ? err.message : err).replace(/\s+/g, ' ');
      }
    }
    stats.done++;
    onProgress(Object.assign({}, stats));
    return mermaid;
  }
  function load(item) {
    return Promise.resolve()
      .then(function () { return loadScene(item.link.url); })
      .then(function (scene) { return { ok: true, scene: scene }; }, function (err) { return { ok: false, err: err }; });
  }

  var timer;
  var deadline = options.deadlineMs == null ? null : new Promise(function (resolve) {
    timer = setTimeout(function () {
      var err = new Error('no answer within ' + options.deadlineMs + 'ms');
      err.reason = 'timeout';
      resolve({ ok: false, err: err });
    }, options.deadlineMs);
  });
  var race = function (p) { return deadline ? Promise.race([p, deadline]) : p; };

  var mermaids = [];
  var run = function (item, idx) {
    return race(load(item)).then(function (outcome) { mermaids[idx] = settle(item, outcome); });
  };
  try {
    if (options.parallel) {
      await Promise.all(links.map(run));
    } else {
      for (var i = 0; i < links.length; i++) await run(links[i], i);
    }
  } finally {
    clearTimeout(timer);
  }

  var blocks = [];
  links.forEach(function (item, idx) {
    if (mermaids[idx] != null) blocks.push({ offset: item.offset, text: '\n\n' + renderBlock(item.link.id, mermaids[idx], item.indent) });
  });

  // Insert back to front so earlier offsets stay valid; same-offset blocks keep order.
  var out = text;
  for (var k = blocks.length - 1; k >= 0; k--) {
    out = out.slice(0, blocks[k].offset) + blocks[k].text + out.slice(blocks[k].offset);
  }
  if (options.report) Object.assign(options.report, stats, { skipped: skipped });
  return out;
}
