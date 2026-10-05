# Decisions

One line per decision, newest at the bottom of each section. The brief (the original prompt) wins over `docs/japonski-research.md` wherever they differ.

## Repository and tooling

- The research report was uploaded to the repo root; it now lives at `docs/japonski-research.md` as the brief expects.
- **Single `package.json`** for frontend, Worker and scripts: two users, one deploy, no workspace overhead.
- **TypeScript 6.0, not 7.0**: `typescript-eslint` 8.x supports `<6.1`; TS 7 can come once the linter catches up.
- **Node 22.18+ native type stripping** runs `scripts/*.ts` directly, so no `tsx`/`ts-node` dependency. Imports use explicit `.ts` extensions (`allowImportingTsExtensions`, `erasableSyntaxOnly`).
- **Three tsconfigs** (app with DOM + Preact, worker with Workers types, node for scripts/tests/configs) so browser globals never leak into the Worker and vice versa.
- **`@cloudflare/workers-types`** instead of `wrangler types`: smaller diff, no generated 400 KB file in git; revisit if a needed binding is missing.
- **CI**: GitHub Actions runs `npm run check` (typecheck, lint, format, tests, contrast, content validation, build). Free for this repo.

## Dependencies (each one justified)

| Package                                                                                                     | Why                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `preact`                                                                                                    | 4 KB React-compatible UI; components and hooks without a heavy framework.                                                    |
| `hono`                                                                                                      | Tiny router for the Worker with cookie and middleware helpers; avoids hand-rolled routing.                                   |
| `idb`                                                                                                       | ~1 KB promise wrapper around IndexedDB (the client working copy).                                                            |
| `ts-fsrs`                                                                                                   | Maintained FSRS implementation from the open-spaced-repetition org (verified on npm, v5).                                    |
| `zod`                                                                                                       | Schemas for content validation and strict API request shapes. Used by scripts and the Worker; the client imports types only. |
| `vite`, `@preact/preset-vite`                                                                               | Build and dev server.                                                                                                        |
| `vite-plugin-pwa`, `workbox-window`                                                                         | Manifest, precaching service worker and the update prompt.                                                                   |
| `@vite-pwa/assets-generator`                                                                                | Generates PNG icons (Apple touch, maskable) from one SVG; iOS ignores SVG touch icons.                                       |
| `wrangler`, `@cloudflare/workers-types`                                                                     | Cloudflare Worker + D1 dev/deploy and types.                                                                                 |
| `vitest`, `fake-indexeddb`                                                                                  | Unit tests; IndexedDB in Node for sync tests.                                                                                |
| `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-config-prettier`, `globals`, `prettier` | Lint and format.                                                                                                             |

## Design

- **Fill vs text colour tokens**: the brief's `#E4472B` accent gives only 4.18:1 on `--elevated` and 3.39:1 under washi text, so it is used for graphics and borders (3:1 rule), while small text uses `--accent-text` and filled buttons use `--accent-fill` (`#BE3820`) with `--on-accent`. Same idea for `--error-text`. `npm run contrast` enforces it.
- **Display serif with zero download**: `Iowan Old Style` / `Hiragino Mincho ProN` ship with iOS; Georgia is the fallback. Nothing to self-host.
- **Seigaiha** is one neutral 1 KB SVG tile at 3 to 5% opacity, inverted for the light theme instead of shipping two tiles.
- **No-flash theme**: the active profile's theme is mirrored to `localStorage["aka.theme"]`; an inline script in `index.html` sets `data-theme` before CSS paints. If a CSP is added later, that script needs a hash.
- **Mascot "Aka"** is drawn from scratch as flat SVG parts in `src/mascot/parts.ts` (single source). `npm run mascot` writes the standalone SVGs to `src/assets/mascot/`. The app renders the same parts inline so blink and tail sway can be animated with CSS.
- **Avatars**: `plain, scarf, hat (kasa straw hat), glasses, leaf, headband (hachimaki), sakura, sleepy (nightcap)`; ids are stable keys stored on the server, labels are Polish.
- **Gender-neutral Polish** in UI copy ("Cały materiał N5" rather than "czego się nauczyłeś"), because the two users' genders are not known.

## Content

