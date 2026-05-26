# Changesets

This monorepo uses [Changesets](https://github.com/changesets/changesets) in **fixed mode** — every `@agent-devtools/*` publishable package shares one version line and is released together. The configuration lives in `.changeset/config.json`.

## Why fixed mode

Adapters, `@agent-devtools/core`, and the widget-core package speak a tightly coupled wire protocol over SSE. Independent versioning let `@agent-devtools/vite@0.1.0` ship into the wild pinning `core@0.1.0` while `@agent-devtools/react@0.3.0` pulled `core@0.3.0`, producing a dual-core install. Fixed mode forces the entire family to ship together so install topology stays consistent.

## Workflow

1. Make your code change.
2. Run `pnpm changeset` and describe the change. Pick the highest severity that fits — fixed mode bumps every publishable package by that severity together.
3. Commit the generated `.changeset/<name>.md` along with your code change.
4. On merge to `main`, CI runs `pnpm changeset version` (consumes the changeset, bumps every package, writes CHANGELOGs), commits the version bump with `[skip ci]`, then runs `pnpm changeset publish`.
5. On `develop`, CI publishes snapshot releases tagged `beta` without committing version bumps.

## Notes

- `examples/*`, `packages/e2e`, and `docs/` are listed in `ignore` — they are private/non-published.
- Internal `@agent-devtools/*` dependencies are pinned exactly (`workspace:*`) so a consumer never installs two cores side-by-side.
