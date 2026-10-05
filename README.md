# Aka Nihongo

A small private PWA for learning Japanese up to JLPT N5, made for two friends on iPhones. The UI is Polish; code and docs are English. "Aka" means red, as in the red panda mascot.

- Frontend: Vite + TypeScript + Preact, installable PWA, IndexedDB working copy.
- Backend: one Cloudflare Worker (Hono) with D1, serving the static frontend too.
- Content: open datasets (OpenJLPT, Tatoeba, KanjiVG) compiled into `content/` by scripts.

See [SETUP.md](SETUP.md) to run and deploy, [docs/DECISIONS.md](docs/DECISIONS.md) for the why, and [docs/japonski-research.md](docs/japonski-research.md) for the research behind the curriculum.

## What is inside

- **100 lessons** up to JLPT N5: hiragana and katakana with stroke order (L1-L16), 33 grammar points each with a practice lesson (L17-L93), kanji (from L61 and in L94-L97), a test every 7th lesson, a final review and a final test.
- **Lesson steps**: Powtórka (spaced repetition, FSRS), Nowa rzecz (kana, a grammar note or kanji), Nowe słówka (5 to 7 words with audio and an example sentence), Ćwiczenie (choice, typing in romaji with live kana, listening, tiles, particle gaps), Rozmowa (a short AI conversation from L17, optional), Podsumowanie.
- **Tabs**: Dziś (next lesson, reviews, extra practice, hanko stamps), Alfabet (kana and kanji charts with stroke order), Słówka (learned words, the whole N5 dictionary, search in kana, romaji or Polish), Gramatyka (notes unlocked by lessons).
- **Unlocking by date** (daily or every other day), computed locally, so there are no notifications and no penalties.
- **Two profiles**, synced through the Worker; everything works offline after the first visit.
- **AI only as a practice partner**: Groq or Gemini through the Worker, every Japanese line checked against the words and grammar the learner knows. Grammar explanations are static, original notes.

## Layout

```
src/app         shell, router, settings sheet, PWA registration
src/screens     top-level screens and the lesson player (screens/lesson)
src/ui          small reusable components
src/state       app controller and tiny store
src/data        IndexedDB, outbox, backups, lazy content loaders
src/sync        sync engine and merge rules
src/srs         spaced repetition (FSRS, Leitner fallback)
src/lesson      lesson engine, curriculum context, vocabulary, grammar, kanji, romaji
src/lib         browser helpers (API client, speech, plural)
src/shared      code shared with the Worker and scripts (schemas, word matcher, AI, LLM)
worker          Cloudflare Worker (Hono + D1)
migrations      D1 SQL migrations
content         curriculum and learning content (JSON, validated)
scripts         content pipeline and checks (Node 22, run directly)
docs            decisions, research, review sheets
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

Content scripts (see the header of each file): `import-openjlpt.ts`, `fetch-kanjivg.ts`, `generate-glosses.ts`, `merge-glosses.ts`, `gloss-spot-check.ts`, `curriculum-tool.ts`, `examples-tool.ts`, `merge-examples.ts`, `merge-grammar.ts`, `assign-kanji.ts`, `validate-content.ts`.

## Status

All six phases are built. Content written with an LLM (Polish glosses, example sentences, grammar notes, kanji meanings) is marked `reviewed: false` until a person checks it; `docs/glosses-spot-check.md` and the "Zgłoś błąd" buttons are the way in. See [docs/QA-iphone.md](docs/QA-iphone.md) for the checks to do on the phones.
