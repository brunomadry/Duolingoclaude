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
