export default {
  rules: [
    {
      name: 'confluenceCodeBlock',
      filter: function (node) {
        return node.nodeName === 'DIV' && node.classList.contains('code-block');
      },
      replacement: function (content, node) {
        // Find the <code> element inside — don't use div.textContent (includes button text)
        var codeEl = node.querySelector('code');
        var text = '';

        if (codeEl) {
          // Clone so we can manipulate without affecting DOM
          var clone = codeEl.cloneNode(true);
          // Replace <br> with newlines (from our sanitizer)
          clone.querySelectorAll('br').forEach(function(br) {
            br.replaceWith('\n');
          });
          text = clone.textContent;
          // Replace non-breaking spaces (from sanitizer) with regular spaces
          text = text.replace(/\u00A0/g, ' ');
        } else {
          text = node.textContent;
        }
        
        // Trim trailing whitespace from each line and overall
        text = text.replace(/[ \t]+$/gm, '').trim();
        return '\n\n```\n' + text + '\n```\n\n';
      }
    }
  ],
  sanitizer: function (doc) {
    // ===========================================
    // JIRA: Fix code block line breaks
    // ===========================================
    doc.querySelectorAll('[data-ds--code--code-block] code').forEach(function (codeEl) {
      // Find all line spans (Jira uses data-testid="renderer-code-block-line-N")
      var lineSpans = codeEl.querySelectorAll('[data-testid^="renderer-code-block-line-"]');
      
      if (lineSpans.length > 0) {
        // Build clean text with explicit newlines
        var lines = [];
        lineSpans.forEach(function (span) {
          // Get text content, excluding line numbers
          var lineText = '';
          span.childNodes.forEach(function (child) {
            // Skip line number spans
            if (child.nodeType === 1 && (child.classList.contains('linenumber') || 
                child.classList.contains('ds-line-number') ||
                child.hasAttribute('data-ds--line-number'))) {
              return;
            }
            lineText += child.textContent;
          });
          // Replace leading spaces with non-breaking spaces to survive HTML parsing
          lineText = lineText.replace(/^ +/g, function(match) { 
            return match.split('').map(function() { return '&nbsp;'; }).join(''); 
          });
          lines.push(lineText);
        });
        
        // Use <br> to ensure newlines survive HTML serialization/parsing
        var newHTML = lines.join('<br>');
        codeEl.innerHTML = newHTML;
      }
    });

    // ===========================================
    // JIRA/CONFLUENCE: Fix table cell <p> tags
    // ===========================================
    doc.querySelectorAll('td p, th p').forEach(function (p) {
      p.replaceWith.apply(p, Array.prototype.slice.call(p.childNodes));
    });

    // Remove empty spans that can interfere with table parsing
    doc.querySelectorAll('td span:empty, th span:empty').forEach(function (span) {
      span.remove();
    });
  }
};