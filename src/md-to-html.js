/**
 * Markdown to HTML converter with Google Docs-ready styling.
 * 
 * Features:
 * - Tables: Blue header (#c9daf8), 0.5pt borders, auto column widths
 * - XML-like tags: Escaped to literal text (e.g., <current_mode> → &lt;current_mode&gt;)
 * - Whitespace: Preserves spaces after <br> tags
 * - Newlines: Converts \n to <br> in content (not in lists/tables/code)
 */

import { marked } from 'marked';

// Configure marked for GFM (tables, strikethrough, etc.)
marked.setOptions({ gfm: true });

/**
 * Fix nested lists for Google Docs compatibility.
 * Google Docs needs nested <ul>/<ol> to be properly separated from parent content.
 */
function fixNestedListsForGoogleDocs(html, domParser) {
  var parser = domParser || new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  
  // Find all nested lists (ul/ol inside li)
  doc.querySelectorAll('li > ul, li > ol').forEach(function (nestedList) {
    // Add display:block and margin to ensure proper rendering
    nestedList.style.display = 'block';
    nestedList.style.marginLeft = '24px';
    nestedList.style.marginTop = '4px';
    nestedList.style.marginBottom = '4px';
  });
  
  // Ensure all list items have proper display
  doc.querySelectorAll('li').forEach(function (li) {
    li.style.display = 'list-item';
  });
  
  // Ensure all lists have proper display
  doc.querySelectorAll('ul, ol').forEach(function (list) {
    list.style.display = 'block';
    if (!list.style.marginLeft && !list.parentElement.matches('li')) {
      // Top-level lists
      list.style.marginLeft = '24px';
    }
  });
  
  return doc.body.innerHTML;
}

/**
 * Apply Google Docs-compatible inline styles to tables.
 */
function applyGoogleDocsTableStyles(html, domParser) {
  var parser = domParser || new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  
  doc.querySelectorAll('table').forEach(function (table) {
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    
    doc.querySelectorAll('th').forEach(function (th) {
      th.style.backgroundColor = '#c9daf8';
      th.style.border = 'solid #000000 0.5pt';
      th.style.padding = '6px 8px';
    });
    
    doc.querySelectorAll('td').forEach(function (td) {
      td.style.border = 'solid #000000 0.5pt';
      td.style.padding = '6px 8px';
    });
  });
  
  return doc.body.innerHTML;
}

/**
 * Convert spaces after <br> to &nbsp; to preserve indentation.
 */
function preserveWhitespaceAfterBr(html) {
  return html.replace(/<br\s*\/?>(\s+)/gi, function (match, spaces) {
    return '<br>' + spaces.split('').map(function () { return '&nbsp;'; }).join('');
  });
}

/**
 * Escape XML-like tags that aren't standard HTML.
 * E.g., <current_mode> → &lt;current_mode&gt;
 */
function escapeXmlLikeTags(markdown) {
  var standardTags = /^(a|abbr|address|area|article|aside|audio|b|base|bdi|bdo|blockquote|body|br|button|canvas|caption|cite|code|col|colgroup|data|datalist|dd|del|details|dfn|dialog|div|dl|dt|em|embed|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hgroup|hr|html|i|iframe|img|input|ins|kbd|label|legend|li|link|main|map|mark|menu|meta|meter|nav|noscript|object|ol|optgroup|option|output|p|param|picture|pre|progress|q|rp|rt|ruby|s|samp|script|section|select|slot|small|source|span|strong|style|sub|summary|sup|table|tbody|td|template|textarea|tfoot|th|thead|time|title|tr|track|u|ul|var|video|wbr)$/i;
  
  return markdown.replace(/<(\/?)(\w[\w_-]*)([^>]*)>/g, function (match, slash, tagName, rest) {
    if (standardTags.test(tagName)) {
      return match;
    }
    return '&lt;' + slash + tagName + rest + '&gt;';
  });
}

/**
 * Convert newlines to <br> in text content.
 * Skips: <pre>, <code>, <table>, <ol>, <ul>, <li>
 * Skips: whitespace-only text nodes
 */
function preserveNewlinesInHtml(html, domParser) {
  var parser = domParser || new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  
  var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
  var textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  
  textNodes.forEach(function (node) {
    var parent = node.parentNode;
    while (parent && parent !== doc.body) {
      var tag = parent.tagName;
      if (tag === 'PRE' || tag === 'CODE' || tag === 'TABLE' || 
          tag === 'OL' || tag === 'UL' || tag === 'LI') {
        return;
      }
      parent = parent.parentNode;
    }
    
    var text = node.textContent;
    
    if (/^\s*$/.test(text)) {
      return;
    }
    
    if (text.indexOf('\n') !== -1) {
      var fragment = doc.createDocumentFragment();
      var parts = text.split('\n');
      parts.forEach(function (part, i) {
        if (i > 0) {
          fragment.appendChild(doc.createElement('br'));
        }
        if (part) {
          fragment.appendChild(doc.createTextNode(part));
        }
      });
      node.parentNode.replaceChild(fragment, node);
    }
  });
  
  return doc.body.innerHTML;
}

/**
 * Convert Markdown to Google Docs-ready HTML.
 * 
 * @param {string} markdown - Input markdown text
 * @param {object} options - Optional: { domParser: DOMParser instance }
 * @returns {string} HTML with inline styles for Google Docs
 */
export function convertMdToHtml(markdown, options) {
  var opts = options || {};
  var domParser = opts.domParser;
  
  // 1. Escape XML-like tags before parsing
  var escapedMd = escapeXmlLikeTags(markdown);
  // 2. Parse markdown to HTML
  var rawHtml = marked.parse(escapedMd);
  // 3. Preserve newlines (convert \n to <br>)
  var withNewlines = preserveNewlinesInHtml(rawHtml, domParser);
  // 4. Preserve whitespace after <br> tags
  var withPreservedSpaces = preserveWhitespaceAfterBr(withNewlines);
  // 5. Fix nested lists for Google Docs
  var withFixedLists = fixNestedListsForGoogleDocs(withPreservedSpaces, domParser);
  // 6. Apply Google Docs table styling
  return applyGoogleDocsTableStyles(withFixedLists, domParser);
}

// Also export individual functions for testing
export {
  applyGoogleDocsTableStyles,
  preserveWhitespaceAfterBr,
  escapeXmlLikeTags,
  preserveNewlinesInHtml,
  fixNestedListsForGoogleDocs
};