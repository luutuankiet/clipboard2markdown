(function () {
  'use strict';

  // http://pandoc.org/README.html#pandocs-markdown
  var pandoc = [
  // revert to default header markdown styles
    // {
    //   filter: 'h1',
    //   replacement: function (content, node) {
    //     var underline = Array(content.length + 1).join('=');
    //     return '\n\n' + content + '\n' + underline + '\n\n';
    //   }
    // },

    // {
    //   filter: 'h2',
    //   replacement: function (content, node) {
    //     var underline = Array(content.length + 1).join('-');
    //     return '\n\n' + content + '\n' + underline + '\n\n';
    //   }
    // },

    {
      filter: 'sup',
      replacement: function (content) {
        return '^' + content + '^';
      }
    },

    {
      filter: 'sub',
      replacement: function (content) {
        return '~' + content + '~';
      }
    },

    {
      filter: 'br',
      replacement: function () {
        return '\n'; // removes soft breaks
        // return '\\\n';
      }
    },

    {
      filter: 'hr',
      replacement: function () {
        return '\n\n---\n\n';
      }
    },

    // --- FIX #3: IMPROVED ITALIC LOGIC (Tags + CSS) ---
    {
      filter: function (node) {
        // 1. Check standard italic tags
        var tags = ['EM', 'I', 'CITE', 'VAR'];
        if (tags.indexOf(node.nodeName) !== -1) return true;

        // 2. Check for CSS font-style="italic" (Common in Google Docs/AI output)
        if (node.style && node.style.fontStyle === 'italic') {
            return true;
        }
        
        return false;
      },
      replacement: function (content) {
        return '*' + content + '*';
      }
    },

    {
      // Specialized rule for Confluence/Jira style code blocks.
      filter: function (node) {
        // We are looking for a DIV element that has the class 'code-block'.
        return node.nodeName === 'DIV' && node.classList.contains('code-block');
      },
      replacement: function (content, node) {
        // .textContent is a powerful tool. It grabs all the text inside
        // the element, automatically stripping out all the messy inner HTML tags
        // like <span> and <button>.
        return '\n\n```\n' + node.textContent + '\n```\n\n';
      }
    },

    // --- FIX #2: IMPROVED FENCED CODE BLOCK LOGIC ---
    {
      filter: function (node) {
        // Check if it is a PRE tag
        if (node.nodeName !== 'PRE') return false;

        // Robust check: Look for a CODE tag inside, regardless of whitespace
        // node.firstChild might be text (whitespace), so we use querySelector or children
        var codeElement = node.querySelector('code');

        if (codeElement) {
          // Optional: Verify content has newlines if you strictly only want multiline blocks
          // specific to your previous logic, though often PRE+CODE implies block regardless.
          return true; // codeElement.textContent.includes('\n');
        }

        return false;
      },
      replacement: function (content, node) {
        // Robust retrieval of text content
        var codeElement = node.querySelector('code');
        var text = codeElement ? codeElement.textContent : node.textContent;

        return '\n\n```\n' + text + '\n```\n\n';
      }
    },

    // --- FIX #1: IMPROVED INLINE CODE LOGIC ---
    {
      /// inline code block
      filter: function (node) {
        var hasSiblings = node.previousSibling || node.nextSibling;
        var isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings;

        // Standard code tags
        var isStandardCode = node.nodeName === 'CODE' ||
            node.nodeName === 'KBD' ||
            node.nodeName === 'SAMP' ||
            node.nodeName === 'TT';

        // Custom Span with class 'inline-code' (Common in Google AI/Angular apps)
        var isSpanCode = node.nodeName === 'SPAN' && node.classList.contains('inline-code');

        return (isStandardCode || isSpanCode) && !isCodeBlock;
      },
      replacement: function (content) {
        return '`' + content + '`';
      }
    },

    {
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
        } else {
          return '[' + content + '](' + url + titlePart + ')';
        }
      }
    },

    {
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
    }
  ];

  // http://pandoc.org/README.html#smart-punctuation
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

  var convert = function (str) {
    return escape(toMarkdown(str, { converters: pandoc, gfm: true }));
  }

  var insert = function (myField, myValue) {
      if (document.selection) {
          myField.focus();
          sel = document.selection.createRange();
          sel.text = myValue;
          sel.select()
      } else {
          if (myField.selectionStart || myField.selectionStart == "0") {
              var startPos = myField.selectionStart;
              var endPos = myField.selectionEnd;
              var beforeValue = myField.value.substring(0, startPos);
              var afterValue = myField.value.substring(endPos, myField.value.length);
              myField.value = beforeValue + myValue + afterValue;
              myField.selectionStart = startPos + myValue.length;
              myField.selectionEnd = startPos + myValue.length;
              myField.focus()
          } else {
              myField.value += myValue;
              myField.focus()
          }
      }
  };

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
        // output.value = markdown;
        insert(output, markdown);
        wrapper.classList.remove('hidden');
        output.focus();
        output.select();
      }, 200);
    });
  });
})();