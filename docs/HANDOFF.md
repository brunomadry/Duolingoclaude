# Handoff: state of the project (read this first in a new session)

Written on 2026-10-05 at the end of the cloud build sessions, for the next AI agent working on this
repository locally on the owner's Windows PC. `CLAUDE.md` has the rules; this file has the context,
the current state and the traps. Keep it short when you update it: replace stale facts, do not append
a diary.

## 1. Who you work with

- Two Polish friends learning Japanese (JLPT N5) on iPhones. The repository owner (GitHub
  `brunomadry`) does the setup and talks to you. They are not a professional developer: give
  Windows `cmd` commands one per line, say what output to expect, and explain errors plainly.
- **Talk to them in Polish**, casually, like a friend; disagree when you have a reason and say why;
  check facts before stating them. Do not use dashes (em or en) in what you write to them. Use their
  nick only now and then.
- When they ask for a "mod" (a plugin for Claude Code or similar), always give complete files to
  replace, with everything inside the mod in English.
- Everything in the repository (code, comments, commits, docs) stays English; UI strings are Polish,
  gender-neutral, without em dashes (see `CLAUDE.md`).

## 2. What exists

All six phases from the original brief are built and merged into `main` (PR #1: phase 1, PR #2:
everything else, merged 2026-10-05). `npm run check` passes with 576 tests.

- **App:** Preact PWA (Vite, TypeScript strict) with an IndexedDB working copy and an outbox synced
  to one Cloudflare Worker (Hono + D1) that also serves the static files. Access code screen, two
  profiles, works offline after the first visit. Tabs: Dziś, Alfabet, Słówka, Gramatyka.
- **Course:** 100 lessons (`content/curriculum.json`): kana L1 to L16, 33 grammar points each with a
  practice lesson L17 to L93, kanji from L61 (2 per lesson) and kanji lessons L94 to L97, a test every
  7th lesson, L99 review of everything, L100 final test. Unlocking by local date (daily or every other
  day, Europe/Warsaw DST tested).
- **Lesson steps:** Powtórka (FSRS reviews), Nowa rzecz (kana, grammar note or kanji), Nowe słówka,
  Kanji, Ćwiczenie (choice, typing romaji with live kana, listening, sentence tiles, particle gaps,
  sentence meaning, kanji meaning and reading), Rozmowa (AI chat from L17, optional), Podsumowanie.
- **Content** (all LLM-written parts are `reviewed: false` until a person confirms them):
  687 N5 words (541 taught, 5 to 7 per lesson, 146 bonus words only in the dictionary), Polish glosses,
  486 example sentences (one per taught word from L17), 33 original Polish grammar notes with 3
  examples each, 81 kanji with Polish meanings and KanjiVG stroke order. Sources: OpenJLPT, Tatoeba,
  JMdict (supplement), KanjiVG. Never textbooks.
- **AI:** Groq first, Gemini fallback, keys only as Worker secrets. Two routes: practice sentences
  (`/api/ai/exercise`, cached in D1) and the chat (`/api/ai/chat`, correction prompt then conversation
  prompt). Every Japanese line is validated with the same word matcher and grammar gates as the
  course content; the kana reading must spell the sentence token for token. Limits 20 calls a minute,
  500 a day. **Never tested against a real model** (no keys in the cloud sandbox): the first real
  chat is still to be watched. Default models: `llama-3.3-70b-versatile` and
  `gemini-3.5-flash-lite` in `src/shared/llm.ts`; free model names change often, override with
  `vars` in `wrangler.jsonc` (see `SETUP.md` section 5).

## 3. Deployment status (where the owner stopped)

The owner downloaded a ZIP of the repository (so the folder may have **no `.git`**) to
`D:\Gry\Autorskie Arcydzieła\aplikacje\Network\Duolingoclaude-main` and went through `SETUP.md`:

- Logged in with `npx wrangler login`. A D1 database `aka-nihongo` exists in their account.
- They pasted its id into their local `wrangler.jsonc` with Notepad. **The id is not in the
  repository yet** (the file still has zeros): ask for it (`npx wrangler d1 list`, it is not a secret)
  and commit it, so fresh downloads work.
