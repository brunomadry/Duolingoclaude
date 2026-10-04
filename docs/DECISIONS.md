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
