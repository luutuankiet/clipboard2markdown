---
symptom: "A canvas edited by link shows grey image placeholders where pictures used to be"
area: diagrams (bin/diagrams.js edit)
verified: 2026-10-02
---

# EDITED_LINK_LOSES_IMAGES

excalidraw.com does not read image data from the share payload. A share link's
JSON carries the `image` elements (with their `fileId`), but the image bytes are
stored separately by excalidraw.com, keyed by the link's id. `edit` uploads a
new scene under a new id, so the new link has image elements that point at
files that do not exist for it, and they render as grey placeholders. No error
is raised anywhere.

Putting the files into the payload's `files` field does not help: a scene
uploaded with a valid PNG `dataURL` in `files` still opened as a placeholder on
excalidraw.com (checked 2026-10-02 in Firefox).

**What the code does:** `bin/diagrams.js edit` prints a warning to stderr when
the edited scene contains any image element. The reader also reports images
as `%% image` comments, so an agent sees them before editing.

**Workaround:** for canvases with pictures, have the human re-insert the images
on the new link, or make the change by hand.
