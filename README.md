# Chronicle

An unofficial, fan-made companion app for the board game **My Father's Work**
(Renegade Game Studios). It replaces the original app, which is no longer maintained, with an
installable web app that also works offline.

[![CI](https://github.com/shrukan/chronicle/actions/workflows/ci.yml/badge.svg)](https://github.com/shrukan/chronicle/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/shrukan/chronicle)](https://github.com/shrukan/chronicle/releases)

> **Status:** early, but playable. _The Cost of Disease_ works from setup to the endings; the
> other two scenarios follow. See [PLAN.md](PLAN.md) and the [changelog](CHANGELOG.md).

## Features

- **The complete storybook** of _The Cost of Disease_: game setup, story, location pages, end of
  round, secret bids and votes, final scoring, endings – with the original's art, music and
  voice-over.
- **Made for the table:** pages open at once instead of click by click; a full-screen notice
  when the storybook is passed on, so secrets stay secret; undo the last choice; the screen
  stays on during a game; works with the keyboard (Enter / Space).
- **Easy to read:** story text, game rules and instructions for the app look different.
- **Never loses a game:** saves on every step and resumes after a reload; log book, play time
  and an endings gallery.
- **Installable and offline:** a web app (PWA) for phones, tablets and computers – once
  loaded, it needs no connection.
- **Tested:** every scenario is explored automatically for dead ends and errors, and a full
  game is played in a real browser on every change.

**Play it:** <https://shrukan.github.io/chronicle/> – open it on a phone or tablet and add it
to the home screen; after the first visit it works offline.

Found a bug? [Report it](https://github.com/shrukan/chronicle/issues/new?template=bug.yml) –
or use the link in the app, which fills in the details.

## Your data

Chronicle has no server and no accounts: everything stays in the browser of the device you
play on, and nothing is sent anywhere.

| What                                                | Where                                  |
| --------------------------------------------------- | -------------------------------------- |
| Game in progress (state, log book, play time, undo) | IndexedDB `chronicle`, store `saves`   |
| Unlocked endings                                    | IndexedDB `chronicle`, store `unlocks` |
| Settings (voice, volumes, page display)             | localStorage `chronicle.settings`      |
| App, story, images and audio for offline use        | the service worker's Cache Storage     |

So a game belongs to one device, one browser and one address (the GitHub Pages version and a
self-hosted one keep separate games). Clearing the browser's site data or closing a private
window deletes it. Chronicle asks the browser to keep its data even when storage runs low;
on iPhone and iPad, add it to the home screen – Safari otherwise clears website data after
seven days without a visit.

## How it works

The original app's stories were written in Twine and compiled to C#. Chronicle converts them
into plain data:

- **`<scenario>.json`** – passages as a tree of nodes (text, links, conditions, variables, …)
- **`<scenario>.strings.json`** – all text, per language, with optional shortened versions

A small TypeScript engine (`engine/`) plays that data. The same engine powers the app and the
story tester.

## Repository layout

| Path                  | What                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `frontend/`           | Angular PWA (signals, zoneless, Signal Forms, Tailwind, CDK)                  |
| `engine/`             | Story format (`schema.ts`), runtime, value semantics, text markup             |
| `tools/converter/`    | Converts the original C# story scripts into `content/`                        |
| `tools/story-tester/` | Static checks and coverage-guided exploration of every scenario               |
| `tools/e2e/`          | Plays a full game in headless Chrome against the production build             |
| `content/`            | Converted story data (© Renegade Game Studios, used under CC BY-NC 4.0 terms) |
| `docs/`               | Notes, e.g. [M0 findings](docs/m0-findings.md)                                |
| `sources/original/`   | The original files the converter reads (story scripts, scene, log book, VO)   |
| `upstream/`           | Optional full clone of the fan repository, for reference (git-ignored)        |

## Getting started

Requirements: Node.js 24+, [Task](https://taskfile.dev); Docker or Podman for the container.

Images and audio come from Renegade's community download (the fan repo on GitHub only stores
Git LFS pointers): unpack it into `media/` (git-ignored) and run `task content:assets`.

With Podman, prefix the container tasks with `CONTAINER_ENGINE=podman`. `podman compose` (used by
`project:up:prod`) needs Podman's API socket: `systemctl --user enable --now podman.socket`.

```bash
task deps:install
task project:check          # type-check + unit tests
task content:convert         # clone the original sources and regenerate content/
task content:test            # story tester: dead ends, errors, coverage (spoiler-free output)
task frontend:serve:dev      # the app at http://localhost:4200
task frontend:e2e            # a full game in headless Chrome
task project:up:prod         # the production container at http://localhost:8080
```

## Self-hosting

The app is a static site served by an unprivileged nginx container. Each release is published
as `ghcr.io/shrukan/chronicle` (amd64 and arm64; tags `<version>`, `<major>.<minor>`, `latest`):

```bash
docker run -d --name chronicle -p 8080:8080 --read-only --tmpfs /tmp \
  --restart unless-stopped ghcr.io/shrukan/chronicle:latest
```

Or with the [compose file](compose.yml):
`IMAGE_NAME=ghcr.io/shrukan/chronicle:latest docker compose up -d --no-build`.
To build the image yourself instead: `task project:up:prod`.

Plain HTTP works. Over HTTP on anything but `localhost`, though, browsers switch off offline
mode, installing the app to the home screen and keeping the screen on – put it behind a
reverse proxy with HTTPS if you want those.

## Contributing

Feature requests and pull requests are very welcome – whether it's an idea from your last
game night, a fix, a translation or one of the scenarios still to come.

- **Ideas:** [request a feature](https://github.com/shrukan/chronicle/issues/new?template=feature.yml)
- **Bugs:** [report a bug](https://github.com/shrukan/chronicle/issues/new?template=bug.yml)
- **Code:** see [CONTRIBUTING.md](CONTRIBUTING.md) for setup and conventions. For bigger
  changes, open an issue first so we can agree on the approach.

Please keep story spoilers out of issues and pull requests.

## Licence

- Code: [MIT](LICENSE)
- Story content, images and audio: © Renegade Game Studios, used non-commercially under
  CC BY-NC 4.0 terms – see [content/LICENSE.md](content/LICENSE.md).
  Non-commercial use only.

This project is not affiliated with or endorsed by Renegade Game Studios.
