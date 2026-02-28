// src/platforms/confluence.js

export default {
  rules: [],
  sanitizer: function (doc) {
    // ===========================================
    // CONFLUENCE: Normalize code blocks to <PRE><CODE> structure
    // ===========================================
    doc.querySelectorAll('.code-block, [data-ds--code--code-block]').forEach(function (codeBlock) {
      // Find the <code> element inside the Confluence wrapper structure
      var codeElement = codeBlock.querySelector('code');
      if (!codeElement) return;

      // Extract language hint if present (e.g., data-code-lang="xml")
      var langSpan = codeBlock.querySelector('[data-code-lang]');
      var lang = langSpan ? langSpan.getAttribute('data-code-lang') : '';

      // Create standard <PRE><CODE> structure
      var pre = doc.createElement('pre');
      var code = doc.createElement('code');
      
      // Preserve language as class if present (though we output generic ``` per PROJECT.md)
      if (lang) {
        code.className = 'language-' + lang;
      }
      
      // Transfer the actual code content
      code.textContent = codeElement.textContent;
      pre.appendChild(code);

      // Replace the complex Confluence wrapper with clean structure
      codeBlock.replaceWith(pre);
    });

    // ===========================================
    // CONFLUENCE: Convert Smart Links (inline cards) to <a> tags
    // ===========================================
    doc.querySelectorAll('span[data-inline-card][data-card-url]').forEach(function (span) {
      var url = span.getAttribute('data-card-url');
      if (!url) return;

      var title = url;
      try {
        if (url.includes('/wiki/')) {
          var parts = url.split('/');
          var pagesIdx = parts.indexOf('pages');
          if (pagesIdx !== -1 && parts[pagesIdx + 2]) {
            title = decodeURIComponent(parts[pagesIdx + 2].replace(/\+/g, ' '));
          }
        } else if (url.includes('docs.google.com/spreadsheets')) {
          title = 'Google Sheet';
        } else if (url.includes('docs.google.com/document')) {
          title = 'Google Doc';
        }
      } catch (e) {}

      var anchor = doc.createElement('a');
      anchor.href = url;
      anchor.textContent = title;
      span.replaceWith(anchor);
    });

    // ===========================================
    // CONFLUENCE: Convert emoji images to text
    // ===========================================
    doc.querySelectorAll('img[data-emoji-text]').forEach(function (img) {
      var emojiText = img.getAttribute('data-emoji-text');
      if (emojiText) {
        img.replaceWith(emojiText);
      }
    });

    // ===========================================
    // CONFLUENCE: Unwrap expand containers FIRST
    // ===========================================
    doc.querySelectorAll('[data-node-type="nestedExpand"]').forEach(function (expand) {
      var content = expand.querySelector('.css-pw7jst') || expand;
      var fragment = doc.createDocumentFragment();
      while (content.firstChild) {
        var child = content.firstChild;
        // Skip empty divs (Confluence adds positioning/styling divs)
        if (child.nodeType === 1 && child.tagName === 'DIV' && !child.textContent.trim()) {
          child.remove();
          continue;
        }
        fragment.appendChild(child);
      }
      expand.replaceWith(fragment);
    });

    // ===========================================
    // CONFLUENCE: Unwrap info panels (keep content)
    // ===========================================
    doc.querySelectorAll('.ak-editor-panel').forEach(function (panel) {
      var content = panel.querySelector('.ak-editor-panel__content');
      if (content) {
        var fragment = doc.createDocumentFragment();
        while (content.firstChild) {
          fragment.appendChild(content.firstChild);
        }
        panel.replaceWith(fragment);
      } else {
        panel.remove();
      }
    });

    // ===========================================
    // CONFLUENCE: Handle colspan cells (section headers)
    // ===========================================
    doc.querySelectorAll('td[colspan], th[colspan]').forEach(function (cell) {
      var colspan = parseInt(cell.getAttribute('colspan'), 10);
      if (colspan > 1) {
        var parent = cell.parentNode;
        for (var i = 1; i < colspan; i++) {
          var emptyCell = doc.createElement(cell.tagName.toLowerCase());
          emptyCell.textContent = ' ';
          cell.after(emptyCell);
        }
        cell.removeAttribute('colspan');
      }
    });

    // ===========================================
    // CONFLUENCE: Clean up table header cells
    // ===========================================
    doc.querySelectorAll('th').forEach(function (th) {
      // Remove sorting icon figures
      th.querySelectorAll('figure').forEach(function (figure) {
        figure.remove();
      });
      
      // Collect all paragraph content and join with <br>
      var paragraphs = th.querySelectorAll('p');
      if (paragraphs.length > 0) {
        var combined = doc.createDocumentFragment();
        paragraphs.forEach(function (p, index) {
          if (index > 0) {
            var br = doc.createElement('span');
            br.textContent = '{{TABLE_BR}}';
            combined.appendChild(br);
          }
          while (p.firstChild) {
            combined.appendChild(p.firstChild);
          }
        });
        th.innerHTML = '';
        th.appendChild(combined);
      } else {
        th.querySelectorAll('div').forEach(function (div) {
          while (div.firstChild) {
            div.parentNode.insertBefore(div.firstChild, div);
          }
          div.remove();
        });
      }
    });

    // ===========================================
    // CONFLUENCE: Flatten lists inside table cells
    // ===========================================
    doc.querySelectorAll('td ul, td ol').forEach(function (list) {
      var items = Array.prototype.slice.call(list.children).filter(function(el) {
        return el.tagName === 'LI';
      });
      var fragment = doc.createDocumentFragment();
      
      items.forEach(function (li, index) {
        if (index > 0) {
          var br = doc.createElement('span');
          br.className = 'table-br-marker';
          br.textContent = '{{TABLE_BR}}';
          fragment.appendChild(br);
        }
        
        var prefix = list.tagName === 'OL' ? (index + 1) + '. ' : '• ';
        fragment.appendChild(doc.createTextNode(prefix));
        
        while (li.firstChild) {
          if (li.firstChild.nodeName === 'P') {
            var p = li.firstChild;
            while (p.firstChild) {
              fragment.appendChild(p.firstChild);
            }
            p.remove();
          } else if (li.firstChild.nodeName === 'UL' || li.firstChild.nodeName === 'OL') {
            var nestedList = li.firstChild;
            var nestedItems = Array.prototype.slice.call(nestedList.children).filter(function(el) {
              return el.tagName === 'LI';
            });
            nestedItems.forEach(function(nestedLi) {
              var nestedBr = doc.createElement('span');
              nestedBr.className = 'table-br-marker';
              nestedBr.textContent = '{{TABLE_BR}}';
              fragment.appendChild(nestedBr);
              fragment.appendChild(doc.createTextNode('  ◦ '));
              while (nestedLi.firstChild) {
                if (nestedLi.firstChild.nodeName === 'P') {
                  var np = nestedLi.firstChild;
                  while (np.firstChild) {
                    fragment.appendChild(np.firstChild);
                  }
                  np.remove();
                } else {
                  fragment.appendChild(nestedLi.firstChild);
                }
              }
            });
            nestedList.remove();
          } else {
            fragment.appendChild(li.firstChild);
          }
        }
      });
      
      // Mark this list as processed
      var wrapper = doc.createElement('span');
      wrapper.className = 'flattened-list';
      wrapper.appendChild(fragment);
      list.replaceWith(wrapper);
    });

    // ===========================================
    // CONFLUENCE: Flatten block elements in table cells
    // ===========================================
    doc.querySelectorAll('td').forEach(function (td) {
      var children = Array.prototype.slice.call(td.childNodes);
      var hasBlockContent = children.some(function(n) {
        return n.nodeName === 'P';
      });
      
      // Skip if no P tags (lists already handled)
      if (!hasBlockContent) return;
      
      var fragment = doc.createDocumentFragment();
      var isFirst = true;
      
      children.forEach(function (child) {
        if (child.nodeName === 'P') {
          // Skip empty paragraphs (nbsp only)
          var text = child.textContent.trim();
          if (text === '' || text === '\u00A0') {
            return;
          }
          if (!isFirst) {
            var br = doc.createElement('span');
            br.textContent = '{{TABLE_BR}}';
            fragment.appendChild(br);
          }
          while (child.firstChild) {
            fragment.appendChild(child.firstChild);
          }
          isFirst = false;
        } else if (child.nodeType === 1 && child.className === 'flattened-list') {
          // Already flattened list
          if (!isFirst) {
            var br = doc.createElement('span');
            br.textContent = '{{TABLE_BR}}';
            fragment.appendChild(br);
          }
          while (child.firstChild) {
            fragment.appendChild(child.firstChild);
          }
          isFirst = false;
        } else if (child.nodeType === 1) {
          // Other elements - just append
          fragment.appendChild(child.cloneNode(true));
        } else if (child.nodeType === 3 && child.textContent.trim()) {
          // Text nodes
          fragment.appendChild(child.cloneNode());
        }
      });
      
      td.innerHTML = '';
      td.appendChild(fragment);
    });

    // ===========================================
    // CONFLUENCE: Clean up single <p> in table cells
    // ===========================================
    doc.querySelectorAll('td > p:only-child, th > p:only-child').forEach(function (p) {
      p.replaceWith.apply(p, Array.prototype.slice.call(p.childNodes));
    });

    // ===========================================
    // CONFLUENCE: Handle empty table cells
    // ===========================================
    doc.querySelectorAll('td, th').forEach(function (cell) {
      var text = cell.textContent.trim();
      if (!text || text === '\u00A0') {
        cell.textContent = ' ';
      }
    });
  }
};