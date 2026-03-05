import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { addAllRules, sanitize } from './platforms/index.js';

// Initialize Turndown with options
var turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined'
});

// Use GFM plugin (tables, strikethrough, task lists)
turndownService.use(gfm);

// Load all platform rules (Jira, Slack, Common, etc.)
addAllRules(turndownService);

// ===========================================
// ESCAPE OVERRIDE (disable underscore escaping)
// ===========================================
// Turndown escapes ALL underscores by default (e.g., join_payment_provider → join\_payment\_provider).
// This is overly aggressive — underscores mid-word don't trigger emphasis in CommonMark.
// We override the escape method to remove underscore escaping while keeping other escapes.
// See: https://github.com/mixmark-io/turndown/issues/233

var originalEscape = turndownService.escape.bind(turndownService);
turndownService.escape = function (string) {
  // Apply default escaping, then unescape underscores and dashes
  // Dashes: Turndown escapes `-` at line start (potential list marker), but inside
  // table cells this is overly aggressive — tables can't contain block-level lists.
  // This preserves user's bullet-point formatting like "- item" in cells.
  return originalEscape(string)
    .replace(/\\_/g, '_')
    .replace(/\\-/g, '-');
};

// ===========================================
// PRE-PROCESSING (HTML sanitization)
// ===========================================

var sanitizeHTML = function (html) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  
  // Run all platform sanitizers
  sanitize(doc);

  return doc.body.innerHTML;
};

// ===========================================
// POST-PROCESSING (smart punctuation cleanup)
// ===========================================

var escape = function (str) {
  return str.replace(/^(#{1,6} \d+)\\\./gm, '$1.')  // unescape 1\. in headings — can't be a list there
            .replace(/[\u2018\u2019\u00b4]/g, "'")
            .replace(/[\u201c\u201d\u2033]/g, '"')
            .replace(/[\u2212\u2022\u00b7\u25aa]/g, '-')
            .replace(/[\u2013\u2015]/g, '--')
            .replace(/\u2014/g, '---')
            .replace(/\u2026/g, '...')
            .replace(/\{\{TABLE_BR\}\}/g, '<br>')   // Table cell line breaks
            .replace(/\{\{PIPE\}\}/g, '\\|')       // Escaped pipes in table cells
            .replace(/\{\{GS_LBRACK\}\}/g, '[')    // Google Sheets literals
            .replace(/\{\{GS_RBRACK\}\}/g, ']')
            .replace(/\{\{GS_BKTICK\}\}/g, '`')
            .replace(/\{\{GS_SPACE\}\}/g, ' ')     // Google Sheets preserved spaces (indentation)
            .replace(/\{\{GS_TAB\}\}/g, '\t')      // Google Sheets preserved tabs
            .replace(/[ ]+\n/g, '\n')
            .replace(/\s*\\\n/g, '\\\n')
            .replace(/\s*\\\n\s*\\\n/g, '\n\n')
            .replace(/\s*\\\n\n/g, '\n\n')
            .replace(/\n-\n/g, '\n')
            .replace(/\n\n\s*\\\n/g, '\n\n')
            .replace(/\n\n\n*/g, '\n\n')
            .replace(/[ ]+$/gm, '')
            .replace(/^\s+|[\s\\]+$/g, '');
};

// ===========================================
// MAIN CONVERT FUNCTION
// ===========================================

export var convert = function (str) {
  return escape(turndownService.turndown(sanitizeHTML(str)));
};