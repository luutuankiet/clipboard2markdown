// src/platforms/google-docs.js
// Handles content copied from Google Docs

function isRobotoMono(node) {
  if (node.nodeName !== 'SPAN') return false;
  var ff = node.style && node.style.fontFamily;
  return !!(ff && ff.toLowerCase().indexOf('roboto mono') !== -1);
}

// Returns true if every non-empty piece of content in <p> is a Roboto Mono span.
// Used to detect "this paragraph is a line of code".
function isCodeParagraph(p) {
  if (p.nodeName !== 'P') return false;
  var hasCode = false;
  var nodes = p.childNodes;
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.nodeType === 3) { // TEXT_NODE
      if (node.textContent.replace(/[\u00a0\s]/g, '')) return false; // bare non-empty text
    } else if (node.nodeType === 1) { // ELEMENT_NODE
      if (node.nodeName === 'BR') continue;
      if (isRobotoMono(node)) {
        hasCode = true;
      } else if (node.textContent.replace(/[\u00a0\s]/g, '')) {
        return false; // non-empty non-code element
      }
    }
  }
  return hasCode;
}

export default {
  rules: [],
  sanitizer: function (doc) {
    if (!doc.querySelector('[id*="docs-internal-guid"]')) return;

    // -------------------------------------------------------
    // 1. Merge consecutive Roboto Mono paragraphs → <pre><code>
    //
    // Google Docs represents pasted code as a series of <p> elements
    // where every span uses font-family:'Roboto Mono'. Standalone <br>
    // siblings between code paragraphs become blank lines in the block.
    // -------------------------------------------------------
    var visited = [];
    doc.querySelectorAll('p').forEach(function (p) {
      if (visited.indexOf(p) !== -1 || !isCodeParagraph(p)) return;

      var groupNodes = [];
      var curr = p;

      while (curr) {
        if (curr.nodeType === 1 && curr.nodeName === 'P' && isCodeParagraph(curr)) {
          groupNodes.push({ blank: false, node: curr });
          visited.push(curr);
          curr = curr.nextSibling;
        } else if (curr.nodeType === 1 && curr.nodeName === 'BR') {
          // Include standalone <br> only if the next real sibling is still code
          var peek = curr.nextSibling;
          while (peek && peek.nodeType === 3 && !peek.textContent.trim()) peek = peek.nextSibling;
          if (peek && peek.nodeType === 1 && peek.nodeName === 'P' && isCodeParagraph(peek)) {
            groupNodes.push({ blank: true, node: curr });
            curr = curr.nextSibling;
          } else {
            break;
          }
        } else if (curr.nodeType === 3 && !curr.textContent.trim()) {
          curr = curr.nextSibling; // skip whitespace text nodes
        } else {
          break;
        }
      }

      if (groupNodes.length === 0) return;

      var lines = groupNodes.map(function (item) {
        return item.blank ? '' : item.node.textContent.replace(/\u00a0/g, ' ');
      });
      // Trim trailing blank lines
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

      var pre = doc.createElement('pre');
      var code = doc.createElement('code');
      code.textContent = lines.join('\n');
      pre.appendChild(code);

      groupNodes[0].node.parentNode.insertBefore(pre, groupNodes[0].node);
      groupNodes.forEach(function (item) {
        if (item.node.parentNode) item.node.parentNode.removeChild(item.node);
      });
    });

    // -------------------------------------------------------
    // 2. Convert remaining Roboto Mono spans → <code> (inline code)
    // -------------------------------------------------------
    doc.querySelectorAll('span').forEach(function (span) {
      if (!span.parentNode) return;
      if (!isRobotoMono(span)) return;
      var code = doc.createElement('code');
      code.textContent = span.textContent;
      span.parentNode.replaceChild(code, span);
    });

    // -------------------------------------------------------
    // 3. Convert bold/italic spans → semantic <strong>/<em>
    //
    // Skip spans inside headings — headings are already bold by nature;
    // wrapping in ** adds noise and breaks the `1\. ` period fix.
    // -------------------------------------------------------
    doc.querySelectorAll('span').forEach(function (span) {
      if (!span.parentNode) return;

      var ancestor = span.parentNode;
      while (ancestor && ancestor.nodeName !== 'BODY') {
        if (/^H[1-6]$/.test(ancestor.nodeName)) return; // inside heading, skip
        ancestor = ancestor.parentNode;
      }

      var fw = span.style && span.style.fontWeight;
      var fi = span.style && span.style.fontStyle;
      var isBold = fw === '700' || fw === 'bold';
      var isItalic = fi === 'italic';
      if (!isBold && !isItalic) return;

      var wrapper;
      if (isBold && isItalic) {
        var em = doc.createElement('em');
        while (span.firstChild) em.appendChild(span.firstChild);
        wrapper = doc.createElement('strong');
        wrapper.appendChild(em);
      } else if (isBold) {
        wrapper = doc.createElement('strong');
        while (span.firstChild) wrapper.appendChild(span.firstChild);
      } else {
        wrapper = doc.createElement('em');
        while (span.firstChild) wrapper.appendChild(span.firstChild);
      }
      span.parentNode.replaceChild(wrapper, span);
    });

    // -------------------------------------------------------
    // 4. Unwrap remaining plain spans (color/size/whitespace wrappers)
    // -------------------------------------------------------
    doc.querySelectorAll('span').forEach(function (span) {
      if (!span.parentNode) return;
      while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
      span.remove();
    });

    // -------------------------------------------------------
    // 5. Unwrap <p> elements inside table cells — prevents spurious newlines
    // -------------------------------------------------------
    doc.querySelectorAll('td p, th p').forEach(function (p) {
      while (p.firstChild) p.parentNode.insertBefore(p.firstChild, p);
      p.remove();
    });

    // -------------------------------------------------------
    // 6. Strip empty trailing rows (Google Docs blank placeholder rows)
    // -------------------------------------------------------
    doc.querySelectorAll('table tr').forEach(function (row) {
      var cells = row.querySelectorAll('td, th');
      var isEmpty = Array.prototype.every.call(cells, function (cell) {
        return cell.textContent.trim() === '';
      });
      if (isEmpty && cells.length > 0) row.remove();
    });

    // -------------------------------------------------------
    // 7. Promote first <tbody> row → <thead> with <th> elements
    //
    // Turndown's GFM plugin only converts <table> to markdown when
    // <thead> exists. Google Docs emits <tbody>-only tables.
    // -------------------------------------------------------
    doc.querySelectorAll('table').forEach(function (table) {
      if (table.querySelector('thead')) return;
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      var firstRow = tbody.querySelector('tr');
      if (!firstRow) return;

      firstRow.querySelectorAll('td').forEach(function (td) {
        var th = doc.createElement('th');
        while (td.firstChild) th.appendChild(td.firstChild);
        td.parentNode.replaceChild(th, td);
      });

      var thead = doc.createElement('thead');
      table.insertBefore(thead, tbody);
      thead.appendChild(firstRow);
    });

    // -------------------------------------------------------
    // 8. Strip colgroup and noisy table attributes
    // -------------------------------------------------------
    doc.querySelectorAll('colgroup').forEach(function (cg) { cg.remove(); });
    doc.querySelectorAll('table, tr, td, th').forEach(function (el) {
      el.removeAttribute('style');
      el.removeAttribute('dir');
      el.removeAttribute('align');
    });
    doc.querySelectorAll('table').forEach(function (t) {
      t.removeAttribute('cellspacing');
      t.removeAttribute('cellpadding');
    });

    // -------------------------------------------------------
    // 9. Strip id/dir/style from headings (docs-internal-guid noise)
    // -------------------------------------------------------
    doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function (h) {
      h.removeAttribute('id');
      h.removeAttribute('dir');
      h.removeAttribute('style');
    });

    // -------------------------------------------------------
    // 10. Strip dir/style/aria attrs from paragraphs and list elements
    // -------------------------------------------------------
    doc.querySelectorAll('p, li, ul, ol').forEach(function (el) {
      el.removeAttribute('dir');
      el.removeAttribute('style');
      el.removeAttribute('aria-level');
      el.removeAttribute('role');
    });

    // -------------------------------------------------------
    // 11. Remove injected <style> tags
    // -------------------------------------------------------
    doc.querySelectorAll('style').forEach(function (s) { s.remove(); });
  }
};