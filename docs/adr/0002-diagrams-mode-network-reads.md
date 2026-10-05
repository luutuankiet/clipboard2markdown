# The diagrams mode makes read-only requests to the Excalidraw backend

Until now the page made no network requests at all, and the README promised
"no data leaves your browser". The MD -> MD (diagrams) mode cannot work that way:
an excalidraw.com share link (`https://excalidraw.com/#json=<id>,<key>`) holds
only an id and a decryption key, and the scene itself lives on
`json.excalidraw.com`. Turning a link into Mermaid means downloading it.

Decision: in the diagrams mode only, the page sends one `GET
https://json.excalidraw.com/api/v2/<id>` per distinct link in the pasted text.
The scene is decrypted in the browser with the key from the link's `#`
fragment, which the backend never sees. Nothing the user pasted is sent, and
nothing is uploaded from the page. The download endpoint answers with
`access-control-allow-origin: *`, so no proxy is involved.

The diagram code is loaded with a dynamic `import()` the first time the mode is
used, so the HTML -> MD and MD -> HTML modes neither load nor call it and still
make no requests. Uploading a new scene exists only in the agent CLIs,
`bin/diagrams.js` and `c2m excalidraw` (`bin/excalidraw.js`), which an agent
runs deliberately.

Rejected: a self-hosted backend or proxy. Client-facing links must stay plain
excalidraw.com links, and a proxy would put a server of ours in the path of
encrypted content we have no reason to see.

The trust promise is narrower than before, so the README's privacy line and the
hard constraint in AGENTS.md were reworded in the same change. A future mode
that needs the network gets its own decision record.
