# Contributing

Pull requests are very welcome. For anything bigger than a small fix, open an issue first so
we can agree on the approach. Keep story spoilers out of issues, commits and pull requests.

## Setup

```bash
task deps:install
prek install        # git hooks: commit message lint + basic file checks
task project:check
```

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint.

**The changelog is for players.** release-please builds `CHANGELOG.md` – which the app links
to – from `feat` and `fix` commits only. So:

- Use `feat` / `fix` only for changes players notice, **without a scope**, and write the subject
  from their side of the screen:
  ```
  feat: undo your last choice from the pause menu
  fix: sound effects stop when you mute
  ```
- Everything else – converter, story tester, engine internals, CI, tooling – uses `build`,
  `chore`, `ci`, `refactor`, `test`, `perf` or `docs`, with a scope:
  ```
  build(converter): extract the log book from the original CSV
  test(tester): explore prompts with values from comparisons
  ```
- The release PR is the last chance to polish the wording: edit its changelog text before
  merging.

Scopes: `engine`, `converter`, `cli`, `tester`, `frontend`, `content`, `docker`, `task`,
`ci`, `deps`, `docs`, `repo`.

Versions are managed by release-please – don't edit version numbers by hand.

## Code

- TypeScript everywhere, run directly by Node (type stripping): no enums, namespaces or
  parameter properties; use `.ts` extensions in relative imports.
- Unit tests use `node:test` next to the code (`*.test.ts`).

## Content

Everything in `content/` is derived from Renegade Game Studios' material and licensed
CC BY-NC 4.0. Don't add material from other sources.
