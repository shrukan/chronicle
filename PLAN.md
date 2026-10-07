# Chronicle – project plan

A fan-made, non-commercial companion app for *My Father's Work*. Background and code analysis: `HANDOFF.md`.

**Working mode:** solo for now, open-sourced later → keep the repo publishable from day one
(clean history, no secrets, licences in place, README a stranger could follow).

## 1. Goals

**v1 – "playable replacement"**
- *The Cost of Disease*, English, playable start to finish on a phone and desktop browser.
- Matches the original app wherever the board game depends on it: same branches, same
  instructions, same scoring and endings.
- Works offline once loaded (PWA), saves progress locally.
- Runs as a container on my home server.

**Later**
- The other two scenarios, then other languages. French is deferred: the original French
  scripts were edited separately from the English ones (see `spike/FINDINGS.md`).
- **Reading modes:** *Full* (original text), *Short* (shortened story text, same game
  instructions), possibly more (e.g. instructions only).
- Voice-over, Capacitor app-store builds, cloud saves.

**Non-goals for v1:** accounts/backend, new story content, a visual redesign beyond "clean and readable".

## 2. Feature list of the original app (to match)

From `upstream/UnityOriginalApp/Assets/Scripts/UI` + `Manager`:

| Area | Original screens/components | v1? |
|---|---|---|
| Setup | Main menu, scenario select, player count, player names, village name, player intro, village intro | yes |
| Story player | Passages with links, text swapped in after a click, styled blocks, generation titles, location icon (`PassageTracker`) | yes |
| In-story prompts | Pop-up asking for a number or text (`ViewPopupPanel`), items/cards obtained (`ViewItemObtain`, `…HUB`), special events, bidding (`ViewBiddingSystem`) | yes |
| Round/generation flow | End of round, end of generation, generation ending | yes |
| Log book | Paged history of events (title, location, one-sentence summary; CSV in 8 languages) | yes |
| Scoring | Score entry, tie-breakers (2 stages), ranking page | yes |
| Endings | Endings/achievements gallery, ending page | yes |
| Share ending | Screenshot + share | later (Web Share API) |
| Save/load | Autosave, resume, saved endings, log book persistence (`DataManager`) | yes |
| Audio | Music, click sounds, voice-over (male/female) per passage | music v1, voice-over later |
| Help | Help screen | yes |
| Localization | 8 UI languages; story EN + FR | EN only; FR deferred |

The inventory is complete when every `View*.cs` is mapped to a route/component in this table.

## 3. Content model (the central design decision)

All story data is turned into one **neutral JSON format** that every tool uses
(converter → tester → player). Implemented in `engine/src/schema.ts`; M0 decided against Ink.

```
Scenario
  variables: [{ name, type, initial }]
  passages: { [name]: Passage }
Passage
  tags, generation?, location?
  blocks: Block[]                 // ordered
Block
  kind: narrative | instruction | setup | heading | prompt | link | effect | random | hook | manual
  textKey?: "cod.Changes.b03"     // text lives in string tables, not in the logic
  ...kind-specific fields (target passage, variable assignments, condition, options)
Strings (per language)
  { "cod.Changes.b03": { full: "...", short?: "..." } }
```

Why it's set up this way:
- **Reading modes become a text-only change.** Branching and game instructions are shared.
  Short mode only replaces `narrative` text and falls back to `full` when there is no short version.
  The game state can't drift between modes.
- **Translations live in the same place.** A language is just another string table.
- **The tester and the player read the same data.** What has been tested is exactly what gets played.
- **`manual` blocks** mark the hand-edited C# the converter couldn't interpret. The tester
  counts them and the goal is zero.

Writing short texts: draft them (possibly with LLM help), check each one by hand, and tag it
reviewed/unreviewed in the string table. Only reviewed short texts are shown.

## 4. Milestones

Each milestone has an exit criterion. Don't start the next until it's met (unless noted).

**M0 – Repo and spike** ✅ done – see `spike/FINDINGS.md`
- Repo, licences, Taskfile, prek + commitlint, release-please, CI.
- Spike went further than planned: a prototype converter for all six scripts, the engine,
  a terminal player and a random-walk smoke test (1,000 runs; ~29% reach the end of the game).
- **Decision:** own JSON format + own runtime (`engine/`), not Ink.
- Corrected numbers: Cost of Disease has 361 passages (EN), Fear of the Unknown 378,
  A Time of War 297. The handoff's "869" counted generated methods, not passages.

