# AGENTS.md

Guidance for coding agents (and humans) working on Chronicle: what it is, how it is built, the
rules to follow, and where the plan stands. The detailed plan, with decisions and their reasons,
is [PLAN.md](PLAN.md); contributor rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## What Chronicle is

An unofficial, free companion app for the board game _My Father's Work_ (Renegade Game Studios),
replacing the original Unity app. It plays the original story (Twine, compiled to C#, released to
the community in June 2026) from converted data, as an installable, offline web app (PWA). No
backend, no accounts: everything stays in the player's browser. Status: beta, _The Cost of
Disease_ playable from setup to the endings; expect breaking changes.

## Rules that always apply

- **No spoilers.** Never quote story text, name endings or say which choices lead where – not in
  commits, pull requests, issues, docs, code comments or tool output. Tools print counts and
  structure ("8/8 endings reachable"); details go behind an explicit flag into `build/reports/`.
  Anonymised labels ("Ending 3") are fine.
- **Content licence.** Everything in `content/` derives from Renegade's material (CC BY-NC 4.0).
  Add nothing from other sources; the original's fonts are licensed separately and not shipped.
- **Rules are never rewritten.** Easy/Short versions and generated voice-over only touch
  flavour text (`kind: 'narrative'`); instructions, setup and app commands stay as they are.
- **Secrets stay secret.** Pages behind the hand-over screen (a `command` text at the top) are
  for one player: never read them aloud or show them before the hand-over is confirmed.
- **Commits:** Conventional Commits (commitlint). `feat`/`fix` **without a scope** only for what
  players notice, written from their side ("fix: sound effects stop when you mute") – these form
  the player-facing changelog. Everything else uses another type **with a scope**
  (`engine`, `converter`, `tester`, `frontend`, `content`, `docker`, `task`, `ci`, `deps`,
  `docs`, `repo`). Subject in lower case, header ≤ 100 characters. Don't edit version numbers:
  release-please manages them.
- **Check before committing:** `task project:check` (types, unit tests, build, story tester) and,
  for UI changes, `task frontend:e2e` (a full game in headless Chrome).

## Architecture

```
original C# story scripts ──converter──▶ content/ (JSON) ──engine──▶ story tester
                                                      └──engine──▶ Angular app (PWA)
```

- **Content model** (`engine/src/schema.ts`): a scenario is variables plus passages; a passage is
  a tree of nodes (text, links, conditions, variable updates, prompts, app screens, blocks). All
  text lives in string tables by key (`strings.en.json`), each entry `{ full, easy?, short? }`
  with review flags. Text kinds: `narrative` (flavour text), `instruction`, `command` (about the
  app, e.g. hand-overs), `title`. A language or reading mode is a text-only change; game state
  cannot drift between them.
- **Engine** (`engine/`): a small TypeScript runtime that plays that data (Harlowe semantics such
  as one-shot reveals), with `snapshot()`/`restore()` for saves and undo, and a trace hook for
  the tester. Shared by the app and the tools, so what is tested is what is played.
- **Converter** (`tools/converter/`): original C# → JSON, screen texts (`content/ui.en.json`) and
  assets (`content/assets/`, WebP/MP3, capped at 2048 px). It is currently the source of truth for
  `content/` and keeps hand-written Easy/Short texts across re-conversions (matched by text). It
  is a migration tool: once all scenarios are converted, `content/` is frozen and edited directly
  (see PLAN.md, "Content lifecycle").
- **Story tester** (`tools/story-tester/`): static checks plus coverage-guided exploration of
  every scenario; spoiler-free summary.
- **Voice generator** (`tools/voice/`, Python via `uv`): Kokoro voices (Emma, George) for voiced
  pages in every reading mode; settings in `tools/voice/voices.json`.
- **App** (`frontend/`): Angular, standalone components, signals, zoneless, `OnPush`, the new
  control flow, `inject()`, Signal Forms; Tailwind for tokens; Angular CDK where needed. The
  `Game` service drives the engine, saves after every step (IndexedDB) and keeps undo steps;
  settings live in localStorage; a service worker makes it work offline.

### Frontend layout (`frontend/src/app/`)

