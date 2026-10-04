# Aka Nihongo

A small private PWA for learning Japanese up to JLPT N5, made for two friends on iPhones. The UI is Polish; code and docs are English. "Aka" means red, as in the red panda mascot.

- Frontend: Vite + TypeScript + Preact, installable PWA, IndexedDB working copy.
- Backend: one Cloudflare Worker (Hono) with D1, serving the static frontend too.
- Content: open datasets (OpenJLPT, Tatoeba, KanjiVG) compiled into `content/` by scripts.

See [SETUP.md](SETUP.md) to run and deploy, [docs/DECISIONS.md](docs/DECISIONS.md) for the why, and [docs/japonski-research.md](docs/japonski-research.md) for the research behind the curriculum.

## Layout

```
src/            client app (Preact)
  shared/       code shared with the Worker and scripts (constants, schemas)
  mascot/       mascot SVG parts and components
  assets/mascot generated standalone mascot SVGs (npm run mascot)
  styles/       design tokens and base CSS
  theme/        theme switching and contrast math
worker/         Cloudflare Worker (API under /api)
migrations/     D1 SQL migrations
content/        curriculum and learning content (JSON, validated)
scripts/        developer scripts (content pipeline, checks)
docs/           decisions and research
```

## Scripts

| Command                           | What it does                                      |
| --------------------------------- | ------------------------------------------------- |
| `npm run dev` / `npm run dev:api` | Vite dev server / Worker with local D1            |
| `npm run check`                   | Everything CI runs                                |
| `npm run contrast`                | WCAG AA check of all colour tokens in both themes |
| `npm run validate:content`        | Schema and cross-reference check of `content/`    |
| `npm run mascot`                  | Regenerate mascot SVGs from `src/mascot/parts.ts` |
| `npm run deploy`                  | Check, build and deploy to Cloudflare             |

## Status

Phase 0 (foundations) done. See the phase list in the original brief; progress is tracked in commit messages.
