// src/platforms/common.js

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

    // Subscript
    {
      name: 'subscript',
      filter: 'sub',
      replacement: function (content) {
        return '~' + content + '~';
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

    // Fenced code blocks (PRE > CODE)
    {
      name: 'fencedCodeBlock',
      filter: function (node) {
        if (node.nodeName !== 'PRE') return false;
        var codeElement = node.querySelector('code');
        return !!codeElement;
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

        // Custom span.inline-code
        var isSpanCode = node.nodeName === 'SPAN' && node.classList.contains('inline-code');

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
          var index = Array.prototype.indexOf.call(parent.children, node) + 1;
          prefix = index + '. ';
          while (prefix.length < 4) {
            prefix += ' ';
          }
        }

        return prefix + content;
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
    // Generic sanitization logic can go here if needed
  }
};