// src/platforms/slack.js

export default {
  rules: [
    {
      name: 'slackImages',
      filter: function (node) {
        return node.nodeName === 'IMG' && 
               node.getAttribute('src') && 
               node.getAttribute('src').includes('a.slack-edge.com');
      },
      replacement: function () {
        return '';
      }
    },
    // ===========================================
    // SLACK: Message header — raw output bypasses Turndown escape
    // Prevents "Name  [Time]" → "Name  \[Time\]" escaping
    // Uses data-attr + \u200B sentinel (DECISION-010)
    // ===========================================
    {
      name: 'slackMessageHeader',
      filter: function (node) {
        return node.nodeName === 'SPAN' && node.hasAttribute('data-slack-header');
      },
      replacement: function (content, node) {
        return node.getAttribute('data-slack-header');
      }
    },
    // ===========================================
    // SLACK: Reply message header — annotated with ↩ prefix
    // Applied to headers inside reply containers (after Thread_separator)
    // ===========================================
    {
      name: 'slackReplyHeader',
      filter: function (node) {
        return node.nodeName === 'SPAN' && node.hasAttribute('data-slack-reply-header');
      },
      replacement: function (content, node) {
        return '*(↩ reply)* ' + node.getAttribute('data-slack-reply-header');
      }
    },
    // ===========================================
    // SLACK: Thread separator — "N replies" span → italic label
    // ===========================================
    {
      name: 'slackThreadSeparator',
      filter: function (node) {
        return node.nodeName === 'SPAN' && node.hasAttribute('data-slack-thread-sep');
      },
      replacement: function (content, node) {
        return '*[thread: ' + node.getAttribute('data-slack-thread-sep') + ']*';
      }
    },
    // ===========================================
    // SLACK: Unfurl annotation header
    // Labels Jira/other attachments so agents know they're not message content
    // ===========================================
    {
      name: 'slackUnfurlHeader',
      filter: function (node) {
        return node.nodeName === 'P' && node.hasAttribute('data-slack-unfurl');
      },
      replacement: function (content, node) {
        return '\n\n*[' + node.getAttribute('data-slack-unfurl') + ' unfurl]*\n\n';
      }
    }
  ],
  sanitizer: function (doc) {
    var body = doc.body || doc.documentElement;

    // ===========================================================
    // FIX 2 (Step A): Thread separator — mark reply containers
    // Must run before Fix 1 header-wrapping so isReply detection works
    // ===========================================================
    var separator = doc.querySelector('[id$="-Thread_separator"]');
    if (separator) {
      // Transform "N replies" span into sentinel
      var replySpan = separator.querySelector('span');
      if (replySpan) {
        var replyText = replySpan.textContent.trim();
        replySpan.setAttribute('data-slack-thread-sep', replyText);
        replySpan.textContent = '\u200B'; // sentinel: prevents Turndown blank-node pruning
      }
      // Mark all containers that follow the separator as reply containers
      var sibling = separator.nextElementSibling;
      while (sibling) {
        sibling.setAttribute('data-slack-is-reply', 'true');
        sibling = sibling.nextElementSibling;
      }
    }

    // ===========================================================
    // FIX 1: Wrap message headers to prevent bracket escaping
    // Pattern: "Name  [HH:MM AM/PM]" text node immediately followed by <br>
    // Normalizes &nbsp; to space, stores in data-attr, returns raw via rule
    // ===========================================================
    var walker = doc.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */, null, false);
    var headerNodes = [];
    var textNode;
    while ((textNode = walker.nextNode())) {
      var text = textNode.textContent;
      // Match: "Name  [time]" — any text ending with a bracketed timestamp
      if (/^.+?\s+\[.+\]$/.test(text.trim())) {
        var next = textNode.nextSibling;
        if (next && next.nodeName === 'BR') {
          headerNodes.push(textNode);
        }
      }
    }
    headerNodes.forEach(function (node) {
      // Normalize non-breaking spaces (\u00A0 from &nbsp;) to regular spaces
      var headerText = node.textContent.replace(/\u00a0/g, ' ').trim();
      var span = doc.createElement('span');

      // FIX 2 (Step B): check ancestry for reply containers
      var ancestor = node.parentNode;
      var isReply = false;
      while (ancestor && ancestor !== body) {
        if (ancestor.hasAttribute && ancestor.hasAttribute('data-slack-is-reply')) {
          isReply = true;
          break;
        }
        ancestor = ancestor.parentNode;
      }

      if (isReply) {
        span.setAttribute('data-slack-reply-header', headerText);
      } else {
        span.setAttribute('data-slack-header', headerText);
      }
      span.textContent = '\u200B'; // sentinel: prevents Turndown blank-node pruning
      node.parentNode.replaceChild(span, node);
    });

    // ===========================================================
    // FIX 3: Annotate unfurl attachments
    // Adds "*[Service unfurl]*" header so agents know these are attachments,
    // not part of the message body
    // ===========================================================
    doc.querySelectorAll('.c-message_attachment_v2').forEach(function (unfurl) {
      // Extract service name from attribution footer link
      var attribution = unfurl.querySelector('.c-message_attachment_v2__attribution');
      var serviceLink = attribution ? attribution.querySelector('a') : null;
      var serviceName = serviceLink
        ? (serviceLink.getAttribute('title') || serviceLink.textContent.trim())
        : 'Unfurl';

      // Insert annotation at the top of the unfurl card
      var annotation = doc.createElement('p');
      annotation.setAttribute('data-slack-unfurl', serviceName);
      annotation.textContent = '\u200B'; // sentinel
      unfurl.insertBefore(annotation, unfurl.firstChild);

      // Remove colored left-border div (produces empty output in markdown)
      var border = unfurl.querySelector('.c-message_attachment__border, .c-message_attachment_v2__border');
      if (border) border.parentNode.removeChild(border);

      // Remove attribution footer (redundant with header annotation)
      if (attribution) attribution.parentNode.removeChild(attribution);
    });
  }
};