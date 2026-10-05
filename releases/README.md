# Release Notes Index

Append-only narrative release notes for `@luutuankiet/clipboard2markdown`.

## Authoring

- **One file per release.** Name: `vX.Y.Z.md`. No overwrites.
- **Audience:** human first, then agents picking up context six months later.
- **Structure:** TL;DR → Why → Highlights table → Mermaid diagram (when there's a flow) → Before/After example → Upgrade notes → Files changed.
- **Voice:** pitch, not changelog. If a line could be a commit subject, cut it.
- **Diagrams:** Mermaid only. GitHub renders it natively in release bodies.
- **Promotion boundary:** anything that lands in `releases/` is world-readable.

## Publishing

1. Write `releases/vX.Y.Z.md` and commit it.
2. Push a tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.

The `publish.yml` workflow then runs the tests, creates the GitHub Release from `releases/<tag>.md` via `gh release create --notes-file`, and publishes to npm with provenance. If the notes file is missing, the workflow fails loudly; there is no `--generate-notes` fallback, because empty stubs defeat the point.

The package version comes from the tag, so `package.json` doesn't need a bump first. Tags containing `-dev.` publish under the `dev` dist-tag, `-rc.` / `-beta.` / `-alpha.` under `next`, everything else under `latest`.

## Index

| Version | Date | Theme |
|---|---|---|
| [v0.2.0](v0.2.0.md) | 2026-10-05 | agents draw Excalidraw diagrams: `c2m excalidraw` |
| [v0.2.1](v0.2.1.md) | 2026-10-05 | fix: `c2m` and `c2m-diagrams` commands missing from v0.2.0 |
