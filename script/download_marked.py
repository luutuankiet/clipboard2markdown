#!/usr/bin/env python3
"""Download marked.js for local vendoring (MD → HTML conversion)."""

import urllib.request
import os

# Output to lib/ directory (same as turndown)
LIB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "lib")

FILES = [
    ("https://unpkg.com/marked/lib/marked.umd.js", "marked.min.js"),
]

os.makedirs(LIB_DIR, exist_ok=True)

for url, filename in FILES:
    output_path = os.path.join(LIB_DIR, filename)
    print(f"Downloading {filename}...")
    urllib.request.urlretrieve(url, output_path)
    print(f"  ✓ Saved to {output_path}")

print("\nDone! marked.js is ready in lib/")