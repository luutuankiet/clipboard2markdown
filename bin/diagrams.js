#!/usr/bin/env node
// c2m diagrams: Excalidraw share links <-> Mermaid, for agents. Reached through
// bin/cli.js (`c2m diagrams ...`) and, for older installs, as `c2m-diagrams`.
// Runs anywhere Node 20+ runs; no clipboard, no browser.
//
// stdout carries only the primary result (Markdown, Mermaid or the new link);
// diagnostics go to stderr; any failure exits non-zero.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  expandDiagramLinks, stripDiagramBlocks, loadScene, sceneToMermaid, editLink,
  parseShareLink, normalizeScene,
} from '../src/diagrams/index.js';

const USAGE = `usage: c2m diagrams <command> [options]

  expand <file.md> [--write]     add a Mermaid reading copy under every excalidraw.com link
  strip <file.md> [--write]      remove every generated block
  show <url|file.excalidraw>     print the Mermaid for one diagram
  edit <url|file.excalidraw> (--ops '<json>' | --ops-file <path>)
       [--show-mermaid] [--out file.excalidraw] [--no-upload]
                                 apply edit ops, upload, print the new link
                                 (--no-upload prints the resulting Mermaid instead)

ops: [{"op":"rename","node","label"}, {"op":"add","id","label","near","side"?},
      {"op":"connect","from","to","label"?,"dashed"?}, {"op":"disconnect","from","to"},
      {"op":"relabel-edge","from","to","label"}, {"op":"remove","node"}]
`;

// Test hook: a directory standing in for json.excalidraw.com. GET reads
// <dir>/<id>, POST writes a new file. Never set this outside tests.
function fileBackendFetch(dir) {
  return async function (url, init) {
    var method = ((init && init.method) || 'GET').toUpperCase();
    var respond = function (status, bytes) {
      return {
        ok: status >= 200 && status < 300,
        status: status,
        json: async function () { return JSON.parse(Buffer.from(bytes).toString('utf8')); },
        arrayBuffer: async function () { var b = Buffer.from(bytes); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
      };
    };
    if (method === 'POST') {
      var id = 'local' + fs.readdirSync(dir).length.toString().padStart(4, '0');
      fs.writeFileSync(path.join(dir, id), Buffer.from(init.body));
      return respond(200, Buffer.from(JSON.stringify({ id: id })));
    }
    var file = path.join(dir, url.split('/').pop());
    if (!fs.existsSync(file)) return respond(404, Buffer.from('{}'));
    return respond(200, fs.readFileSync(file));
  };
}

function parseArgs(argv) {
  var args = { _: [] };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--write' || a === '--show-mermaid' || a === '--no-upload' || a === '--help' || a === '-h') {
      args[a.replace(/^-+/, '')] = true;
    } else if (a === '--ops' || a === '--ops-file' || a === '--out') {
      if (i + 1 >= argv.length) throw new Error(a + ' needs a value');
      args[a.replace(/^-+/, '')] = argv[++i];
    } else if (a.startsWith('--')) {
      throw new Error('unknown option ' + a);
    } else {
      args._.push(a);
    }
  }
  return args;
}

async function readSource(target, fetchImpl) {
  if (parseShareLink(target)) return { scene: await loadScene(target, { fetch: fetchImpl }), url: parseShareLink(target).url };
  if (!fs.existsSync(target)) throw new Error('not a share link or an existing file: ' + target);
  return { scene: normalizeScene(JSON.parse(fs.readFileSync(target, 'utf8'))), url: null };
}

export async function main(argv, io) {
  var stdout = io.stdout, stderr = io.stderr;
  var fetchImpl = process.env.C2M_DIAGRAMS_FAKE_BACKEND ? fileBackendFetch(process.env.C2M_DIAGRAMS_FAKE_BACKEND) : globalThis.fetch;
  var args = parseArgs(argv);
  var cmd = args._[0];
  var target = args._[1];
  if (args.help || !cmd) { (args.help ? stdout : stderr).write(USAGE); return args.help ? 0 : 2; }
  if (!target) throw new Error(cmd + ' needs a target\n\n' + USAGE);

  if (cmd === 'expand' || cmd === 'strip') {
    var md = fs.readFileSync(target, 'utf8');
    var out;
    if (cmd === 'strip') {
      out = stripDiagramBlocks(md);
    } else {
      var report = {};
      out = await expandDiagramLinks(md, {
        loadScene: function (url) { return loadScene(url, { fetch: fetchImpl }); },
        onProgress: function (p) { if (p.total) stderr.write('expanding ' + p.done + ' of ' + p.total + ' diagrams\n'); },
        report: report,
      });
      stderr.write('expanded ' + (report.total - report.failed) + ' of ' + report.total + ' diagrams' +
        (report.failed ? ', ' + report.failed + ' failed' : '') + (report.outline ? ', ' + report.outline + ' as outline' : '') + '\n');
    }
    if (args.write) fs.writeFileSync(target, out); else stdout.write(out);
    return cmd === 'expand' && report.failed ? 1 : 0;
  }

  if (cmd === 'show') {
    var src = await readSource(target, fetchImpl);
    var result = sceneToMermaid(src.scene, { sourceUrl: src.url || path.basename(target) });
    result.warnings.forEach(function (w) { stderr.write('warning: ' + w + '\n'); });
    stdout.write(result.text + '\n');
    return 0;
  }

  if (cmd === 'edit') {
    var opsText = args.ops != null ? args.ops : args['ops-file'] ? fs.readFileSync(args['ops-file'], 'utf8') : null;
    if (opsText == null) throw new Error('edit needs --ops or --ops-file');
    var ops;
    try { ops = JSON.parse(opsText); } catch (e) { throw new Error('ops are not valid JSON: ' + e.message); }
    var source = parseShareLink(target) ? target : (await readSource(target, fetchImpl)).scene;
    var edited = await editLink(source, ops, { fetch: fetchImpl, upload: !args['no-upload'] });
    if (edited.scene.elements.some(function (el) { return el.type === 'image' && !el.isDeleted; })) {
      stderr.write('warning: embedded images do not carry over to a new share link; excalidraw.com will show placeholders until they are re-inserted (docs/traps/EDITED_LINK_LOSES_IMAGES.md)\n');
    }
    edited.report.forEach(function (line) { stderr.write(line + '\n'); });
    if (args.out) fs.writeFileSync(args.out, JSON.stringify(edited.scene, null, 2) + '\n');
    if (args['show-mermaid']) stderr.write(edited.mermaid + '\n');
    stdout.write((args['no-upload'] ? edited.mermaid : edited.url) + '\n');
    return 0;
  }

  throw new Error('unknown command "' + cmd + '"\n\n' + USAGE);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }).then(function (code) {
    process.exitCode = code;
  }, function (err) {
    process.stderr.write('error: ' + (err && err.message ? err.message : err) + '\n');
    process.exitCode = 1;
  });
}
