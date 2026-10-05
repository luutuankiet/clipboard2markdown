// What the clipboard command does to the clipboard's content, without the
// clipboard: bin/cli.js keeps only pasteboard I/O, output streams and exit codes.
//
// Rich text -> Markdown, then a Mermaid reading copy under every excalidraw.com
// share link. Markdown -> HTML, with every generated reading copy removed first
// so only the link reaches the HTML. `diagrams: false` skips both steps and
// makes no request.

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

/**
 * @param {object} input
 * @param {string} input.content - clipboard content
 * @param {'html'|'text'} input.type - what the pasteboard held
 * @param {boolean} [input.forceToMd]
 * @param {boolean} [input.forceToHtml]
 * @param {boolean} [input.diagrams=true] - expand / strip Excalidraw reading copies
 * @param {Function} [input.fetch] - injectable for tests; defaults to globalThis.fetch
 * @param {{convert: Function, convertMdToHtml: Function}} input.converters
 * @returns {Promise<{output: string, kind: 'md'|'html', notice: string}>}
 *   notice is one line when something needs attention, else ''
 */
export async function convertClipboard(input) {
  var direction = detectDirection(input.type, input.forceToMd, input.forceToHtml);
  var diagrams = input.diagrams !== false;
  var converters = input.converters;

  if (direction === 'to-html') {
    var md = input.content;
    if (diagrams) {
      // Lazy, so --no-diagrams never loads the diagrams code
      var { stripDiagramBlocks } = await import('./diagrams/markdown.js');
      md = stripDiagramBlocks(md);
    }
    return { output: converters.convertMdToHtml(md), kind: 'html', notice: '' };
  }

  var markdown = converters.convert(input.content);
  if (!diagrams) return { output: markdown, kind: 'md', notice: '' };

  var [{ expandDiagramLinks }, { loadScene }, { retryingFetch, RETRY_POLICY }] = await Promise.all([
    import('./diagrams/markdown.js'), import('./diagrams/share-link.js'), import('./diagrams/retry.js'),
  ]);
  var fetchImpl = retryingFetch(input.fetch || globalThis.fetch);
  var report = {};
  var output = await expandDiagramLinks(markdown, {
    loadScene: function (url) { return loadScene(url, { fetch: fetchImpl }); },
    parallel: true,
    deadlineMs: RETRY_POLICY.deadlineMs,
    onFailure: 'omit',
    report: report,
  });
  return { output: output, kind: 'md', notice: skippedNotice(report) };
}

export function skippedNotice(report) {
  if (!report.failed) return '';
  var reasons = [...new Set(report.skipped.map(function (s) { return s.reason; }))];
  return 'c2m: ' + report.failed + ' of ' + report.total + ' diagrams skipped (' + reasons.join(', ') + ')';
}
