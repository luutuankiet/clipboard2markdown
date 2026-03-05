// src/platforms/google-sheets.js
// Handles tables copied from Google Sheets

export default {
  rules: [
    // Google Sheets-specific rules can be added here if needed
  ],
  sanitizer: function (doc) {
    // ===========================================
    // DETECTION: Only process Google Sheets content
    // ===========================================
    var sheetsTables = doc.querySelectorAll('table[data-sheets-root]');
    if (sheetsTables.length === 0) {
      return; // Not Google Sheets content, skip
    }

    // Process all Google Sheets tables
    sheetsTables.forEach(function (table) {
      
      // ===========================================
      // LINE BREAK FIX: Preserve <br> in table cells via placeholder
      // MUST happen BEFORE we manipulate the grid structure.
      //
      // Special handling for <br> inside links:
      // Google Sheets puts <br> INSIDE <a> tags: <a href="...">text<br></a>
      // This causes the <br> to appear in the link text: [text<br>](url)
      // We move such <br> outside the link first.
      // ===========================================
      
      // First: move <br> from inside links to after the link
      table.querySelectorAll('a br').forEach(function (br) {
        var link = br.closest('a');
        if (link && link.parentNode) {
          // Move <br> to after the link
          link.parentNode.insertBefore(br, link.nextSibling);
        }
      });
      
      // Then: replace remaining <br> in cells with placeholder
      // Also preserve leading whitespace after <br> (indentation)
      table.querySelectorAll('td br, th br').forEach(function (br) {
        var next = br.nextSibling;
        // If next sibling is a text node with leading spaces, protect them
        if (next && next.nodeType === 3) {
          var text = next.textContent;
          var leadingSpaces = text.match(/^[ \t]+/);
          if (leadingSpaces) {
            // Replace each space with placeholder to prevent HTML normalization
            var preserved = leadingSpaces[0].replace(/ /g, '{{GS_SPACE}}').replace(/\t/g, '{{GS_TAB}}');
            next.textContent = preserved + text.slice(leadingSpaces[0].length);
          }
        }
        br.replaceWith('{{TABLE_BR}}');
      });
      
      // Clean up cells that contain ONLY the placeholder (empty cells with just <br>)
      // These should become truly empty
      table.querySelectorAll('td, th').forEach(function (cell) {
        if (cell.textContent.trim() === '{{TABLE_BR}}') {
          cell.textContent = '';
        }
      });
      
      // ===========================================
      // SQL/LITERAL SAFETY: Protect [ ], and ` in Sheets table cells
      // Turndown escapes these characters aggressively (\[, \], \`) which
      // corrupts SQL snippets copied from Sheets.
      // ===========================================
      table.querySelectorAll('td, th').forEach(function (cell) {
        var cellWalker = doc.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
        var cellTextNodes = [];
        while (cellWalker.nextNode()) {
          cellTextNodes.push(cellWalker.currentNode);
        }
        cellTextNodes.forEach(function (textNode) {
          if (!textNode.textContent) return;
          textNode.textContent = textNode.textContent
            .replace(/\[/g, '{{GS_LBRACK}}')
            .replace(/\]/g, '{{GS_RBRACK}}')
            .replace(/`/g, '{{GS_BKTICK}}');
        });
      });

      // ===========================================
      // PIPE ESCAPE: Replace | in link text with placeholder
      // Markdown tables use | as column separator. If link text contains |,
      // it breaks the table structure: [text | more](url) splits the cell.
      // We use a placeholder that converter.js will convert to \| in post-processing.
      // ===========================================
      table.querySelectorAll('a').forEach(function (link) {
        // Get all text nodes inside the link and replace pipes with placeholder
        var walker = doc.createTreeWalker(link, NodeFilter.SHOW_TEXT, null, false);
        var textNodes = [];
        while (walker.nextNode()) {
          textNodes.push(walker.currentNode);
        }
        textNodes.forEach(function (textNode) {
          if (textNode.textContent.indexOf('|') !== -1) {
            textNode.textContent = textNode.textContent.replace(/\|/g, '{{PIPE}}');
          }
        });
      });
      
      // ===========================================
      // UNWRAP DIVS: Google Sheets wraps cell content in <span><div>...</div></span>
      // This causes unwanted line breaks in Markdown output.
      // ===========================================
      table.querySelectorAll('td div, th div').forEach(function (div) {
        // Replace div with its text content
        div.replaceWith(div.textContent);
      });
      
      // ===========================================
      // INLINE STYLE CONVERSION: Bold and Italic spans → semantic tags
      // Google Sheets uses inline styles (font-weight:bold, font-style:italic)
      // instead of <strong>/<em> tags. Turndown only recognizes semantic tags.
      // ===========================================
      table.querySelectorAll('span[style]').forEach(function (span) {
        var style = span.getAttribute('style') || '';
        var isBold = /font-weight\s*:\s*bold/i.test(style) || /font-weight\s*:\s*700/i.test(style);
        var isItalic = /font-style\s*:\s*italic/i.test(style);
        
        if (isBold && isItalic) {
          // Bold + Italic: wrap in <strong><em>
          var strong = doc.createElement('strong');
          var em = doc.createElement('em');
          while (span.firstChild) {
            em.appendChild(span.firstChild);
          }
          strong.appendChild(em);
          span.replaceWith(strong);
        } else if (isBold) {
          // Bold only: convert span to <strong>
          var strongEl = doc.createElement('strong');
          while (span.firstChild) {
            strongEl.appendChild(span.firstChild);
          }
          span.replaceWith(strongEl);
        } else if (isItalic) {
          // Italic only: convert span to <em>
          var emEl = doc.createElement('em');
          while (span.firstChild) {
            emEl.appendChild(span.firstChild);
          }
          span.replaceWith(emEl);
        }
        // Non-bold/italic spans are left as-is (will be handled by Turndown)
      });
      
      // ===========================================
      // ROWSPAN/COLSPAN FLATTENING
      // 
      // Strategy: Treat each cell as ONE logical column regardless of colspan.
      // For rowspan, inject empty placeholder cells in subsequent rows.
      //
      // This collapses a "7-physical-column" table with colspans into
      // a "5-logical-column" table that matches the visual appearance.
      // ===========================================
      
      var rows = Array.prototype.slice.call(table.querySelectorAll('tr'));
      
      // First, determine logical column count from header row
      // (count cells, not physical columns)
      var headerRow = rows[0];
      var headerCells = headerRow ? Array.prototype.slice.call(headerRow.querySelectorAll('td, th')) : [];
      var logicalColCount = headerCells.length;
      
      // Build a rowspan tracker: for each logical column, track how many rows it spans
      // rowspanTracker[colIndex] = number of remaining rows this cell spans
      var rowspanTracker = [];
      for (var i = 0; i < logicalColCount; i++) {
        rowspanTracker.push(0);
      }
      
      // Process each row
      rows.forEach(function (row, rowIndex) {
        var cells = Array.prototype.slice.call(row.querySelectorAll('td, th'));
        var newCells = [];
        var cellIndex = 0;
        
        for (var col = 0; col < logicalColCount; col++) {
          if (rowspanTracker[col] > 0) {
            // This column is still covered by a rowspan from above
            // Insert empty placeholder
            var placeholder = doc.createElement(rowIndex === 0 ? 'th' : 'td');
            newCells.push(placeholder);
            rowspanTracker[col]--;
          } else if (cellIndex < cells.length) {
            // Use the next available cell
            var cell = cells[cellIndex];
            var rowspan = parseInt(cell.getAttribute('rowspan')) || 1;
            
            // Track rowspan for subsequent rows
            if (rowspan > 1) {
              rowspanTracker[col] = rowspan - 1;
            }
            
            // Create clean cell with content
            var newCell = doc.createElement(rowIndex === 0 ? 'th' : 'td');
            newCell.innerHTML = cell.innerHTML;
            newCells.push(newCell);
            cellIndex++;
          } else {
            // No more cells, fill with empty
            var emptyCell = doc.createElement(rowIndex === 0 ? 'th' : 'td');
            newCells.push(emptyCell);
          }
        }
        
        // Replace row contents
        while (row.firstChild) {
          row.removeChild(row.firstChild);
        }
        newCells.forEach(function (cell) {
          row.appendChild(cell);
        });
      });

      // ===========================================
      // CLEANUP: Remove Google-specific cruft
      // ===========================================
      table.querySelectorAll('colgroup').forEach(function (cg) { cg.remove(); });
      table.querySelectorAll('table, tr, td, th').forEach(function (el) {
        el.removeAttribute('style');
        el.removeAttribute('rowspan');
        el.removeAttribute('colspan');
      });
      table.removeAttribute('data-sheets-root');
      table.removeAttribute('data-sheets-baot');
      table.removeAttribute('cellspacing');
      table.removeAttribute('cellpadding');
      table.removeAttribute('dir');
      table.removeAttribute('style');
    });

    // Remove Google's injected <style> tags
    doc.querySelectorAll('style').forEach(function (s) { s.remove(); });
  }
};