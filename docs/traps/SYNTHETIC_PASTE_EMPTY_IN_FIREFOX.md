---
symptom: "A scripted paste into the page does nothing in Firefox; the handler sees empty clipboard data"
area: live testing (browser automation)
verified: 2026-10-02
---

# SYNTHETIC_PASTE_EMPTY_IN_FIREFOX

To test a mode without a real clipboard, a script builds a `DataTransfer`, sets
`text/plain`, and dispatches `new ClipboardEvent('paste', { clipboardData: dt })`.
In Firefox (seen on 145) the event that reaches listeners carries a different,
empty `DataTransfer`: `event.clipboardData === dt` is false and
`getData('text/plain')` returns `''`. The page's handler sees no text and does
nothing. Nothing is logged.

**Fix in the test, not the page:** create the event without `clipboardData` and
define it on the event, from a script running in the page itself (a `<script>`
element, not an extension sandbox):

```js
const dt = new DataTransfer();
dt.setData('text/plain', markdown);
const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
Object.defineProperty(ev, 'clipboardData', { value: dt });
document.querySelector('#pastebin').dispatchEvent(ev);
```

Real pastes are unaffected.
