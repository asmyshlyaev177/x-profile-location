# `src/_config`

This folder contains Bedframe's canonical project-definition files.

## Primary file

- `bedframe.config.ts`

## Working rules

- Treat `bedframe.config.ts` as the source of truth for the project's `B.E.D.` shape.
- Read the file in this order: `browser`, `extension`, `development`.
- Keep `browser`, `extension.manifest`, and `src/manifests/*` aligned.
- Keep `extension.pages` aligned with `src/pages/*` and any manifest-declared page fields.
- Keep development settings aligned with `vite.config.ts`, `package.json`, and `.github/workflows/mvp.yml` when those settings drive tooling or release flow.

## Current project shape

- Framework: `preact`
- Language: `typescript`
- Package manager: `npm`
- Extension type: `overlay`

## Bedframe references

- Root `AGENTS.md`
- `.agents/skills/bedframe`
- `@bedframe/core`:
  - `createBedframe(...)`
  - `createManifest(...)`
  - `types.ts`