**M1 – Converter (Cost of Disease, EN)** ✅ done
- `tools/converter/` (C# → JSON, normalisation to strict types, extras) with fixture tests;
  `tools/story-cli/` (terminal player, random playthroughs).
- `content/cost-of-disease/`: 315 reachable passages, 0 manual nodes, 0 typing issues,
  0 broken links; `extras.json` with 21 end-of-round texts, 96 log book entries, 9 voice-over clips.
- The 46 dropped passages match Deusald's chapter index exactly: dev notes, the old setup and
  test-scoring paths (replaced by app screens), help and building reference pages the original
  app never navigated to (hub titles are shown in a separate hub view).
- 2,000 random playthroughs: no errors, all end in one of the 8 endings.
- Moved to later: shortened texts and their review (after the scenarios), 12 log book CSV rows
  with commas inside their text (the original misreads them too), Fear of the Unknown / A Time
  of War (converter reports 15 / 8 manual nodes; A Time of War also needs its real entry points).

**M2 – Story tester** ✅ done
- `tools/story-tester/` (`task content:test`, part of `project:check` and CI): static checks
  (strings, passages, variables) plus coverage-guided exploration – a corpus of states that
  covered something new, each expanded once over every link × every random outcome × prompt
  answers derived from the story's own comparisons, plus random playthroughs from them.
  Exhaustive search is impossible (≈185 variables decide the path).
- Output is spoiler-free (counts, anonymous ending labels); details in `build/reports/`.
- Cost of Disease: 314/315 passages, ≈94% of condition branches (impossible fall-throughs
  excluded), 8/8 endings, 0 errors, 0 dead ends. Accepted issues with reasons in
  `content/cost-of-disease/known-issues.json` (one original bug: `hunt1c` is never set).
- Found and fixed on the way: reveal links are one-shot (Harlowe behaviour), included
  passages count as visited, special village names the story checks for are tried at setup.
- Engine gained `snapshot()`/`restore()` (also the basis for save games) and a trace hook.
- Most uncovered branches are "pick only once" guards the original needed because its pop-ups
  re-rendered passages; they cannot trigger in our engine.

**M3 – Story player (Angular PWA skeleton)** ✅ done
- `frontend/`: Angular 22 (standalone, zoneless, OnPush, signals, Signal Forms, Tailwind theme
  tokens, light/dark). Game service drives the engine and saves after every step (IndexedDB,
  engine snapshots). Placeholder setup screen; app screens (end of round, bidding, scoring) as
  simple cards.
- Verified in headless Chrome: a full game from setup to an ending (277 steps, no errors),
  resume after reload, offline play from the service worker with the server stopped.
- `Containerfile` (Docker or Podman, `CONTAINER_ENGINE=podman`), unprivileged nginx with
  PWA-safe cache headers, `compose.yml`; CI runs frontend tests/build and builds the image.
- Fixed on the way: 36 strings with raw TextMeshPro tags; nginx MIME types.

**M4 – Full game flow**
Original flow (from `ViewController` and the screen scripts): main menu → voice choice → player
count → player intro → player names → village → village intro → scenario → story (story page +
hub page, log book) → end of round / generation dialogs → score entry → tie-breakers → ranking →
ending → endings & achievements gallery. Help and settings from the main menu.

- **M4.1 Assets:** converter step that extracts icons (TextMeshPro sprite assets), setup images,
  UI art (backgrounds, logo, scenario art, panels, crown) and audio (music, effects, male/female
  voice-over) into `content/assets/` with a manifest; images → WebP, audio → MP3 (plays
  everywhere). Original fonts are skipped (licences unclear).
- **M4.2 UI copy:** the original screen texts (intros, help, prompts, endings) from the scene into
  `content/ui.en.json`, grouped by screen.
- **M4.3 Screens:** setup flow, story page with generation title and hub view, log book,
  dialogs (CDK) for setup pop-ups / end of round / end of generation / special events,
  bidding & voting with the countdown reveal, score entry + tie-breakers + ranking (original
  rules; fix: player 5 was missing from score entry), endings & achievements gallery
  (unlocks stored locally), help, settings (voice, volumes, reading mode later).
- **M4.4 Audio:** music per scenario/screen, effects, voice-over for the 9 passages.
- **M4.5 End-to-end test:** a scripted full playthrough in a real browser, in CI.
- **Status (7 Oct 2026):** M4.1–M4.5 done. All screens, dialogs, scoring, endings gallery, help,
  settings, music, effects and voice-over work; `task frontend:e2e` plays a whole game in Chrome.
  The three scenario music tracks are not part of Renegade's community files: the title music
  plays during the story, the original's ending music at the endings.
  Open: hub passages are shown inline rather than
  on a separate page; shortened texts (reading mode) remain for later.
- **Exit:** a real board-game session played start to finish with the app, no workarounds.

**M5 – Release v1**
- release-please tags `v1.0.0` → GitHub Actions pushes the image to `ghcr.io`.
- Home server pulls the pinned image version and runs it behind HTTPS.
- Credits page, open-source the repo, post to the Discord.
- Optional: also publish the static build to GitHub Pages for people without a server.

**M6 – Reading modes: Easy and Short** (after v1)
- *Easy*: the flavour text in plain English (B1 level) for non-native speakers – shorter
  sentences, common words, nothing left out. Game instructions stay untouched: they are already
  plain, and leaving them alone means no rule can change by accident.
- *Short*: narrative condensed (about a third), instructions unchanged.
- Data: `StringEntry` gets an `easy` variant next to `short`; both only show once reviewed,
  otherwise the full text appears. Setting in the pause menu, switchable mid-game.
- Workflow: draft with an LLM per passage (with the passage's context), review in a small
  side-by-side tool, mark reviewed; the story tester checks every key has its variant.
- Order: Easy first (it helps more people and needs no decisions about what to cut).

**After v1** (order flexible): Fear of the Unknown → A Time of War → reading modes
(Short) → voice-over → other UI languages → Capacitor.

Short mode is placed after the scenarios on purpose: the content model supports it from M1,
but writing short texts is a content job and works best once the logic is stable.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Harlowe semantics (text swapped in after a click, hooks) don't map cleanly | ✅ Resolved in M0: own runtime interprets them directly |
| Hand-edits hide game logic in C# | `manual` blocks + tester counts them; review against original app behaviour |
| No original Twine sources | The C# is the source; the official web app is the reference for behaviour |
| Shortened text drops an instruction players need | Only `narrative` blocks are shortened; tester checks short mode reaches the same passages |
| Licence problems when open-sourcing | Code and content separated from the start (§6) |
| Duplicate effort with Deusald's Blazor port | Mention the project on Discord before M5; offer the JSON data/tester to them |

## 6. Repo layout, tooling and deployment

```
chronicle/
  frontend/            Angular PWA                                    – MIT
  engine/              story runtime shared by frontend + tester      – MIT
  tools/converter/     Cradle C# → JSON                               – MIT
  tools/story-tester/                                                 – MIT
  content/             generated JSON, string tables, images, audio   – CC BY-NC 4.0, © Renegade Game Studios
  docker/nginx.conf
  Containerfile  compose.yml  Taskfile.yml
  package.json         npm workspaces (frontend, engine, tools/*)
  prek.toml  .commitlintrc.yml  .editorconfig  release-please-config.json
  upstream/            reference clone, git-ignored
```

**Language:** TypeScript everywhere – the converter, tester and app share one schema and one engine.

**Taskfile** (naming `area:action[:env]`, `SOURCE_DIR`/`OUTPUT_DIR` vars,
`sources`/`generates` for incremental builds, version line marked `# x-release-please-version`):

| Task | What it does |
|---|---|
| `content:convert` | run converter on `upstream/` → `content/` |
| `content:test` | run story tester, fail on new issues |
| `frontend:serve:dev` | `ng serve` |
| `frontend:build` | production build → `build/web` |
| `project:lint` / `project:test` | lint + unit tests across workspaces |
| `project:build:docker` | build runtime image |
| `project:up:prod` / `project:down:prod` / `project:log:docker` | compose on this machine |

**Container**
- Multi-stage Containerfile (works with Docker and Podman): `node-toolchain` (Node 24 + Angular CLI + Task) →
  `build-frontend` (runs `task frontend:build` with npm cache mounts) → `runtime`.
- Runtime: `nginx:alpine` (unprivileged variant) serving `build/web/browser`. No backend needed.
  nginx config: SPA fallback to `index.html`; long cache for hashed assets; **no cache** for
  `index.html`, `ngsw.json` and `ngsw-worker.js` (otherwise PWA updates get stuck); gzip/brotli.
- `compose.yml` with `IMAGE_NAME` / `CONTAINER_NAME`, `restart: unless-stopped`, port via env.
- **HTTPS is required** for the service worker (offline mode) on anything but `localhost`.
  On the home server the container sits behind the existing reverse proxy with TLS.
- Images: `ghcr.io/<user>/chronicle:<version>` built by GitHub Actions on release; the home server pins the version.

**Repo hygiene:** conventional commits enforced by prek + commitlint (scopes e.g. `frontend`,
`engine`, `converter`, `tester`, `content`, `docker`, `task`); release-please for versions and
CHANGELOG; CI runs lint, unit tests and `content:test` on every PR.

## 7. UI

**Angular CDK + Tailwind CSS**, no full component library.
- The app is mostly styled text: passages, choice buttons, number/name inputs, dialogs, a paged
  log book, a score table. A full library would mostly need overriding to get the gothic look.
- CDK provides the parts that are hard to get right: dialogs, overlays, focus trapping,
  keyboard navigation, a11y helpers. No visual style.
- ~10 own components (story block, choice button, number input, dialog, log-book pager, score table…).
- Theme = CSS custom properties taken from the original's colours and fonts, wired into Tailwind.
  Dark variant and reading-mode tweaks are just alternative token sets.
- **Optional:** Spartan UI (shadcn-style copy-in components on CDK + Tailwind) if building
  primitives by hand gets tedious.
- **Fallback:** PrimeNG in unstyled mode if heavy widgets show up.
- Not chosen: Angular Material (look clashes), Ionic (only worth it if app stores become the main target).

## 8. Open decisions

- ~~Custom runtime vs Ink~~ → decided in M0: own runtime.
- Public hosting in addition to the home server (GitHub Pages) → decided at M5, doesn't block anything.
- Whether to commit generated `content/` JSON or regenerate in CI → recommend commit (reviewable diffs).
- Voice-over → decide in M4. Recommendation: keep the 9 original recordings (intros), offer
  optional read-aloud via the browser's Web Speech API for all other text; pre-generate neural
  voices (self-hosted, e.g. Piper) only if device voices are not good enough.
- Tailwind vs plain SCSS tokens → recommend Tailwind; revisit if it gets in the way of the custom look.
