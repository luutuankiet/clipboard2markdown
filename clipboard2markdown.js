import { convert } from './src/converter.js';

// ===========================================
// UI HELPERS
// ===========================================

var insert = function (myField, myValue) {
  if (document.selection) {
    myField.focus();
    var sel = document.selection.createRange();
    sel.text = myValue;
    sel.select();
  } else {
    if (myField.selectionStart || myField.selectionStart === '0') {
      var startPos = myField.selectionStart;
      var endPos = myField.selectionEnd;
      var beforeValue = myField.value.substring(0, startPos);
      var afterValue = myField.value.substring(endPos, myField.value.length);
      myField.value = beforeValue + myValue + afterValue;
      myField.selectionStart = startPos + myValue.length;
      myField.selectionEnd = startPos + myValue.length;
      myField.focus();
    } else {
      myField.value += myValue;
      myField.focus();
    }
  }
};

var escapeHtml = function (text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

var renderInlineMarkdown = function (text) {
  var codeSegments = [];
  var withCodePlaceholders = escapeHtml(text).replace(/`([^`]+)`/g, function (_, codeText) {
    var index = codeSegments.push(codeText) - 1;
    return '%%CODE_' + index + '%%';
  });

  var rendered = withCodePlaceholders
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return rendered.replace(/%%CODE_(\d+)%%/g, function (_, index) {
    return '<code>' + codeSegments[Number(index)] + '</code>';
  });
};

var splitTableCells = function (line) {
  var trimmed = line.trim();
  if (trimmed.charAt(0) === '|') {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.charAt(trimmed.length - 1) === '|') {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.split('|').map(function (cell) {
    return cell.trim();
  });
};

var isTableDividerLine = function (line) {
  var cells = splitTableCells(line);
  if (cells.length === 0) {
    return false;
  }
  return cells.every(function (cell) {
    return /^:?-{3,}:?$/.test(cell);
  });
};

var renderTable = function (headerLine, rowLines) {
  var headers = splitTableCells(headerLine);
  var rows = rowLines.map(function (line) {
    return splitTableCells(line);
  });

  var table = '<table><thead><tr>';
  headers.forEach(function (header) {
    table += '<th>' + renderInlineMarkdown(header) + '</th>';
  });
  table += '</tr></thead><tbody>';

  rows.forEach(function (row) {
    table += '<tr>';
    headers.forEach(function (_, colIndex) {
      var cell = row[colIndex] || '';
      table += '<td>' + renderInlineMarkdown(cell) + '</td>';
    });
    table += '</tr>';
  });

  table += '</tbody></table>';
  return table;
};

var isSpecialLine = function (line, nextLine) {
  var trimmed = line.trim();
  return (
    /^```/.test(trimmed) ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed) ||
    (trimmed.indexOf('|') !== -1 && typeof nextLine === 'string' && isTableDividerLine(nextLine))
  );
};

var renderMarkdownPreview = function (markdown) {
  if (!markdown) {
    return '<p><em>No markdown output yet.</em></p>';
  }

  var lines = markdown.replace(/\r\n/g, '\n').split('\n');
  var htmlParts = [];
  var i = 0;

  while (i < lines.length) {
    var line = lines[i];
    var trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      var codeLines = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      htmlParts.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      var headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      var level = headingMatch[1].length;
      htmlParts.push('<h' + level + '>' + renderInlineMarkdown(headingMatch[2]) + '</h' + level + '>');
      i += 1;
      continue;
    }

    if (trimmed.indexOf('|') !== -1 && i + 1 < lines.length && isTableDividerLine(lines[i + 1])) {
      var dataRows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().indexOf('|') !== -1 && lines[i].trim() !== '') {
        dataRows.push(lines[i]);
        i += 1;
      }
      htmlParts.push(renderTable(line, dataRows));
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      var quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      htmlParts.push('<blockquote>' + renderInlineMarkdown(quoteLines.join('<br>')) + '</blockquote>');
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      var listItems = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i += 1;
      }
      htmlParts.push('<ul>' + listItems.map(function (item) {
        return '<li>' + renderInlineMarkdown(item) + '</li>';
      }).join('') + '</ul>');
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      var orderedItems = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        orderedItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      htmlParts.push('<ol>' + orderedItems.map(function (item) {
        return '<li>' + renderInlineMarkdown(item) + '</li>';
      }).join('') + '</ol>');
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      htmlParts.push('<hr>');
      i += 1;
      continue;
    }

    var paragraphLines = [trimmed];
    i += 1;
    while (i < lines.length) {
      var nextLine = lines[i];
      var nextTrimmed = nextLine.trim();
      if (!nextTrimmed || isSpecialLine(nextTrimmed, lines[i + 1])) {
        break;
      }
      paragraphLines.push(nextTrimmed);
      i += 1;
    }
    htmlParts.push('<p>' + renderInlineMarkdown(paragraphLines.join(' ')) + '</p>');
  }

  return htmlParts.join('');
};

var buildInputPreviewDocument = function (html) {
  var bodyHtml = html || '<p><em>No HTML content captured yet.</em></p>';
  return '<!doctype html>' +
    '<html><head><meta charset="utf-8">' +
    '<style>' +
    'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.5;margin:0;padding:12px;color:#111;}' +
    'table{border-collapse:collapse;max-width:100%;}' +
    'th,td{border:1px solid #ccc;padding:6px 8px;vertical-align:top;}' +
    'pre{background:#f6f8fa;padding:10px;border-radius:6px;overflow:auto;}' +
    'img{max-width:100%;height:auto;}' +
    'code{background:#f0f3f6;padding:1px 4px;border-radius:3px;}' +
    '</style></head><body>' + bodyHtml + '</body></html>';
};

