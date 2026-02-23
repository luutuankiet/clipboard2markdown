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
      // ===========================================
      // JIRA: Comment thread separator — === Thread X ===
      // Returns raw text to bypass Turndown's escape pass (which would produce \=== ...)
      // ===========================================
      name: 'jiraThreadSeparator',
      filter: function (node) {
        return node.nodeName === 'P' && node.hasAttribute('data-jira-thread');
      },
      replacement: function (content, node) {
        return '\n\n' + node.getAttribute('data-jira-thread') + '\n\n';
      }
    },
    {
      // ===========================================
      // JIRA: Comment annotation — *[ID ↩ parent] Author - Date (edited)*
      // Returns raw text to bypass Turndown's escape pass (which would produce \[ID\])
      // ===========================================
      name: 'jiraCommentAnnotation',
      filter: function (node) {
        return node.nodeName === 'P' && node.hasAttribute('data-jira-annotation');
      },
      replacement: function (content, node) {
        return '\n\n*' + node.getAttribute('data-jira-annotation') + '*\n\n';
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
        href = match[1];
        a.setAttribute('href', href);
      }
      // Strip title when it duplicates href — Jira sets title=href as a tooltip,
      // which Turndown renders as [text](url "url") with a redundant title.
      if (a.getAttribute('title') === href) {
        a.removeAttribute('title');
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
    // JIRA: Remove <colgroup> elements from tables
    // turndown-plugin-gfm's isFirstTbody() checks previousSibling — a <colgroup>
    // before <tbody> causes it to return false, breaking GFM table conversion.
    // <colgroup> only controls column widths which markdown can't represent anyway.
    // ===========================================
    doc.querySelectorAll('table colgroup').forEach(function (colgroup) {
      colgroup.remove();
    });

    // ===========================================
    // JIRA: Remove comment footer sections
    // Footers contain action buttons and emoji reactions (e.g., <ul><li><br></li></ul>)
    // which produce empty bullet artifacts ("-") in the markdown output.
    // ===========================================
    doc.querySelectorAll('[data-testid$="-footer"]').forEach(function (el) {
      el.remove();
    });

    // ===========================================
    // JIRA: Comment thread annotations
    // Converts activity feed comment headers into structured italic annotations.
    // Format: *[ID] Author · Date (edited)*  and  *[ID ↩ parentID] Author · Date*
    //
    // Handles three cases:
    //   1. Full activity feed (comment-in-view-wrapper structure)
    //   2. Partial copy (comment-base-item nesting only)
    //   3. Stripped header (IDs only, no author/date)
    //
    // Guarded by activity-feed wrapper — ticket descriptions are untouched.
    // ===========================================
    if (doc.querySelector('[data-testid="issue-activity-feed.feed-display-with-intersection-observer"]')) {
      var processedThreadIds = new Set();

      // Pass 1a: === Thread X === separators — full view (comment-in-view-wrapper)
      doc.querySelectorAll('[data-componentid^="issue-comment-base.ui.comment.comment-in-view-wrapper"]').forEach(function (wrapper) {
        var isTopLevel = !wrapper.closest('[data-testid="issue-view-activity-comment.comment-reply-wrapper.reply-container"]');
        if (!isTopLevel) return;
        var match = wrapper.getAttribute('data-componentid').match(/comment-in-view-wrapper\.(\d+)/);
        if (!match || processedThreadIds.has(match[1])) return;

        if (processedThreadIds.size > 0) {
          var hr = doc.createElement('hr');
          wrapper.parentNode.insertBefore(hr, wrapper);
        }
        var sep = doc.createElement('p');
        sep.setAttribute('data-jira-thread', '=== Thread ' + match[1] + ' ===');
        sep.textContent = '\u200B'; // prevent Turndown blank-node pruning
        wrapper.parentNode.insertBefore(sep, wrapper);
        processedThreadIds.add(match[1]);
      });

      // Pass 1b: === Thread X === separators — partial copy (comment-base-item nesting)
      if (processedThreadIds.size === 0) {
        doc.querySelectorAll('[data-testid^="comment-base-item-"]').forEach(function (item) {
          if (item.parentNode.closest('[data-testid^="comment-base-item-"]')) return; // nested, skip
          var match = item.getAttribute('data-testid').match(/comment-base-item-(\d+)/);
          if (!match || processedThreadIds.has(match[1])) return;

          if (processedThreadIds.size > 0) {
            var hr = doc.createElement('hr');
            item.parentNode.insertBefore(hr, item);
          }
          var sep = doc.createElement('p');
          sep.setAttribute('data-jira-thread', '=== Thread ' + match[1] + ' ===');
          sep.textContent = '\u200B'; // prevent Turndown blank-node pruning
          item.parentNode.insertBefore(sep, item);
          processedThreadIds.add(match[1]);
        });
      }

      // Pass 2: Replace each comment header with italic annotation
      doc.querySelectorAll('[data-testid*="ak-comment."][data-testid$="-header"]').forEach(function (headerEl) {
        var idMatch = headerEl.getAttribute('data-testid').match(/ak-comment\.(\d+)-header/);
        if (!idMatch) return;
        var commentId = idMatch[1];

        // Author — use aria-label for robustness across Jira versions
        var authorEl = headerEl.querySelector('[aria-label^="More information about"]');
        var author = authorEl
          ? authorEl.getAttribute('aria-label').replace('More information about ', '')
          : '';

        // Date — the span with aria-hidden="false" and role="presentation"
        var dateEl = headerEl.querySelector('[role="presentation"][aria-hidden="false"]');
        var date = dateEl ? dateEl.textContent.trim() : '';

        // Edited — tooltip container is present and non-empty only when edited
        var tooltipEl = headerEl.querySelector('[data-testid="issue-comment-base.ui.comment.ak-tool-tip--container"]');
        var isEdited = !!(tooltipEl && tooltipEl.textContent.trim().length > 0);

        // Parent ID — method 1: reply-container → enclosing wrapper (full view)
        var parentId = null;
        var replyContainer = headerEl.closest('[data-testid="issue-view-activity-comment.comment-reply-wrapper.reply-container"]');
        if (replyContainer) {
          var parentWrapper = replyContainer.parentNode.closest('[data-componentid^="issue-comment-base.ui.comment.comment-in-view-wrapper"]');
          if (parentWrapper) {
            var pMatch = parentWrapper.getAttribute('data-componentid').match(/comment-in-view-wrapper\.(\d+)/);
            parentId = pMatch ? pMatch[1] : null;
          }
        }

        // Parent ID — method 2: comment-base-item nesting (partial copies)
        if (!parentId) {
          var myItem = doc.querySelector('[data-testid="comment-base-item-' + commentId + '"]');
          if (myItem) {
            var parentItem = myItem.parentNode.closest('[data-testid^="comment-base-item-"]');
            if (parentItem) {
              var piMatch = parentItem.getAttribute('data-testid').match(/comment-base-item-(\d+)/);
              parentId = piMatch ? piMatch[1] : null;
            }
          }
        }

        // Build annotation — use data-attr to bypass Turndown's escape pass
        // (textContent would produce \[ID\] and \=== ... from Turndown's escape)
        // Use '-' directly: post-processing escape() converts \u00B7 to '-' anyway
        var idPart = '[' + commentId + (parentId ? ' ↩ ' + parentId : '') + ']';
        var parts = [idPart];
        if (author) parts.push(author);
        if (date) { parts.push('-'); parts.push(date); }
        if (isEdited) parts.push('(edited)');

        var annotationEl = doc.createElement('p');
        annotationEl.setAttribute('data-jira-annotation', parts.join(' '));
        annotationEl.textContent = '\u200B'; // prevent Turndown blank-node pruning

        headerEl.parentNode.insertBefore(annotationEl, headerEl);
        headerEl.remove();
      });
    }

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