export default {
  rules: [
    // ===========================================
    // JIRA: Task list items (action items with checkboxes)
    // Converts <div data-task-state="TODO/DONE"> to markdown task list
    // ===========================================
    {
      name: 'jiraTaskItem',
      filter: function (node) {
        return node.nodeName === 'DIV' && node.hasAttribute('data-task-state');
      },
      replacement: function (content, node) {
        var state = node.getAttribute('data-task-state');
        var checkbox = state === 'DONE' ? '[x]' : '[ ]';
        // Content already has inline elements converted by Turndown
        return '- ' + checkbox + ' ' + content.trim() + '\n';
      }
    },
    // ===========================================
    // JIRA: Task list container — just pass through children
    // ===========================================
    {
      name: 'jiraTaskList',
      filter: function (node) {
        return node.nodeName === 'DIV' && node.hasAttribute('data-task-list-local-id');
      },
      replacement: function (content) {
        return '\n' + content + '\n';
      }
    },
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
    // JIRA: Fix corrupted hrefs with markdown-style links
    // Jira sometimes embeds [text](url) patterns inside href attributes
    // e.g., href="[https://...](https://google.com/search?q=...)"
    // ===========================================
    doc.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      // Match pattern: [real-url](google-redirect) — extract the REAL URL from brackets
      // Jira corrupts hrefs like: [https://github.com/...](https://google.com/search?q=...)
      var match = href.match(/^\[(.*?)\]\(.*?\)$/);
      if (match) {
        a.setAttribute('href', match[1]);
      }
    });

    // ===========================================
    // JIRA: Fix inline code with embedded markdown links
    // Same corruption pattern inside <span class="code">
    // ===========================================
    doc.querySelectorAll('span.code').forEach(function (span) {
      var text = span.textContent;
      // Match pattern: [display-text](url) — keep just the display text
      var match = text.match(/^\[(.*?)\]\(.*?\)$/);
      if (match) {
        span.textContent = match[1];
      }
    });

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