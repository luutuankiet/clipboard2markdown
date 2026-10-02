Google export escaped this one: [diagram](https://excalidraw.com/#json=bound01,C0J\-T6YLyjITbqXy9z\_Kow)

<!-- excalidraw-mermaid:begin bound01 -->
```mermaid
%% generated from https://excalidraw.com/#json=bound01,C0J-T6YLyjITbqXy9z_Kow; reading copy, edits here do not change the canvas
flowchart LR
  gateway[API gateway]
  auth[Auth service]
  ledger[Ledger DB]
  gateway -->|verifies| auth
  auth -->|reads| ledger
```
<!-- excalidraw-mermaid:end bound01 -->

Trailing paragraph.