- **Licenses verified at the source** (4 Oct 2026): KanjiVG `COPYING` (CC BY-SA 3.0), OpenJLPT `LICENSE` + `NOTICE.md` (CC BY-SA 4.0; Tatoeba sentences inside it are CC BY 2.0 FR; JMdict/KANJIDIC2 CC BY-SA 4.0; Waller lists CC BY). Tae Kim's site was not reachable from the build sandbox, so its entry stays `verified: false` until checked by hand.
- **Polish glosses are a derivative of OpenJLPT's English glosses**, so `content/glosses.pl.json` is shared under CC BY-SA 4.0 (listed on the licenses screen).
- **No Tatoeba audio**: all audio is on-device `speechSynthesis`, so per-recording audio licenses never apply.
- **Curriculum vs report**: the brief's "every 7th lesson is a test" wins, so tests sit at L7, L14, ... L98. Hiragana dakuten is L6, yoon/small っ moves to L8, katakana extended sounds to L15, and L16 becomes a mixed reading review instead of a separate test.
- **Phase B** has 19 grammar points, each followed by a practice lesson (new structure, then practice + chat), skipping test slots. **Phase C** has 14 plain-form/N5 topics with the same pattern, plus kanji lessons; N5 kanji (about 2 to 3 per lesson) are attached in Phase 6 through the optional `kanji` field.
- **Content arrives phase by phase**: the validator skips cross-checks for files that do not exist yet (with a warning) and enforces every reference once a file exists.

## Phase 1: access, profiles, sync, PWA

- **Access cookie** `aka_access` = `v1.<issuedAt>.<HMAC>`; the HMAC (keyed by `COOKIE_SECRET`) also covers a fingerprint of `APP_ACCESS_CODE`, so rotating either secret signs every device out. HttpOnly, SameSite=Strict, Secure on HTTPS, 400 days (the browser cap).
- **Constant-time code check**: both codes are reduced to HMACs first, then compared byte by byte, so neither length nor prefix leaks through timing. `crypto.subtle.timingSafeEqual` is Workers-only, so a tiny portable version keeps it testable in Node.
- **Rate limits live in D1** (fixed windows, one UPSERT per hit): unlock 10 per 15 min per IP and 60 globally, sync 240 per hour per profile, reports 30 per hour per IP. No KV binding needed for two users.
- **Mutations must be `application/json`** on top of SameSite=Strict, which blocks simple cross-site form posts.
- **Client-chosen UUIDs** for profiles and reports: profiles can be created offline and every POST is an idempotent upsert.
- **Two clocks**: `updatedAt` (client) decides last-write-wins per record; `synced_at` (server) drives `?since=` pulls. Pulls report `serverTime` 5 s in the past so a write committing during a pull is fetched again; merging is idempotent, so the overlap costs nothing.
- **Ties**: the server keeps the first arrival and clients prefer the server copy on equal `updatedAt`, so all devices converge. Client stamps are monotonic per session, so one device never produces a tie with itself.
- **Timestamps more than 24 h in the future are rejected**, so a broken phone clock cannot win every conflict forever.
- **Deletion is a tombstone**: a soft-deleted profile never resurrects, other devices drop it on their next pull, and a daily cron (03:17 UTC) hard deletes it with its cards and progress after 30 days.
- **Outbox keeps only the newest entry per record key**: records are whole-record LWW, so older queued versions are useless.
- **Profile picker on every launch** (as the brief says), with the last used profile outlined in gold. A brand new device waits for the first sync before offering "create your first profile", so a second phone never duplicates a profile.
- **Max 6 profile cards and 24-character names**: two users, room for guests, layout stays a clean 2-column grid.
- **zod/mini for API schemas** (named imports, tree-shakable): the Worker validates every body with them; the client only loads them lazily for backup import (27 KB chunk instead of 381 KB). Classic `zod` stays in scripts for content validation.
- **D1 in tests = node:sqlite shim** (`tests/d1-shim.ts`): runs the real SQL (upserts, RETURNING, batches) without Miniflare or `@cloudflare/vitest-pool-workers`. A two-device end-to-end test syncs two IndexedDB databases (fake-indexeddb) through the real Worker.
- **Service worker via injectManifest** (`src/sw.ts`): precaches shell, CSS, JS (content JSON is bundled into it), icons and mascot; SPA navigations get the cached shell; `/api` is never cached; an offline page covers the "first visit while offline" case; updates wait for the "Nowa wersja, odśwież" tap.
- **iOS splash screens**: portrait only, iPhones from SE to 17 Pro Max, sumi background, not precached (iOS reads them at launch).
- **Status bar**: `black-translucent` gives the dark theme an edge-to-edge look; iOS reads it once at launch and always draws white text, so the light theme draws a thin ink band under the status bar in standalone mode. Verify on a device (QA checklist).
- **Native `<dialog>`** for the settings sheet and confirmations: focus trap, Escape and inert background for free on iOS 15.4+.
- **Export** uses the Web Share API with a file when available (iOS share sheet, "Zapisz w Plikach"), otherwise a download link. **Import** merges into the same live profile (newer record wins) or becomes a new profile with a fresh id, so it never collides with a server tombstone.