- `npm run deploy` stopped at `prettier --check` because Notepad changed the formatting of
  `wrangler.jsonc`. Fix: `npx prettier --write wrangler.jsonc`, then `npm run deploy` again.
  **The Worker has never been deployed successfully**, so there is no URL yet; the first deploy asks
  for a workers.dev subdomain.
- Not sure whether `npm run db:migrate:remote` ran: run it again, it is idempotent.
- Secrets: they ran `wrangler secret put` before any deploy, once by mistake as
  `npx wrangler secret put 67` (the name instead of the value). Check with
  `npx wrangler secret list`: there must be `APP_ACCESS_CODE` and `COOKIE_SECRET`; delete a stray
  `67` with `npx wrangler secret delete 67`. A `secret put` before the first deploy may have created
  an empty placeholder Worker; the deploy replaces it. They wanted the access code `67`: advise a
  longer one (the unlock endpoint allows 60 tries per 15 minutes in total, so 2 digits is guessable).
- Check that the folder is the full version: `docs\curriculum-words.md` must exist (a ZIP of `main`
  taken before PR #2 was merged contains only phase 1). If not, download `main` again.
- After the deploy: install on both iPhones (Safari, "Do ekranu początkowego"), then
  `docs/QA-iphone.md`. Optional AI keys: `npx wrangler secret put GROQ_API_KEY` (and
  `GEMINI_API_KEY`).
- Harmless on Windows: `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) ... async.c` after a
  failed command is a Node quirk. The folder path has spaces and `ł`; it has worked so far, but if a
  tool chokes on it, move the project to something like `D:\aka-nihongo`.
- Recommend installing Git and cloning instead of ZIPs, so you can commit and they can `git pull`.

## 4. Where things are

`CLAUDE.md` has the folder layout. The parts you will touch most:

| Topic                        | Files                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lesson planning              | `src/lesson/context.ts` (planLesson, dueReviews, reviewableCard, reviewableByCurriculum), `src/lesson/engine.ts` (pure plan builder, seeded RNG) |
| Lesson UI                    | `src/screens/lesson/LessonPlayer.tsx` and the step components next to it                                                                         |
| Word matcher                 | `src/shared/jp-words.ts` (longest-match DP tokenizer with parser states)                                                                         |
| Grammar gates, reading check | `src/shared/grammar-gates.ts` (checkTokens, readingProblems, grammarOfTokens)                                                                    |
| Content validation           | `src/shared/content-validate.ts`, `scripts/validate-content.ts`                                                                                  |
| Sentences in the app         | `src/lesson/sentences.ts` (tiles, gaps, wordPicker), `src/lesson/grammar.ts`, `src/lesson/sentence-romaji.ts`                                    |
| SRS                          | `src/srs` (Scheduler interface, ts-fsrs); card ids `kana:`, `vocab:`, `grammar:`, `kanji:`                                                       |
| Sync                         | `src/sync` (engine and pure merge rules), `src/data/repo.ts` (local writes + outbox)                                                             |
| AI                           | `worker/routes/ai.ts`, `src/shared/ai.ts` (prompts, validation), `src/shared/llm.ts`                                                             |
| Worker                       | `worker/index.ts`, `worker/routes/*`, `worker/rate-limit.ts`, `migrations/`                                                                      |

Why things are the way they are: `docs/DECISIONS.md` (per phase). Curriculum background:
`docs/japonski-research.md` (the original brief wins over it).

## 5. Traps

- **Bundle split:** `src/shared/jp-words.ts` (the matcher, about 22 KB) and the content JSON are lazy
  chunks. `src/lesson/context.ts`, `src/lesson/sentences.ts` and `src/shared/grammar-gates.ts` are in
  the main chunk, so they may only `import type` from `jp-words.ts`. Pass the lexicon in instead
  (as `readingProblems(written, reading, lexicon)` does). The client never imports `zod` or
  `src/shared/api.ts` at runtime.
- **`scripts/assign-kanji.ts` writes `content/curriculum.json`** unless run with `--dry-run`. Never
  import it from `node -e`.
- **Generated content goes through Prettier** (`scripts/write-formatted.ts`). Edit the part files,
  not the merged ones: `content/examples/part-*.json` then `node scripts/merge-examples.ts`
  (romaji is generated there, never written by hand); `content/grammar/part-*.json` then
  `node scripts/merge-grammar.ts`.
- **After moving words between lessons:** `node scripts/assign-kanji.ts --dry-run` (compare),
  `node scripts/validate-content.ts`, `node scripts/curriculum-report.ts`.
- **Check one sentence:** `node scripts/examples-tool.ts check <lesson> "<ja>" "<kana>"` must print
  "OK at lesson" and "reading OK". The kana reading has spaces between phrases, particles attached
  to the previous word.
- **Matcher changes ripple.** Before and after any change in `jp-words.ts`, tokenize every course
  sentence (examples plus grammar note examples, written and kana) and diff the results; the last
  change (kana numerals) moved exactly 7 readings, all intended. `src/shared/jp-words.test.ts` has a
  whole-corpus Tatoeba test and many regressions.
- **Kanji display rule:** a word or sentence shows kanji only when all its kanji are taught
  (`KnownKanji` context); otherwise kana with "Zapis z kanji". Tests and reviews must never show an
  untaught kanji or a word from the current lesson before its step.
- **Grammar cards** are created when a lesson is completed, not when the note is read. Due counts on
  the screens use `reviewableByCurriculum`, the player uses `reviewableCard`, so cards no exercise
  can serve never count.
- **Time:** everything date-related is tested in `Europe/Warsaw` with DST transitions.
- **Never commit secrets.** `.dev.vars` locally, `wrangler secret put` in production.

## 6. How things were tested

- `npm run check` before every commit (typecheck, lint, format, tests, contrast, content
  validation, build).
- End to end: ad hoc Playwright scripts (not in the repository) against `npm run build` plus
  `wrangler dev --port 8787` with a fresh local D1 (`rm -rf .wrangler/state` and
  `npm run db:migrate:local`). They unlock with the code from `.dev.vars`, create a profile, seed
  completed lessons and due cards through `POST /api/profiles/<id>/sync` with
  `{ changes: [{ kind: 'lesson', record }, { kind: 'card', record }] }`, clear IndexedDB, reload,
  then play a lesson by always answering (first option, typing "a", all tiles). Played this way:
  L1 to L6, L17, L29, L45, L61, L99, L100, reviews and extra practice; the only console error is the
  expected 503 from AI without keys.
- Accessibility: axe-core over 38 screen states in light and dark mode, clean.

## 7. Open items, roughly by priority

1. Finish the deployment (section 3) and commit the D1 database id.
2. Watch the first real AI chat and practice set; adjust prompts or models if the validator drops
   too much (it fails closed: no AI rather than wrong Japanese).
3. Human review of content, all still `reviewed: false`: `docs/curriculum-words.md`,
   `docs/glosses-spot-check.md`, grammar notes in the Gramatyka tab, "Zgłoś błąd" reports
   (`SETUP.md` section 6 has the query). Points the reviewers flagged for a person:
   - grammar note na-adjectives: 兄は料理が上手です (上手 about your own family sounds like
     bragging; 得意 is usual);
   - colloquial sentences to confirm: 今日は病院です, 今日は大学ですか (L20), すみません、写真お願いします
     (L23), and the style 私は学生です。あなたは？ before L61;
   - grammar used without a note: の as "one" (もっと安いのはありますか, L58), possessive の without a
     noun (父のだ, 誰のですか, L76), casual て/ないで requests without ください (L78, L79);
   - practice lessons with few examples of their own grammar: L72 (なかった), L81 (ほしい),
     L88 (でしょう);
   - 四 is taught as し but its L45 example reads よじ; consider a reading note on the card.
4. Validator heuristics: `node scripts/validate-content.ts` prints 3 "does not seem to use" warnings
   for grammar note examples (plain-da ex 3, adjectives-plain ex 2 and 3). They are hints, not errors.
5. Known small gap: the kana にほん always reads as 日本, so a sentence with 二本 read にほん fails
   the reading check (content avoids it; an AI sentence with it is dropped). 五時 ごじ and 十歳
   じゅっさい work since the kana numeral change, so content may use them now.