Feature-based, one folder per component, each with its own `.ts`, `.html`, `.css` and
`.spec.ts` when it has tests:

```
app.ts / app.html / app.css      shell: backdrop, update notice, footer
app.routes.ts, app.config.ts
core/services/                   app-wide singletons: game, library (assets, screen texts,
                                 voices), audio, settings, save-store, content, whats-new,
                                 app-update
core/utils/                      plain helpers: bug-report links, wake lock
features/<feature>/pages/<name>/        routed pages
features/<feature>/components/<name>/   components only that feature uses
shared/components/<name>/        reused across features: modal (+ modal-stack), tabs,
                                 settings-panel
shared/directives/<name>/        e.g. autofocus
shared/utils/                    e.g. duration formatting
```

Features: `menu` (main menu, title scene), `setup` (player count to scenario choice),
`storybook` (play page; story output, rich text, screen cards for end of round / votes /
scoring hand-off, round bar, log book), `scoring`, `endings`, `info` (about, help, what's new),
`dev` (the `/voices` test page, development builds only). Put a new component in the feature
that uses it; move it to `shared/` only once a second feature needs it.

Component conventions: selector prefix `cr-`, `templateUrl`/`styleUrl` (no inline templates),
signals and `computed` over manual state, `input()`/`output()`, no `NgModule`s. Component styles
have a budget (6 kB warning); split a component before it grows past that. Theme colours come
from the CSS tokens in `src/styles.css` (light and dark paper).

### Repository layout

| Path                  | What                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `frontend/`           | Angular PWA                                                             |
| `engine/`             | Story format, runtime, values, text markup                              |
| `tools/converter/`    | C# → JSON, screen texts, assets                                         |
| `tools/story-tester/` | Static checks and exploration                                           |
| `tools/e2e/`          | Full game in headless Chrome against the production build               |
| `tools/voice/`        | Generated voice-over (Kokoro)                                           |
| `content/`            | Converted story data and assets (© Renegade Game Studios, CC BY-NC 4.0) |
| `sources/original/`   | The original files the converter reads                                  |
| `media/`, `upstream/` | Local, git-ignored: Renegade's media download, fan repository clone     |

## Commands

```bash
task deps:install             # dependencies
task frontend:serve:dev       # dev server at http://localhost:4200 (copies content/ at start)
task project:check            # types, unit tests, build, story tester
task frontend:e2e             # full game in headless Chrome
task content:convert          # original scripts → content/
task content:assets           # media/ → content/assets/
task content:test             # story tester (spoiler-free; details in build/reports/)
task content:voices           # generated voices; -- --try "text" to hear any text
task project:up:prod          # production container (Podman; CONTAINER_ENGINE=docker)
```

Development builds only: `/play?passage=<name>` jumps to a passage (starts a test game if
needed), and `/voices` compares voices on each scenario's introduction. Neither exists in
production builds.

## Plan and status

Full detail in [PLAN.md](PLAN.md). As of October 2026:

| Milestone                               | Status                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| M0 Repo and spike (own format + engine) | done                                                                                   |
| M1 Converter (_The Cost of Disease_)    | done                                                                                   |
| M2 Story tester                         | done                                                                                   |
| M3 App skeleton (PWA, saves, offline)   | done                                                                                   |
| M4 Full game flow                       | done; exit criterion open: one real session at the table                               |
| M5 Release v1                           | releases to ghcr.io and GitHub Pages run; BGG beta post after the session, then v1.0.0 |
| M6 Reading modes Easy and Short         | beta for _The Cost of Disease_; review at the table open                               |
| M7 Voice-over                           | 9 voiced pages with original and generated voices; every new story text planned        |

Next, roughly in order:

1. Play a session at the table; fix what comes up; post the BGG announcement; release v1.0.0.
2. Convert _Fear of the Unknown_ and _A Time of War_ (converter reports 15 / 8 manual nodes;
   A Time of War needs its real entry points), check them with the story tester and at the table.
3. Freeze `content/` and retire the converter (PLAN.md, "Content lifecycle").
4. Review Easy and Short; write them for the other scenarios.
5. Voice-over for every new story text (M7): voice packs outside git, names generated in the
   browser.
6. Other UI languages; app-store builds (Capacitor) later, if needed.
