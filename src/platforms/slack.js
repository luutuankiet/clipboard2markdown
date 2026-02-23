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
    {
      name: 'slackMessageHeader',
      filter: function (node) {
        return node.nodeName === 'SPAN' && node.hasAttribute('data-slack-header');
      },
      replacement: function (content, node) {
        return node.getAttribute('data-slack-header');
      }
    },
    {
      name: 'slackReplyHeader',
      filter: function (node) {
        return node.nodeName === 'SPAN' && node.hasAttribute('data-slack-reply-header');
      },
      replacement: function (content, node) {
        return '*(↩ reply)* ' + node.getAttribute('data-slack-reply-header');
      }
    },
    {
      name: 'slackThreadSeparator',
      filter: function (node) {
        return node.nodeName === 'SPAN' && node.hasAttribute('data-slack-thread-sep');
      },
      replacement: function (content, node) {
        return '*[thread: ' + node.getAttribute('data-slack-thread-sep') + ']*';
      }
    },
    {
      name: 'slackUnfurlHeader',
      filter: function (node) {
        return node.nodeName === 'P' && node.hasAttribute('data-slack-unfurl');
      },
      replacement: function (content, node) {
        return '\n\n*[' + node.getAttribute('data-slack-unfurl') + ']*\n\n';
      }
    }
  ],

  sanitizer: function (doc) {
    var body = doc.body || doc.documentElement;

    var separator = doc.querySelector('[id$="-Thread_separator"]');
    if (separator) {
      var replySpan = separator.querySelector('span');
      if (replySpan) {
        replySpan.setAttribute('data-slack-thread-sep', replySpan.textContent.trim());
        replySpan.textContent = '\u200B';
      }

      var sibling = separator.nextElementSibling;
      while (sibling) {
        sibling.setAttribute('data-slack-is-reply', 'true');
        sibling = sibling.nextElementSibling;
      }
    }

    var walker = doc.createTreeWalker(body, 4, null, false);
    var headerNodes = [];
    var textNode;
    while ((textNode = walker.nextNode())) {
      var text = textNode.textContent;
      if (/^.+?\s+\[.+\]$/.test(text.trim())) {
        var next = textNode.nextSibling;
        if (next && next.nodeName === 'BR') {
          headerNodes.push(textNode);
        }
      }
    }

    headerNodes.forEach(function (node) {
      var headerText = node.textContent.replace(/\u00a0/g, ' ').trim();
      var span = doc.createElement('span');

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
      span.textContent = '\u200B';
      node.parentNode.replaceChild(span, node);
    });

    var parsePosterName = function (headerText) {
      if (!headerText) return '';
      var match = headerText.match(/^(.*?)\s+\[.+\]$/);
      return (match ? match[1] : headerText).trim();
    };

    var annotateCard = function (card, posterName) {
      if (!card || card.querySelector('p[data-slack-unfurl]')) return;

      var label = 'link preview';
      var serviceLink = card.querySelector('.c-message_attachment_v2__attribution a[title], a[aria-haspopup][title]');
      if (serviceLink && serviceLink.getAttribute('title')) {
        label = serviceLink.getAttribute('title').trim() + ' unfurl';
      }

      if (posterName) {
        label = label + ' by ' + posterName;
      }

      var annotation = doc.createElement('p');
      annotation.setAttribute('data-slack-unfurl', label);
      annotation.textContent = '\u200B';
      card.insertBefore(annotation, card.firstChild);

      var border = card.querySelector('.c-message_attachment__border, .c-message_attachment_v2__border');
      if (!border) {
        for (var bi = 0; bi < card.children.length; bi++) {
          var child = card.children[bi];
          if (child.style && child.style.backgroundColor === 'rgb(38, 132, 255)') {
            border = child;
            break;
          }
        }
      }
      if (border) border.parentNode.removeChild(border);

      var attr = card.querySelector('.c-message_attachment_v2__attribution');
      if (!attr) {
        var divs = card.querySelectorAll('div');
        for (var di = 0; di < divs.length; di++) {
          var d = divs[di];
          if (!d.firstChild || d.firstChild.nodeType !== 3) continue;
          if (!d.firstChild.textContent.trim().startsWith('Added by')) continue;
          if (!d.querySelector('a')) continue;
          attr = d;
          break;
        }
      }
      if (attr) attr.parentNode.removeChild(attr);
    };

    doc.querySelectorAll('span[data-slack-header], span[data-slack-reply-header]').forEach(function (headerSpan) {
      var parent = headerSpan.parentNode;
      var headerText = headerSpan.getAttribute('data-slack-header') || headerSpan.getAttribute('data-slack-reply-header') || '';
      var posterName = parsePosterName(headerText);

      var directDivs = [];
      for (var i = 0; i < parent.childNodes.length; i++) {
        if (parent.childNodes[i].nodeName === 'DIV') {
          directDivs.push(parent.childNodes[i]);
        }
      }

      for (var j = 1; j < directDivs.length; j++) {
        annotateCard(directDivs[j], posterName);
      }
    });

    var findPosterFromContext = function (node) {
      var current = node;
      while (current && current !== body) {
        if (current.querySelector) {
          var sender = current.querySelector('[data-qa="message_sender_name"], [data-qa="message_sender"], .c-message__sender_button');
          if (sender && sender.textContent) return sender.textContent.trim();
        }
        current = current.parentNode;
      }
      return '';
    };

    doc.querySelectorAll('.c-message_attachment_v2').forEach(function (card) {
      annotateCard(card, findPosterFromContext(card));
    });
  }
};