## Cloudflare setup (agent tooling)

- Installed the official Cloudflare plugin for Claude Code (`claude plugin marketplace add cloudflare/skills`, `claude plugin install cloudflare@cloudflare`), following https://developers.cloudflare.com/agent-setup/prompt.md (read from its source in `cloudflare/cloudflare-docs`, because the docs host is blocked from the build sandbox).
- Applied its Workers guidance: `compatibility_date` set to the current date, Workers Logs plus sampled Traces enabled (`observability.traces` must be enabled explicitly), and SETUP now deploys before `wrangler secret put`, since each secret put deploys a new version immediately.
- Still open: the guidance prefers `wrangler types` over a hand-written `Env`. We keep `worker/env.ts` for now (small, also documents secrets); revisit when bindings grow (Phase 5 adds AI keys).

## Phase 2: Alfabet

- **Kana schema** gained `alt` (accepted typing spellings such as si, tu, wo, nn; never shown as the answer), `col` (goju-on column, so the chart lays out や _ ゆ _ よ without hard-coded tables) and an optional Polish `note` per group (dakuten, yōon, small っ, ー).
- **Romaji is Modified Hepburn without macrons**: long vowels are written doubled (koohii), which is easier to type on a phone; macrons typed by the user are accepted.
- **Stroke order** comes from KanjiVG (all 177 kana incl. ー) via `scripts/fetch-kanjivg.ts`, stored as stroke paths only in `content/strokes.json` and lazy-loaded as its own chunk.
- **Lesson engine is pure and seeded** (`src/lesson/engine.ts`): the same lesson, progress and seed always give the same plan, so it is testable. Replays use a different seed.
- **One SRS grade per card per step**: any miss in a step means "again", otherwise "good". Multiple exercises on the same kana in one session would otherwise count as several reviews minutes apart.
- **A missed exercise comes back once** at the end of the step (not in the final quiz). The score uses first attempts only.
- **First completion time is kept forever**: replaying a finished lesson can only improve the stored score, never move the next unlock.
- **Extra practice ("Ćwicz dodatkowo") does not touch SRS or unlocking**, as the brief requires; only the review step and lesson practice write card states.
- **Review sessions are capped at 20 cards** (about 3 to 5 minutes); the rest stays queued and the UI says so calmly ("Reszta poczeka, bez stresu").
- **Listening exercises need a Japanese voice**: without one the engine swaps them for romaji-to-kana, so lessons never block on audio.
- **Hanko** shows the lesson number in Japanese numerals with 課, a deterministic tilt per lesson and a light ink-grain SVG filter; tests get a double ring. Sakura petals appear only on a first completion and never under reduced motion.
- **Words in kana lessons (from L4)** arrive with the vocabulary pipeline in Phase 3; kana lessons in Phase 2 teach characters only.
- **Concurrency note for builders**: the build container has 4 CPUs, so multi-agent workflows run two agents at a time.

### Phase 2 adversarial review (18 confirmed findings, all fixed)

- **Every introduced kana gets an SRS card** when the "new" step ends (`seedCards`), because the practice step is capped at 18 exercises: large groups (yōon, extended katakana) would otherwise leave up to 99 of 276 kana out of reviews forever. The capped review queue feeds them in gradually.
- **Lessons the engine cannot teach yet stay closed** (`lessonSupported`): from L17 on, until vocabulary and grammar content exist, Dziś says "Ta lekcja pojawi się w jednej z kolejnych aktualizacji" instead of letting the learner complete an empty lesson (completions are permanent). The player also refuses to record a lesson with no work of its own.
- **Tests end after their questions** (no empty summary step); the lesson score ignores answers from the review step.
- **Listening exercises only when sound is on** and a Japanese voice exists; a multiple choice that would have fewer than two options becomes a typing exercise.
- **Unlock timer starts from the latest completion in 1..n**, so a stray later record cannot open two lessons on one day.
- **A trailing hyphen in a typed answer is always a long vowel** ("ka-" is カー, never か).
- **VoiceOver**: focus moves to each new question, page or celebration title; the result is announced with the "Dalej" button; the listening button is named without the kana; options and placeholders never leak answers.
- **Copy and layout**: Polish fixes ("Pierwsze hanko", "Dotknij znaku", "jeszcze niepoznany", "Test 7 · jeszcze zamknięty"), mode-specific exit dialogs, safe-area padding on finish screens, all tap targets at least 44 px.
- **Clock skew**: the Worker answers far-future timestamps with `clock_skew`; the client keeps those changes queued and the settings sheet explains how to fix the phone clock.

