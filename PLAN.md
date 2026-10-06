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
- The other two scenarios, then French (story text exists), then other languages.
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
| Localization | 8 UI languages; story EN + FR | EN v1 |

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

**M1 – Converter (Cost of Disease, EN)**
- Promote `spike/src/convert.ts` to `tools/converter/` with tests. Already handles: string
  concatenation, styles/blocks, hooks and fragments (incl. cross-passage and renumbered ones),
  prompts, setup pop-ups, Harlowe macros and arrays, ternaries, app-screen calls.
- Turn the 11 app-screen passages (password, naming creations, score entry, winner ranking,
  most investigated) into `ui` nodes, and build those screens' logic into the engine/app.
- Shared `common.*` string keys for repeated labels ("Click to continue...").
- Text classification: default to `instruction` when unsure; use the CSV "physical instruction"
  column; mark developer-note passages (`DEV NOTE`) and exclude them.
- Extract end-of-round texts, log-book data and voice-over mapping from the Unity assets.
- **Exit:** all 361 passages converted, zero `manual` nodes, output committed to `content/`;
  passage list matches Deusald's chapter index.

**M1b – French alignment** (can run in parallel with M2/M3)
- The French scripts were edited separately (different passage counts and start passages), so
  they can't be used as a plain string table over the English structure. Build an alignment
  report (passages and strings matched by name + position) and decide per difference.

**M2 – Story tester**
- Walks every branch (with value sets for prompts/random) and reports dead ends, unreachable
  passages, variables read but never set, missing string keys, `manual` blocks.
- Runs in CI on every commit.
- **Exit:** report is clean or every remaining issue is listed as a known exception with a reason.

**M3 – Story player (Angular PWA skeleton)**
- Angular standalone + signals, PWA, routing, persistence service (IndexedDB), story engine
  service running the JSON. UI per §7.
- Dockerfile + compose; `task project:up:prod` runs the PWA locally in the container.
- **Exit:** Cost of Disease playable end to end with placeholder setup (hard-coded players).

**M4 – Full game flow**
- Setup screens, log book, end of round/generation, scoring + tie-breakers, endings, save/resume,
  help, music.
- **Exit:** a real board-game session played start to finish with the app, no workarounds.

**M5 – Release v1**
- release-please tags `v1.0.0` → GitHub Actions pushes the image to `ghcr.io`.
- Home server pulls the pinned image version and runs it behind HTTPS.
- Credits page, open-source the repo, post to the Discord.
- Optional: also publish the static build to GitHub Pages for people without a server.

**After v1** (order flexible): Fear of the Unknown → A Time of War → French → reading modes
(Short) → voice-over → other UI languages → Capacitor.

Short mode is placed after the scenarios on purpose: the content model supports it from M1,
but writing short texts is a content job and works best once the logic is stable.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Harlowe semantics (text swapped in after a click, hooks) don't map cleanly | ✅ Resolved in M0: own runtime interprets them directly |
| French story differs structurally from English | M1b alignment report before using French |
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
  Dockerfile  compose.yml  Taskfile.yml
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
- Multi-stage Dockerfile: `node-toolchain` (Node 24 + Angular CLI + Task) →
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
- Tailwind vs plain SCSS tokens → recommend Tailwind; revisit if it gets in the way of the custom look.
