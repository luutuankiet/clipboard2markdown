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
    // FIX 3: Generic unfurl/link-preview annotation
    //
    // Strategy: structural detection based on Fix 1's sentinel spans.
    // In ALL Slack message HTML, after the header sentinel + <br>, the
    // parent div's first <div> child = message body, any additional
    // <div> siblings = unfurl/preview cards (Jira, URL previews, etc.).
    //
    // Labeling:
    //   - Has a[aria-haspopup][title]  → "[title] unfurl"  (Jira Cloud etc.)
    //   - Otherwise                    → "link preview"    (URL/website cards)
    //
    // Also handles .c-message_attachment_v2 (search view) where Fix 1
    // sentinel is absent — detected by CSS class as fallback.
    // ===========================================================

    var annotateCard = function (card) {
      // Derive label: Jira-style service name, or generic "link preview"
      var label = 'link preview';
      var serviceLink = card.querySelector('a[aria-haspopup][title]');
      if (serviceLink) {
        label = serviceLink.getAttribute('title') + ' unfurl';
      } else {
        var attrClass = card.querySelector('.c-message_attachment_v2__attribution a[title]');
        if (attrClass) label = attrClass.getAttribute('title') + ' unfurl';
      }

      // Insert annotation sentinel at top
      var annotation = doc.createElement('p');
      annotation.setAttribute('data-slack-unfurl', label);
      annotation.textContent = '\u200B';
      card.insertBefore(annotation, card.firstChild);

      // Remove blue left-border (CSS class or inline background-color)
      var border = card.querySelector('.c-message_attachment__border, .c-message_attachment_v2__border');
      if (!border) {
        var cardChildren = Array.prototype.slice.call(card.children);
        for (var bi = 0; bi < cardChildren.length; bi++) {
          if (cardChildren[bi].style && cardChildren[bi].style.backgroundColor === 'rgb(38, 132, 255)') {
            border = cardChildren[bi];
            break;
          }
        }
      }
      if (border) border.parentNode.removeChild(border);

      // Remove Jira attribution footer (redundant with header annotation)
      var attrEl = card.querySelector('.c-message_attachment_v2__attribution');
      if (!attrEl) {
        var divs = card.querySelectorAll('div');
        for (var di = 0; di < divs.length; di++) {
          var d = divs[di];
          if (d.firstChild && d.firstChild.nodeType === 3 &&
              d.firstChild.textContent.trim().startsWith('Added by') &&
              d.querySelector('a[aria-haspopup]')) {
            attrEl = d;
            break;
          }
        }
      }
      if (attrEl) attrEl.parentNode.removeChild(attrEl);
    };

    // Path A: structural detection (channel view — relies on Fix 1 sentinels)
    doc.querySelectorAll('span[data-slack-header], span[data-slack-reply-header]').forEach(function (headerSpan) {
      var parent = headerSpan.parentNode;
      var divChildren = [];
      for (var i = 0; i < parent.childNodes.length; i++) {
        if (parent.childNodes[i].nodeName === 'DIV') divChildren.push(parent.childNodes[i]);
      }
      for (var j = 1; j < divChildren.length; j++) {
        if (!divChildren[j].querySelector('p[data-slack-unfurl]')) {
          annotateCard(divChildren[j]);
        }
      }
    });

    // Path B: .c-message_attachment_v2 (search view — Fix 1 sentinel absent)
    doc.querySelectorAll('.c-message_attachment_v2').forEach(function (card) {
      if (!card.querySelector('p[data-slack-unfurl]')) {
        annotateCard(card);
      }
    });

    var _deadStart = null; var _dead = function annotateUnfurlCard(card, attrEl) {
      var serviceLink = attrEl.querySelector('a[title]') || attrEl.querySelector('a[aria-haspopup]');
      var serviceName = serviceLink
        ? (serviceLink.getAttribute('title') || serviceLink.textContent.trim())
        : 'Unfurl';

      var annotation = doc.createElement('p');
      annotation.setAttribute('data-slack-unfurl', serviceName);
      annotation.textContent = '\u200B'; // sentinel
      card.insertBefore(annotation, card.firstChild);

      // Remove blue left-border div (CSS class or inline background-color)
      var border = card.querySelector('.c-message_attachment__border, .c-message_attachment_v2__border');
      if (!border) {
        // Channel view: border is a direct child with inline background-color
        var children = Array.prototype.slice.call(card.children);
        for (var i = 0; i < children.length; i++) {
          if (children[i].style && children[i].style.backgroundColor === 'rgb(38, 132, 255)') {
            border = children[i];
            break;
          }
        }
      }
      if (border) border.parentNode.removeChild(border);

      // Remove attribution footer (redundant with header annotation)
      attrEl.parentNode.removeChild(attrEl);
    }

    // Structure 1: .c-message_attachment_v2 (search view, has CSS class)
    var processedCards = [];
    doc.querySelectorAll('.c-message_attachment_v2').forEach(function (card) {
      var attrEl = card.querySelector('.c-message_attachment_v2__attribution');
      if (attrEl) {
        annotateUnfurlCard(card, attrEl);
        processedCards.push(card);
      }
    });

    // Structure 2: Plain divs (channel view) — detect by attribution text pattern
    // Attribution: div whose first child is text "Added by" + contains <a aria-haspopup>
    doc.querySelectorAll('div').forEach(function (div) {
      if (!div.firstChild || div.firstChild.nodeType !== 3) return;
      if (!div.firstChild.textContent.trim().startsWith('Added by')) return;
      var serviceLink = div.querySelector('a[aria-haspopup]');
      if (!serviceLink) return;

      var card = div.parentNode;
      // Skip if already processed (e.g. inside a .c-message_attachment_v2)
      for (var i = 0; i < processedCards.length; i++) {
        if (processedCards[i] === card || processedCards[i].contains(card)) return;
      }

      annotateUnfurlCard(card, div);
    });
  }
};