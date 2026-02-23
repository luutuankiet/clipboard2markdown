// src/platforms/google-chat.js

export default {
  rules: [
    {
      name: 'googleChatThreadSeparator',
      filter: function (node) {
        return node.nodeName === 'P' && node.hasAttribute('data-gchat-thread');
      },
      replacement: function (content, node) {
        return '\n\n' + node.getAttribute('data-gchat-thread') + '\n\n';
      }
    },
    {
      name: 'googleChatAnnotation',
      filter: function (node) {
        return node.nodeName === 'P' && node.hasAttribute('data-gchat-annotation');
      },
      replacement: function (content, node) {
        return '\n\n*' + node.getAttribute('data-gchat-annotation') + '*\n\n';
      }
    }
  ],
  sanitizer: function (doc) {
    var body = doc.body || doc.documentElement;
    if (!body) return;

    // Guard: only run on Google Chat-like fragments
    var hasChatMarkers = !!(
      doc.querySelector('span[data-member-id]') ||
      doc.querySelector('img[src*="chat.google.com/u/0/api/get_attachment_url"]') ||
      doc.querySelector('[aria-label="External"]')
    );
    if (!hasChatMarkers) return;

    var cleanText = function (text) {
      return (text || '')
        .replace(/\u200B/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    var hasDirectBr = function (node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        if (node.childNodes[i].nodeName === 'BR') return true;
      }
      return false;
    };

    var parseHeaderMeta = function (headerEl) {
      var author = '';
      var authorCandidates = headerEl.querySelectorAll('span[role="presentation"] > span');
      for (var i = 0; i < authorCandidates.length; i++) {
        var candidate = cleanText(authorCandidates[i].textContent);
        if (!candidate) continue;
        if (candidate === ',') continue;
        if (/^edited$/i.test(candidate)) continue;
        if (/\d{1,2}:\d{2}/.test(candidate)) continue;
        if (candidate.toLowerCase() === 'domain_disabled') continue;
        author = candidate;
        break;
      }

      if (!author) {
        var fallback = headerEl.querySelector('span[role="presentation"]');
        if (fallback) {
          var fallbackText = cleanText(fallback.textContent);
          if (fallbackText && !/\d{1,2}:\d{2}/.test(fallbackText)) {
            author = fallbackText;
          }
        }
      }

      var timestamp = '';
      headerEl.querySelectorAll('span[role="presentation"]').forEach(function (span) {
        var text = cleanText(span.textContent);
        if (/\d{1,2}:\d{2}/.test(text)) {
          timestamp = text;
        }
      });

      if (!author || !timestamp) return null;

      return {
        author: author,
        timestamp: timestamp,
        edited: /\bedited\b/i.test(cleanText(headerEl.textContent)),
        external: !!headerEl.querySelector('[aria-label="External"]')
      };
    };

    var headers = [];
    doc.querySelectorAll('div').forEach(function (div) {
      if (!hasDirectBr(div)) return;
      var meta = parseHeaderMeta(div);
      if (!meta) return;

      var next = div.nextElementSibling;
      if (!next || next.nodeName !== 'DIV') return;

      headers.push({ element: div, meta: meta });
    });

    if (headers.length === 0) return;

    var rootIndex = 0;
    var replyIndex = 0;

    headers.forEach(function (item, index) {
      var headerEl = item.element;
      var meta = item.meta;
      var headerText = cleanText(headerEl.textContent);

      var hasUnreadMarker = /(^|\s)\d+\s+unread\b/i.test(headerText);
      var firstChild = headerEl.firstElementChild;
      var hasLeadingDivider = !!(
        firstChild &&
        firstChild.nodeName === 'DIV' &&
        cleanText(firstChild.textContent) === ''
      );
      var hasDatePrefix = /^[A-Za-z]{3}\s+\d{1,2},\s+\d{1,2}:\d{2}/.test(meta.timestamp);

      var startsNewRoot = index === 0 || hasUnreadMarker || hasLeadingDivider;
      if (!startsNewRoot && hasDatePrefix && replyIndex > 0) {
        startsNewRoot = true;
      }

      if (startsNewRoot) {
        rootIndex += 1;
        replyIndex = 0;

        var separatorEl = doc.createElement('p');
        separatorEl.setAttribute('data-gchat-thread', '=== Root Chat ' + rootIndex + ' ===');
        separatorEl.textContent = '\u200B';
        headerEl.parentNode.insertBefore(separatorEl, headerEl);
      } else {
        replyIndex += 1;
      }

      var roleLabel = replyIndex === 0
        ? '[root ' + rootIndex + ']'
        : '[reply ' + replyIndex + ' to root ' + rootIndex + ']';

      var parts = [roleLabel];
      if (meta.author) parts.push(meta.author);
      if (meta.external) parts.push('(external)');
      if (meta.timestamp) {
        parts.push('-');
        parts.push(meta.timestamp);
      }
      if (meta.edited) parts.push('(edited)');

      var annotationEl = doc.createElement('p');
      annotationEl.setAttribute('data-gchat-annotation', parts.join(' '));
      annotationEl.textContent = '\u200B';

      headerEl.parentNode.insertBefore(annotationEl, headerEl);
      headerEl.remove();
    });
  }
};