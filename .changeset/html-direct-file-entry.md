---
'@agent-devtools/html': minor
---

Accept a single `.html` / `.htm` file as the CLI's positional argument, not
just a folder. Previously the runner could only serve a directory whose root
URL fell back to `index.html`, which forced the user to either rename their
sketched file or know to navigate to it manually. Now passing a file path
makes the runner serve the file's parent directory as the Vite root and
suffix the printed local URL with the file's basename, so the user lands on
that page directly.

The folder branch is unchanged — pointing at a directory still serves every
`*.html` underneath via Vite's MPA mode, with the root URL resolving to
`index.html` when present. Extension matching is case-insensitive
(`./PAGE.HTML` works) and symlinks are followed. Paths that do not exist or
files with non-HTML extensions fail fast with a one-line error pointing at
the offending path before the dev server boots.

Two small public-API additions on the package's programmatic entry support
the same auto-detection from embedder code:

- `resolveEntry(rawPath, cwd?)` — inspects a raw positional argument and
  returns `{ root, entryFile }` ready to pass straight into `runHtmlServer`.
- `runHtmlServer({ entryFile })` — new optional field, suffixed onto the
  printed URL so a programmatic caller can land on a specific page without
  reimplementing URL composition.
