# The clipboard command expands Excalidraw links over the network

Supersedes `0002-diagrams-mode-network-reads` for the CLI clipboard command
only. The page keeps the rule 0002 set: only its MD -> MD (diagrams) mode
touches the network.

Until now `c2m` with no subcommand made no network requests, and turning share
links into Mermaid was a second, manual step (`c2m diagrams expand`). The
clipboard command is usually run from a keyboard macro, and the second step was
being forgotten: an agent then received Markdown whose diagrams it could not
read.

Decision: when the clipboard command converts rich text to Markdown, it sends
one read-only `GET https://json.excalidraw.com/api/v2/<id>` per distinct share
link and inserts the Mermaid reading copy under the link. The key in the link's
`#` fragment is never sent; the scene is decrypted locally. Nothing from the
clipboard is uploaded. Markdown -> HTML makes no request: it only removes
generated reading copies. `--no-diagrams` restores zero network use.

Because a macro waits on the command, the downloads run at the same time, each
attempt has a 3s timeout, a timeout, network error, `429` or `5xx` is retried
twice (after 250ms, then 750ms), and the whole step gives up after 6s. A link
that still fails is left as written, and one line on stdout says what was
skipped, so the macro can notify only when stdout is not empty.

Rejected: keeping expansion opt-in (`--diagrams`). The point is that the macro
user gets readable diagrams without remembering anything; an opt-in flag is the
same forgotten step moved.

The page, `index.html` and its privacy note are unchanged. The README's privacy
line and the hard constraint in AGENTS.md were reworded in the same change.
