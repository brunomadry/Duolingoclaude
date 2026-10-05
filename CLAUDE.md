# Aka Nihongo: notes for agents

Private PWA for learning Japanese (JLPT N5) for two Polish speakers on iPhones. Read `docs/DECISIONS.md` before changing architecture, and `docs/japonski-research.md` for the curriculum background. The original brief wins over the research report.

**Start of a new session: read `docs/HANDOFF.md`** (who you work with, deployment status, traps, open items). Keep it current when the state changes.

## Language

- UI strings are **Polish** (use correct diacritics: ą ć ę ł ń ó ś ź ż) and gender-neutral phrasing ("Ukończono", not "Ukończyłeś").
- Everything else is **English**: code, identifiers, comments, commit messages, developer docs.
- Never use the em dash style in UI copy; prefer commas, colons or new sentences.

## Code conventions

- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly` (no enums, no parameter properties, no namespaces).
- Relative imports always carry the `.ts` / `.tsx` extension (Node runs `scripts/*.ts` with native type stripping).
- Type-only imports use `import type`.
- Client code must not import `zod` or `src/shared/api.ts` at runtime (types only); the Worker and scripts may.
- Preact function components with hooks; no UI framework. Styles use the CSS tokens in `src/styles/tokens.css` (never hard-code colours in components except mascot/hanko art).
- Tap targets at least 44 px, mobile first at 390 px, respect `prefers-reduced-motion`, give every interactive element an accessible name (VoiceOver).
- Japanese text gets `lang="ja"` and the `.jp` class.
- Keep dependencies minimal; justify any new one in `docs/DECISIONS.md`.

## Layout

```
src/app        shell, router, settings sheet, PWA registration
src/screens    top-level screens
src/ui         small reusable components
src/state      app controller (app.ts) and tiny store
src/data       IndexedDB schema (db.ts), local writes + outbox (repo.ts), backups
src/sync       sync engine and pure merge rules
src/srs        spaced repetition (Scheduler interface in types.ts)
src/lesson     lesson model, unlocking, romaji rules
src/lib        browser helpers (api client, speech)
src/shared     code shared with the Worker and scripts (constants, schemas)
worker         Cloudflare Worker (Hono + D1)
content        JSON content, validated by scripts/validate-content.ts
scripts        developer scripts (Node 22.18+, run directly: node scripts/x.ts)
```

## Checks

- `npm run check` runs typecheck, lint, format check, tests, contrast, content validation and build. It must pass before every commit.
- Unit tests live next to the code (`*.test.ts`); D1 tests use `tests/d1-shim.ts` (node:sqlite).
- Time and date logic must be tested in `Europe/Warsaw`, including DST transitions.

## Content rules

- Only open datasets (OpenJLPT, Tatoeba, KanjiVG, JMdict via OpenJLPT). Never copy textbook text (Genki, Minna no Nihongo, Marugoto) or Tae Kim's prose.
- Grammar notes and kana mnemonics are original, in Polish, and start as `reviewed: false`.
- The LLM is never the source of truth for grammar explanations.
