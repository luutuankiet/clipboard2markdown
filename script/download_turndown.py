#!/usr/bin/env python3
"""Download Turndown.js and GFM plugin for local vendoring."""

import urllib.request

FILES = [
    ("https://unpkg.com/turndown/dist/turndown.js", "turndown.js"),
    ("https://unpkg.com/turndown-plugin-gfm/dist/turndown-plugin-gfm.js", "turndown-plugin-gfm.js"),
]

for url, filename in FILES:
    print(f"Downloading {filename}...")
    urllib.request.urlretrieve(url, filename)
    print(f"  ✓ Saved to {filename}")

print("\nDone! You can delete this script now.")