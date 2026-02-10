(function () {
  'use strict';

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
  turndownService.use(turndownPluginGfm.gfm);

  // ===========================================
  // CUSTOM RULES (ported from pandoc array)
  // ===========================================

  // Superscript
  turndownService.addRule('superscript', {
    filter: 'sup',
    replacement: function (content) {
      return '^' + content + '^';
    }
  });

  // Subscript
  turndownService.addRule('subscript', {
    filter: 'sub',
    replacement: function (content) {
      return '~' + content + '~';
    }
  });

  // Line breaks - simple newline
  turndownService.addRule('lineBreak', {
    filter: 'br',
    replacement: function () {
      return '\n';
    }
  });

  // Horizontal rule
  turndownService.addRule('horizontalRule', {
    filter: 'hr',
    replacement: function () {
      return '\n\n---\n\n';
    }
  });

  // Italic - includes CSS font-style detection (Google Docs support)
  turndownService.addRule('italicCSS', {
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
  });

  // Remove Slack edge images
  turndownService.addRule('slackImages', {
    filter: function (node) {
      return node.nodeName === 'IMG' && 
             node.getAttribute('src') && 
             node.getAttribute('src').includes('a.slack-edge.com');
    },
    replacement: function () {
      return '';
    }
  });

  // Confluence/Jira style code blocks (div.code-block)
  turndownService.addRule('confluenceCodeBlock', {
    filter: function (node) {
      return node.nodeName === 'DIV' && node.classList.contains('code-block');
    },
    replacement: function (content, node) {
      return '\n\n```\n' + node.textContent + '\n```\n\n';
    }
  });

  // Fenced code blocks (PRE > CODE)
  turndownService.addRule('fencedCodeBlock', {
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
  });

  // Inline code - includes span.inline-code (Google AI/Angular apps)
  turndownService.addRule('inlineCode', {
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
  });

  // Links - with Slack team link handling
  turndownService.addRule('links', {
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
  });

  // List items - custom prefix formatting
  turndownService.addRule('listItem', {
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
  });

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

  var convert = function (str) {
    return escape(turndownService.turndown(str));
  };

  // ===========================================
  // UI HELPERS
  // ===========================================

  var insert = function (myField, myValue) {
    if (document.selection) {
      myField.focus();
      var sel = document.selection.createRange();
      sel.text = myValue;
      sel.select();
    } else {
      if (myField.selectionStart || myField.selectionStart === '0') {
        var startPos = myField.selectionStart;
        var endPos = myField.selectionEnd;
        var beforeValue = myField.value.substring(0, startPos);
        var afterValue = myField.value.substring(endPos, myField.value.length);
        myField.value = beforeValue + myValue + afterValue;
        myField.selectionStart = startPos + myValue.length;
        myField.selectionEnd = startPos + myValue.length;
        myField.focus();
      } else {
        myField.value += myValue;
        myField.focus();
      }
    }
  };

  // ===========================================
  // EVENT HANDLERS
  // ===========================================

  document.addEventListener('DOMContentLoaded', function () {
    var info = document.querySelector('#info');
    var pastebin = document.querySelector('#pastebin');
    var output = document.querySelector('#output');
    var wrapper = document.querySelector('#wrapper');

    document.addEventListener('keydown', function (event) {
      if (event.ctrlKey || event.metaKey) {
        if (String.fromCharCode(event.which).toLowerCase() === 'v') {
          pastebin.innerHTML = '';
          pastebin.focus();
          info.classList.add('hidden');
          wrapper.classList.add('hidden');
        }
      }
    });

    pastebin.addEventListener('paste', function () {
      setTimeout(function () {
        var html = pastebin.innerHTML;
        var markdown = convert(html);
        insert(output, markdown);
        wrapper.classList.remove('hidden');
        output.focus();
        output.select();
      }, 200);
    });
  });
})();