## Phase 3: vocabulary content

- **LLM provider layer** (`src/shared/llm.ts`): Groq (OpenAI-compatible chat completions, JSON mode) first, Gemini (`generateContent`, `responseMimeType: application/json`) as fallback; plain fetch so it runs in the Worker and in Node scripts. Request shapes were checked against Groq's and Google's official cookbooks on GitHub (their docs sites are blocked from the build sandbox). Free-tier limits in late 2026 (third-party summaries, verify before relying on them): Groq about 30 requests/min and 1,000 to 14,400 requests/day depending on the model; Gemini free tier only covers Flash and Flash-Lite models at roughly 10 to 15 requests/min and 500 to 1,500 requests/day. Default models (`llama-3.3-70b-versatile`, `gemini-3.5-flash-lite`) are configuration, overridable per environment.
- **Polish glosses**: `scripts/generate-glosses.ts` is the repeatable, keys-required generator from the brief (fills only missing ids, never overwrites reviewed work). The committed glosses were produced once during development by the same kind of LLM pass (Claude agents working in four batches), then every one of the 674 entries was reviewed by a second agent; all stay `reviewed: false` until a human confirms them via `docs/glosses-spot-check.md`.
- **Readable word ids** from romaji (`taberu`), disambiguated with a short meaning when romaji collide (`hashi-bridge`, `hashi-chopsticks`); lexicalised は read as wa (`konnichiwa`).
- **Kana readings only when reliable**: some OpenJLPT sentences have kanji but no furigana; those keep no `kana` field instead of a guessed reading.
- **Known-word matcher** (`src/shared/jp-words.ts`) instead of a morphological analyser (kuromoji's dictionary is ~17 MB and could not run in the Worker): generates N5 inflections of the vocabulary and parses longest-match with a small rule-scored dynamic programme. It deliberately reports anything it cannot explain as unknown, which is what the "only known words" checks need.
- **Grammar gates** (`src/shared/grammar-gates.ts`): each function word and inflection is unlocked by the curriculum grammar point that teaches it; N4 forms (たら, たり, volitional, ながら, てしまう) count as above level.
- **Vocabulary corrections and supplement** (`scripts/import-openjlpt.ts`): the gloss review found OpenJLPT entries with wrong data for N5 (せっけん as 節倹 "economy", 厚い with the meanings of 篤い, 半分 as "half minute", outdated okurigana 終る/曲る and a few more). These are fixed in a small `CORRECTIONS` table keyed by OpenJLPT id, so a re-import stays reproducible. OpenJLPT also lacks words no beginner course can do without (私 わたし, 日本, 日本語, 日本人, 父, 母, 顔, そんな/どんな/あんな); they come straight from JMdict (jmdict-simplified, sequence numbers kept in `sourceId`). ポーランド, ポーランド人 and ポーランド語 are added as course words because the learners introduce themselves as Poles from the first sentence. Supplemented words have no Tatoeba sentences; their lesson examples are original.
- **Generated files go through Prettier** (`scripts/write-formatted.ts`), so rerunning any content script leaves `npm run format:check` green.
- **Words per lesson** (`scripts/curriculum-tool.ts`): 5 per writing-phase lesson from L4 (only words readable with the kana taught so far), 7 per grammar and practice lesson, 6 per kanji lesson, none in tests and the last two reviews. That caps the course at 541 of the 687 N5 words; the other 146 (rare readings, duplicates such as 自動車 next to 車, formal variants) are "bonus" words in the Słówka dictionary. Every word from L17 can be used in a sentence at its own lesson: no verbs before ます (L29), adjectives at L38/L40, ある/いる at L43, numbers and counters at L45-L48.
- **One example sentence per word from L17** (`content/examples/part-*.json` merged into `content/examples.json`): a short Tatoeba sentence when one passes the checks, otherwise an original one. Every sentence is checked by the matcher at its lesson, and its kana reading (with spaces between phrases, for beginners) must spell the same words (`readingProblems`). Romaji is generated (particles as pronounced), never written by hand.
- **A lone kanji numeral counts as its number word** (二時 uses ni). In kana, に, し, よ, ご, く and the sound-changed いっ, ろっ, はっ, じゅっ are numbers only right before a counter or another number (にじ, よじ, いっぷん, ごひゃく), and びゃく, ぴゃく, ぜん only right after a number (さんびゃく). A kana number with its counter may not be followed directly by a noun, so には + いくつ never becomes に + はい (two cups) + くつ. A number and its counter make one tile and one romaji word (さんじ, sanji).

## Phase 4: grammar lessons

- **Grammar notes** (`content/grammar.json`, 33 points) are original Polish text written for this project by one LLM pass and reviewed adversarially by a second; all stay `reviewed: false` and the Gramatyka tab says so, with an error report. Each note has three examples that pass the same checks as lesson examples, and a typical mistake of Polish speakers.
- **Lesson flow from L17**: Powtórka, Nowa rzecz (the note), Nowe słówka, Kanji (phase C), Ćwiczenie, Rozmowa, Podsumowanie. Practice lessons skip the note and work on the previous grammar point; tests mix the words and sentences of the lessons they cover.
- **Sentence exercises are built from the content at runtime** (`src/lesson/sentences.ts`): the matcher (25 KB, about 30 ms to build the lexicon) cuts each sentence's kana reading into tiles, finds particle gaps and the grammar points used, so tiles, gap fills and comprehension questions need no extra content. Particles that are often both right (に/へ, は/が, と/や) are never offered against each other.
- **Grammar SRS cards** (`grammar:<id>`) start when the lesson is completed (before that no sentence the learner can read uses the point, so a card seeded with the note could not be reviewed) and are reviewed with a sentence the learner can already read. Cards no exercise can serve (a word removed from the course, kanji data that failed to load) are left out of the queue and of every due count.
- **Multi-token patterns** (～ている, ～てから, ～くなる) are recognised by `grammarOfTokens`, shared by the validator and the app, so their lessons pick the right practice sentences.

## Phase 5: AI

- **Two endpoints behind the access cookie**: `/api/ai/exercise` (practice sentences for a lesson, cached in D1 `ai_cache` per lesson, whitelist hash and one of three variants) and `/api/ai/chat` (the conversation). Groq first, Gemini as fallback (`src/shared/llm.ts`); keys only as Worker secrets; without keys the endpoints answer `ai_unavailable` and the app skips AI quietly.
- **The model never explains grammar.** It writes practice sentences, the partner's lines and a correction of the learner's sentence; a correction may only name grammar ids, which link to the static notes. Every Japanese line from the model goes through the same matcher and grammar gates as the course content at the learner's lesson: practice sentences that fail are dropped, a partner line is retried once and then shown with its untaught words marked, a correction that fails is dropped. The kana reading must spell the sentence token for token (learners mostly read the kana): a partner line whose reading does not is never shown.
- **Two prompts per chat turn** (the research's advice): the learner's line is judged first by a correction prompt, then the partner answers with a conversation prompt that never corrects. Low temperature (0.3) and JSON answers.
- **Limits**: 20 model calls a minute and 500 a day for both learners together (D1 counters); the free tiers allow far more, the limits only stop runaway loops. Prompts never contain profile names.
- **Every sentence can be reported** (lesson, AI and note examples) through the existing outbox, so reports work offline.

## Phase 6: kanji and finishing

- **Kanji from L61** (`scripts/assign-kanji.ts`, deterministic): 81 N5 kanji in a teaching order (numbers, time, people, places, nature, verbs), two per phase C grammar or practice lesson and the rest in the kanji lessons L94-L97, each only after a word written with it has been taught (counters such as 円 are known from L47). 無, 丈 and 貼 from the OpenJLPT list are not taught.
- **Kana first, kanji when known**: a word is shown in kanji with furigana only when every kanji in it has been taught (furigana aligned to okurigana: 食(た)べる, 男(おとこ)の子(こ)); a sentence switches to kanji with its kana line under it on the same rule. Before that, the usual spelling is shown as "Zapis z kanji".
- **Polish kanji meanings** (`content/kanji.pl.json`) are short and original, `reviewed: false`; readings come from KANJIDIC through OpenJLPT and are shown as on (katakana) and kun (hiragana, okurigana in brackets).
- **L99 and L100**: L99 reviews a sample of words, sentences from the whole course and kanji; L100 is planned as a test over everything taught.
- **Accessibility audit**: axe-core (WCAG 2.2 AA and best-practice rules) over every tab, sheet and lesson step at 390 px, in light and dark mode and in a kana, a grammar and a kanji lesson. The only findings were skipped heading levels, now fixed; the intro captions ("Słówko 1 z 7") are h2 headings that take focus on every page.
