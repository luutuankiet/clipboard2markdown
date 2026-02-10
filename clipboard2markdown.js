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

// ===========================================
// EVENT HANDLERS
// ===========================================

document.addEventListener('DOMContentLoaded', function () {
  var info = document.querySelector('#info');
  var pastebin = document.querySelector('#pastebin');
  var output = document.querySelector('#output');
  var wrapper = document.querySelector('#wrapper');
  var copyHtmlBtn = document.querySelector('#copy-html-btn');
  var copyHtmlStatus = document.querySelector('#copy-html-status');

  // Store the last pasted HTML for fixture collection
  var lastPastedHtml = '';

  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey) {
      if (String.fromCharCode(event.which).toLowerCase() === 'v') {
        pastebin.innerHTML = '';
        pastebin.focus();
        info.classList.add('hidden');
        wrapper.classList.add('hidden');
      }
    }
  });

  pastebin.addEventListener('paste', function () {
    setTimeout(function () {
      var html = pastebin.innerHTML;
      lastPastedHtml = html; // Store for "Copy HTML" button
      var markdown = convert(html);
      output.value = markdown; // Replace content instead of appending
      wrapper.classList.remove('hidden');
      output.focus();
      output.select();
    }, 200);
  });

  // Copy Raw HTML button handler (for fixture collection)
  copyHtmlBtn.addEventListener('click', function () {
    if (!lastPastedHtml) {
      copyHtmlStatus.textContent = 'No HTML to copy yet';
      return;
    }
    navigator.clipboard.writeText(lastPastedHtml).then(function () {
      copyHtmlStatus.textContent = '✓ Copied!';
      setTimeout(function () {
        copyHtmlStatus.textContent = '';
      }, 2000);
    }).catch(function (err) {
      copyHtmlStatus.textContent = 'Failed to copy';
      console.error('Copy failed:', err);
    });
  });
});