// ===========================================
// EVENT HANDLERS
// ===========================================

document.addEventListener('DOMContentLoaded', function () {
  var pastebin = document.querySelector('#pastebin');
  var output = document.querySelector('#output');
  var wrapper = document.querySelector('#wrapper');
  var copyHtmlBtn = document.querySelector('#copy-html-btn');
  var copyMdBtn = document.querySelector('#copy-md-btn');
  var togglePreviewBtn = document.querySelector('#toggle-preview-btn');
  var toggleInputBtn = document.querySelector('#toggle-input-btn');
  var copyStatus = document.querySelector('#copy-status');

  var previewPanel = document.querySelector('#preview-panel');
  var previewFrame = document.querySelector('#preview-input-frame');
  var previewRawCode = document.querySelector('#preview-raw-code');
  var markdownPreview = document.querySelector('#markdown-preview');
  var previewTabs = Array.from(document.querySelectorAll('.preview-tab'));
  var previewPanes = {
    input: document.querySelector('#preview-pane-input'),
    raw: document.querySelector('#preview-pane-raw'),
    markdown: document.querySelector('#preview-pane-markdown')
  };

  var lastPastedHtml = '';
  var lastMarkdown = '';
  var previewMode = false;
  var inputCollapsed = false;
  var activePreviewView = 'input';

  var setStatus = function (message, isError) {
    copyStatus.textContent = message;
    copyStatus.style.color = isError ? '#b42318' : '';
    if (message) {
      setTimeout(function () {
        if (copyStatus.textContent === message) {
          copyStatus.textContent = '';
          copyStatus.style.color = '';
        }
      }, 2000);
    }
  };

  var setInputCollapsed = function (collapsed, options) {
    var skipFocus = options && options.skipFocus;
    inputCollapsed = collapsed;
    pastebin.classList.toggle('hidden', collapsed);
    toggleInputBtn.textContent = collapsed ? '📥 Show Input Box' : '📥 Hide Input Box';

    if (!collapsed && !skipFocus) {
      pastebin.focus();
    }
  };

  var setPreviewView = function (viewName) {
    activePreviewView = viewName;
    previewTabs.forEach(function (tab) {
      if (tab.dataset.view === viewName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    Object.keys(previewPanes).forEach(function (paneKey) {
      if (paneKey === viewName) {
        previewPanes[paneKey].classList.add('active');
      } else {
        previewPanes[paneKey].classList.remove('active');
      }
    });
  };

  var renderPreviewViews = function (html, markdown) {
    previewRawCode.textContent = html || '';
    previewFrame.srcdoc = buildInputPreviewDocument(html);
    markdownPreview.innerHTML = renderMarkdownPreview(markdown);
  };

  var setPreviewMode = function (enabled, options) {
    var skipFocus = options && options.skipFocus;
    previewMode = enabled;
    wrapper.classList.toggle('preview-mode', enabled);
    previewPanel.classList.toggle('hidden', !enabled);
    togglePreviewBtn.textContent = enabled ? '📝 Show Markdown Output' : '👀 Show Preview';

    if (enabled) {
      setPreviewView('markdown');
    } else if (!skipFocus) {
      output.focus();
      output.select();
    }
  };

  previewTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      setPreviewView(tab.dataset.view);
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey) {
      if (String.fromCharCode(event.which).toLowerCase() === 'v') {
        pastebin.innerHTML = '';
        setInputCollapsed(false, { skipFocus: true });
        pastebin.focus();
      }
    }
  });

  pastebin.addEventListener('paste', function () {
    setTimeout(function () {
      var html = pastebin.innerHTML;
      var markdown = convert(html);

      lastPastedHtml = html;
      lastMarkdown = markdown;

      output.value = markdown;
      renderPreviewViews(html, markdown);
      setInputCollapsed(true, { skipFocus: true });

      if (!previewMode) {
        output.focus();
        output.select();
      }
    }, 200);
  });

  copyHtmlBtn.addEventListener('click', function () {
    if (!lastPastedHtml) {
      setStatus('No HTML to copy yet', true);
      return;
    }

    navigator.clipboard.writeText(lastPastedHtml).then(function () {
      setStatus('Copied raw HTML', false);
    }).catch(function (err) {
      setStatus('Failed to copy HTML', true);
      console.error('Copy HTML failed:', err);
    });
  });

  copyMdBtn.addEventListener('click', function () {
    var markdown = output.value || lastMarkdown;
    if (!markdown) {
      setStatus('No markdown to copy yet', true);
      return;
    }

    navigator.clipboard.writeText(markdown).then(function () {
      setStatus('Copied markdown', false);
    }).catch(function (err) {
      setStatus('Failed to copy markdown', true);
      console.error('Copy markdown failed:', err);
    });
  });

  toggleInputBtn.addEventListener('click', function () {
    setInputCollapsed(!inputCollapsed);
  });

  togglePreviewBtn.addEventListener('click', function () {
    if (!lastPastedHtml && !lastMarkdown) {
      setStatus('Paste content first to preview', true);
      return;
    }

    setPreviewMode(!previewMode);
  });

  setInputCollapsed(false, { skipFocus: true });
  setPreviewMode(false, { skipFocus: true });
});