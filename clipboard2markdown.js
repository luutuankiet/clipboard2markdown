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
      var markdown = convert(html);
      insert(output, markdown);
      wrapper.classList.remove('hidden');
      output.focus();
      output.select();
    }, 200);
  });
});