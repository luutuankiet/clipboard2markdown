// src/platforms/common.js
import pako from 'pako';

export default {
  rules: [
    // Superscript
    {
      name: 'superscript',
      filter: 'sup',
      replacement: function (content) {
        return '^' + content + '^';
      }
    },

    // Subscript — output plain text (no ~content~ since that's non-standard in GFM)
    {
      name: 'subscript',
      filter: 'sub',
      replacement: function (content) {
        return content;
      }
    },

    // Line breaks - simple newline
    {
      name: 'lineBreak',
      filter: 'br',
      replacement: function () {
        return '\n';
      }
    },

    // Horizontal rule
    {
      name: 'horizontalRule',
      filter: 'hr',
      replacement: function () {
        return '\n\n---\n\n';
      }
    },

    // Italic - includes CSS font-style detection (Google Docs support)
    {
      name: 'italicCSS',
      filter: function (node) {
        // Standard italic tags
        var tags = ['EM', 'I', 'CITE', 'VAR'];
        if (tags.indexOf(node.nodeName) !== -1) return true;

        // CSS font-style="italic" (Google Docs/AI output)
        if (node.style && node.style.fontStyle === 'italic') {
          return true;
        }

        return false;
      },
      replacement: function (content) {
        if (!content.trim()) return '';
        return '*' + content + '*';
      }
    },

    // Mermaid source blocks decoded from #pako payloads
    {
      name: 'mermaidSourceBlock',
      filter: function (node) {
        return node.nodeName === 'PRE' && node.hasAttribute('data-mermaid-source');
      },
      replacement: function (content, node) {
        var source = node.textContent || '';
        return '\n\n```mermaid\n' + source + '\n```\n\n';
      }
    },

    // Mermaid base64 preview placeholders
    {
      name: 'mermaidImagePlaceholder',
      filter: function (node) {
        return node.nodeName === 'SPAN' && node.hasAttribute('data-mermaid-image-placeholder');
      },
      replacement: function (content, node) {
        var alt = node.getAttribute('data-mermaid-image-placeholder') || 'mermaid diagram preview omitted';
        return '![' + alt + '](mermaid-image-placeholder)';
      }
    },

     // Fenced code blocks (PRE, with or without CODE child)
    {
      name: 'fencedCodeBlock',
      filter: function (node) {
        return node.nodeName === 'PRE';
      },
      replacement: function (content, node) {
        var codeElement = node.querySelector('code');
        var text = codeElement ? codeElement.textContent : node.textContent;
        return '\n\n```\n' + text + '\n```\n\n';
      }
    },

    // Inline code - includes span.inline-code (Google AI/Angular apps)
    {
      name: 'inlineCode',
      filter: function (node) {
        var hasSiblings = node.previousSibling || node.nextSibling;
        var isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings;

        // Standard code tags
        var isStandardCode = node.nodeName === 'CODE' ||
            node.nodeName === 'KBD' ||
            node.nodeName === 'SAMP' ||
            node.nodeName === 'TT';

        // Custom span.inline-code or span.code (Jira)
        var isSpanCode = node.nodeName === 'SPAN' &&
            (node.classList.contains('inline-code') || node.classList.contains('code'));

        return (isStandardCode || isSpanCode) && !isCodeBlock;
      },
      replacement: function (content) {
        if (!content) return '';
        return '`' + content + '`';
      }
    },

    // Links - with Slack team link handling
    {
      name: 'links',
      filter: function (node) {
        return node.nodeName === 'A' && node.getAttribute('href');
      },
      replacement: function (content, node) {
        var url = node.getAttribute('href');
        var titlePart = node.title ? ' "' + node.title + '"' : '';

        if (content === url) {
          return '<' + url + '>';
        } else if (url === ('mailto:' + content)) {
          return '<' + content + '>';
        } else if (url && url.includes('slack.com/team')) {
          return content;
        } else {
          return '[' + content + '](' + url + titlePart + ')';
        }
      }
    },

    // List items - custom prefix formatting
    {
      name: 'listItem',
      filter: 'li',
      replacement: function (content, node) {
        content = content.replace(/^\s+/, '').replace(/\n/gm, '\n    ');
        var prefix = '-   ';
        var parent = node.parentNode;

        if (/ol/i.test(parent.nodeName)) {
          var start = parseInt(parent.getAttribute('start') || '1', 10);
          var index = Array.prototype.indexOf.call(parent.children, node) + 1;
          var listNumber = start + index - 1;
          prefix = listNumber + '. ';
          while (prefix.length < 4) {
            prefix += ' ';
          }
        }

        return prefix + content + '\n';
      }
    },

    // Remove buttons (e.g. Jira "Open image", "Copy to clipboard")
    {
      name: 'removeButtons',
      filter: 'button',
      replacement: function () {
        return '';
      }
    }
  ],
  sanitizer: function (doc) {
    var body = doc.body || doc.documentElement;
    if (!body) return;
    var seenMermaidPayloads = Object.create(null);

    var cleanMermaidCode = function (source) {
      if (!source) return null;
      return source.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
    };

    var normalizeBase64Url = function (payload) {
      var normalized = (payload || '').replace(/-/g, '+').replace(/_/g, '/');
      while (normalized.length % 4 !== 0) normalized += '=';
      return normalized;
    };

    var decodePakoPayload = function (payload) {
      try {
        var binary = atob(normalizeBase64Url(payload));
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        var inflated = pako.inflate(bytes, { to: 'string' });
        var parsed = JSON.parse(inflated);

        if (!parsed || typeof parsed.code !== 'string') {
          return null;
        }

        return cleanMermaidCode(parsed.code);
      } catch (error) {
        return null;
      }
    };

    var extractPakoPayload = function (href) {
      if (!href) return null;
      var match = href.match(/#pako:([^?&#]+)/);
      return match ? match[1] : null;
    };

    var pruneEmptyContainers = function (node) {
      var current = node;
      while (current && current !== body) {
        if (current.nodeType !== 1) return;

        var text = (current.textContent || '').replace(/\u200B/g, '').trim();
        if (text) return;

        if (current.querySelector && current.querySelector('img,pre,code,a,table,ul,ol,li,blockquote,hr')) {
          return;
        }

        var parent = current.parentNode;
        if (!parent) return;

        parent.removeChild(current);
        current = parent;
      }
    };

    // Decode Mermaid pako links into source code blocks.
    doc.querySelectorAll('a[href*="#pako:"]').forEach(function (link) {
      var payload = extractPakoPayload(link.getAttribute('href'));
      if (!payload) return;

      if (seenMermaidPayloads[payload]) {
        var duplicateParent = link.parentNode;
        var duplicateText = (link.textContent || '').trim();

        if (duplicateParent) {
          if (duplicateText) {
            duplicateParent.replaceChild(doc.createTextNode(duplicateText), link);
          } else {
            duplicateParent.removeChild(link);
            pruneEmptyContainers(duplicateParent);
          }
        }
        return;
      }

      var source = decodePakoPayload(payload);
      if (!source) return;

      seenMermaidPayloads[payload] = true;

      var pre = doc.createElement('pre');
      pre.setAttribute('data-mermaid-source', 'true');
      pre.textContent = source;

      if (link.parentNode) {
        link.parentNode.replaceChild(pre, link);
      }
    });

    // Replace embedded base64 image payloads with stable placeholders.
    doc.querySelectorAll('img[src^="data:image/"]').forEach(function (img) {
      var src = img.getAttribute('src') || '';
      if (!src) return;

      var contextText = (img.getAttribute('alt') || '') + ' ' +
        (img.getAttribute('title') || '') + ' ' +
        (img.getAttribute('class') || '');

      var label = /mermaid/i.test(contextText)
        ? 'mermaid diagram preview omitted'
        : 'embedded image omitted (base64 payload removed)';

      var placeholder = doc.createElement('span');
      placeholder.setAttribute('data-mermaid-image-placeholder', label);
      placeholder.textContent = '\u200B';

      if (img.parentNode) {
        img.parentNode.replaceChild(placeholder, img);
      }
    });
  }
};