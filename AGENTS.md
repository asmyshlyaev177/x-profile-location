<!-- intent-skills:start -->

## Skill Loading

Before editing files for a substantial task:

- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# x-profile-location

**The project guide is [`CLAUDE.md`](CLAUDE.md).** Read it first — it carries the
comment and code-quality rules, what the extension does, the three-layer pipeline,
the file map, the commands, and which test suite a change owes.

Detail lives in the `CLAUDE.md` of the folder you are editing:

- `src/scripts/CLAUDE.md` — runtime: the API and its rate limit, prefetch and the
  cross-tab broker, shared cache, data types, storage keys, filters, i18n,
  snapshots, the full file inventory, and the unit-test patterns.
- `src/manifests/CLAUDE.md` — the store listing title and its 50-char cap.
- `integration/CLAUDE.md` · `visual/CLAUDE.md` · `e2e/CLAUDE.md` — the three
  browser suites and what each one is for.
- `landing/CLAUDE.md` — the site and its Lighthouse gate.
- `server/README.md` — backend choice, `/v1/stats`.

## Bedframe

This is a Bedframe cross-browser extension. `src/_config/bedframe.config.ts` is
the canonical project definition and `src/manifests/*` the manifest source — keep
the two aligned, and edit source rather than generated `dist/*`. (There is no
`mvp.yml` here; CI is `.github/workflows/tests.yml` and `lighthouse.yml`.)

Load `.claude/skills/bedframe/SKILL.md` before touching config, manifests or the
release flow. Its `references/` cover pages, scripts, Vite, testing and publish.

Day-to-day work uses the `pnpm` scripts in `CLAUDE.md`, not `bedframe` commands
directly. `pnpm install` needs pnpm 11 — see "Build & test" there before running it.
