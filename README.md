# Chronicle

An unofficial, fan-made companion app for the board game **My Father's Work**
(Renegade Game Studios). It replaces the original app, which is no longer maintained, with an
installable web app that also works offline.

> **Status:** early development (milestone M0 done). Not playable in the browser yet – see
> [PLAN.md](PLAN.md).

## How it works

The original app's stories were written in Twine and compiled to C#. Chronicle converts them
into plain data:

- **`<scenario>.json`** – passages as a tree of nodes (text, links, conditions, variables, …)
- **`<scenario>.strings.json`** – all text, per language, with optional shortened versions

A small TypeScript engine (`engine/`) plays that data. The same engine powers the app, the
story tester and the terminal player.

## Repository layout

| Path | What |
|---|---|
| `engine/` | Story format (`schema.ts`), runtime, value semantics, text markup |
| `spike/` | M0 prototype converter, terminal player and smoke test ([findings](spike/FINDINGS.md)) |
| `content/` | Converted story data (CC BY-NC 4.0, © Renegade Game Studios) |
| `upstream/` | Reference clone of the original project (git-ignored) |

## Getting started

Requirements: Node.js 24+, [Task](https://taskfile.dev).

```bash
task deps:install
task project:check          # type-check + unit tests
task spike:convert          # clone the original sources and convert all scenarios
task spike:play             # play The Cost of Disease in the terminal
task spike:smoke RUNS=1000  # random playthroughs, reports errors and coverage
```

## Licence

- Code: [MIT](LICENSE)
- Story content, images and audio: [CC BY-NC 4.0](content/LICENSE.md), © Renegade Game Studios.
  Non-commercial use only.

This project is not affiliated with or endorsed by Renegade Game Studios.
