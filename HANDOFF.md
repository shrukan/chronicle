# My Father's Work – rewrite: handoff notes

Context for continuing in Claude Code. The fan repo is cloned (shallow, read-only reference)
into `upstream/` – https://github.com/Deusald/MyFathersWork-FanMadeCompanionApp

## Background
- *My Father's Work* (Renegade Game Studios) is a board game that depends on a companion app.
- 24 June 2026: Renegade released the app's development files for the community
  (blog: https://renegadegamestudios.com/blog/my-fathers-work-app-update-community-resources/).
  Community Discord: https://discord.com/invite/QvGD44Ck44
- The official Android app is no longer on Google Play; iOS and web versions are still up but buggy.
- License (per the fan repo): Copyright Renegade Game Studios, CC BY-NC 4.0 → free, credited,
  non-commercial fan app is fine.

## The original Unity project
- Unity 2019.4.19f1, located in `UnityOriginalApp/` of the fan repo.
  (The Google Drive zip from Renegade lacked the 6 story scripts; the repo has them.)
- Story written in Twine (Harlowe format), compiled to C# by the Cradle plugin.
  The generated C# was then **edited by hand** (password checks, pop-ups, UI calls injected
  into passages, e.g. `ViewPopupPanel.instance...`). Original Twine `.html` sources are not included.
- Story scripts: `Assets/Scripts/StoryScript/{English,French}/`
  | Scenario | EN passages | EN words (approx.) |
  |---|---|---|
  | The Cost of Disease | 869 | 41,000 |
  | Fear of the Unknown | 1,059 | 32,000 |
  | A Time of War | 808 | 32,000 |
  French versions are similar size. `Assets/Scripts/OldStory/` = old drafts (EN + ES), unused.
- Code size (non-blank lines):
  - Own app code ~4,800 (UI screens 3,300; data/managers 1,400) + customized Cradle player ~850
  - Story scripts ~192,000 (generated), old drafts ~115,000, third-party plugins ~46,000
- No backend: the original app makes no network calls; all state is local (Unity PlayerPrefs).
- Assets worth reusing: ~290 images, ~95 audio files (music + male/female voice-over),
  fonts, CSVs with event summaries in 8 languages (`Assets/CSV/`).

## Existing fan rewrite (same repo)
- Blazor WebAssembly (C#) web app in `MyFathersWorkWebApp/`, published via GitHub Pages (`docs/`).
- ~15 setup screens done (players, village, scenario, language, save/load).
- Only *The Cost of Disease* being converted (`ProcessingScenario/`, console tool, CSV localization).
  Other two scenarios exist only as enum values.
- Almost all work by one person (Deusald), mainly 13–19 July 2026; no pushes since
  (verified 6 Oct 2026: last commit f703f83, 19 Jul 2026).
  → Ask on Discord whether it's still active before starting a parallel effort.

## Observations from the code (6 Oct 2026)
- Cradle output is regular: `passageN_Init` registers name/tags, `passageN_Main` and
  `passageN_Fragment_K` are `IEnumerable<StoryOutput>` methods yielding `text(...)`,
  `lineBreak()`, `link(label, target, action)`, `styleScope(...)`, `enchantHook(...)`.
  Variables via `Vars.x` with `VarDef(...)` declarations.
- Hand-edits found in *The Cost of Disease* EN: `PassageTracker.instance.CheckProgress(...)`,
  `ViewItemObtain.SetupPassagename = ...`, `ViewPopupPanel.instance.*` (~55 calls),
  commented-out original lines. Harlowe macros used: `either` (176), `random` (33), `a`,
  `shuffled`, `max`, `num`.
- Some string literals are split across lines with `+` concatenation – converter must handle.
- Deusald's `ProcessingScenario/chapters/` splits Cost of Disease into 9 chapters with a
  hand-written passage index (name, line range, one-line summary) – useful reference/test oracle.

## Proposed green-field architecture
- **Frontend:** Angular (standalone components + signals), TypeScript, installable PWA
  (`ng add @angular/pwa`) with offline support.
- **Story:** Ink (inkle) with the inkjs runtime, wrapped in an Angular service.
  Text kept in per-language string tables referenced by key (Ink's own localization is weak).
- **i18n:** Transloco (runtime language switching; Angular built-in i18n is build-per-locale).
- **Audio:** Howler.js or Web Audio.
- **Saves/settings:** IndexedDB / localStorage behind one persistence service,
  so a backend (e.g. Supabase or Cloudflare Workers + D1) can be added later.
- **Backend:** none for v1.
- **Hosting:** static (Cloudflare Pages / Netlify / GitHub Pages). CI with GitHub Actions;
  preview deploy per pull request.
- **Containers:** only as a `.devcontainer` for contributors (optional nginx self-host image).
- **Most important investment:** an automated story tester that walks every branch of every
  scenario and reports dead ends, unreachable passages and variables used but never set.
- **App stores later (optional):** wrap the PWA with Capacitor.

## Suggested next steps
1. Check Discord for status of the existing fan project; propose the architecture above.
2. Write a converter: Cradle-generated C# → Ink (or JSON), starting with *The Cost of Disease*;
   flag hand-edited passages for manual review.
3. Build the story tester against the converted data.
4. Scaffold the Angular PWA: setup screens, story player, log book, scoring, endings.
