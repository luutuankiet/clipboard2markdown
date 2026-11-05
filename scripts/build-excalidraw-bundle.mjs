// Builds vendor/excalidraw/: one esbuild bundle of @excalidraw/excalidraw's
// exportToSvg plus its font files, for `c2m excalidraw --png`.
//
// Runs from the `prepare` script, so `npm install` in a clone, `npm pack` and
// `npm publish` all produce it; vendor/ is gitignored but listed in "files".
// The bundle exists because excalidraw's dist uses extensionless imports that
// Node's ESM loader rejects, and because installing the package at runtime
// would cost about 275 MB of node_modules.
//
// Xiaolai (the CJK font, 13 MB) is left out to keep the package small; CJK
// glyphs then render as nothing rather than in a fallback font.

import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'vendor', 'excalidraw');
const SKIP_FONTS = new Set(['Xiaolai']);

let pkgDir;
try {
  const require = createRequire(import.meta.url);
  // package.json is not in the package's exports map: resolve the entry point
  // and walk up to the folder that holds it.
  pkgDir = dirname(require.resolve('@excalidraw/excalidraw'));
  while (!existsSync(join(pkgDir, 'package.json'))) pkgDir = dirname(pkgDir);
} catch {
  // Installed as a dependency of something else: devDependencies are absent and
  // the published package already carries vendor/. Nothing to do.
  if (existsSync(join(out, 'excalidraw.bundle.mjs'))) process.exit(0);
  console.error('build-excalidraw-bundle: @excalidraw/excalidraw is not installed; c2m excalidraw --png will not work');
  process.exit(0);
}
const version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  stdin: { contents: "export { exportToSvg } from '@excalidraw/excalidraw';", resolveDir: root, loader: 'js' },
  bundle: true,
  minify: true,
  platform: 'node',
  format: 'esm',
  outfile: join(out, 'excalidraw.bundle.mjs'),
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" },
  logLevel: 'error',
  legalComments: 'none',
});

const fontSrc = join(pkgDir, 'dist', 'prod', 'fonts');
for (const family of readdirSync(fontSrc)) {
  if (SKIP_FONTS.has(family)) continue;
  cpSync(join(fontSrc, family), join(out, 'fonts', family), { recursive: true });
}
writeFileSync(join(out, 'VERSION'), version + '\n');
console.error('build-excalidraw-bundle: vendor/excalidraw built from @excalidraw/excalidraw ' + version);
