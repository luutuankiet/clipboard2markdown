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
  return str.replace(/[\u2018\u2019\u00b4]/g, "'")
            .replace(/[\u201c\u201d\u2033]/g, '"')
            .replace(/[\u2212\u2022\u00b7\u25aa]/g, '-')
            .replace(/[\u2013\u2015]/g, '--')
            .replace(/\u2014/g, '---')
            .replace(/\u2026/g, '...')
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