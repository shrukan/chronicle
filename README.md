# Chronicle

An unofficial, fan-made companion app for the board game **My Father's Work**
(Renegade Game Studios). It replaces the original app, which is no longer maintained, with an
installable web app that also works offline.

> **Status:** early development (milestone M3). *The Cost of Disease* is playable in the browser
> with a placeholder setup screen – see [PLAN.md](PLAN.md).

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
| `frontend/` | Angular PWA (signals, zoneless, Signal Forms, Tailwind, CDK) |
| `engine/` | Story format (`schema.ts`), runtime, value semantics, text markup |
| `tools/converter/` | Converts the original C# story scripts into `content/` |
| `tools/story-cli/` | Terminal player and random-playthrough smoke test |
| `tools/story-tester/` | Static checks and coverage-guided exploration of every scenario |
| `content/` | Converted story data (CC BY-NC 4.0, © Renegade Game Studios) |
| `docs/` | Notes, e.g. [M0 findings](docs/m0-findings.md) |
| `upstream/` | Reference clone of the original project (git-ignored) |

## Getting started

Requirements: Node.js 24+, [Task](https://taskfile.dev); Docker or Podman for the container.

With Podman, prefix the container tasks with `CONTAINER_ENGINE=podman`. `podman compose` (used by
`project:up:prod`) needs Podman's API socket: `systemctl --user enable --now podman.socket`.

```bash
task deps:install
task project:check          # type-check + unit tests
task content:convert         # clone the original sources and regenerate content/
task content:test            # story tester: dead ends, errors, coverage (spoiler-free output)
task frontend:serve:dev      # the app at http://localhost:4200
task project:up:prod         # the production container at http://localhost:8080
task story:play              # play The Cost of Disease in the terminal
task content:smoke RUNS=1000 # random playthroughs: errors, coverage, endings reached
```

## Licence

- Code: [MIT](LICENSE)
- Story content, images and audio: [CC BY-NC 4.0](content/LICENSE.md), © Renegade Game Studios.
  Non-commercial use only.

This project is not affiliated with or endorsed by Renegade Game Studios.
