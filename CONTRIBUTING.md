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

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint:

```
feat(engine): support include of fragments
fix(converter): resolve fragments of renumbered passages
```

Scopes: `engine`, `converter`, `cli`, `tester`, `frontend`, `content`, `docker`, `task`,
`ci`, `deps`, `docs`, `repo`.

Versions and the changelog are managed by release-please – don't edit version numbers by hand.

## Code

- TypeScript everywhere, run directly by Node (type stripping): no enums, namespaces or
  parameter properties; use `.ts` extensions in relative imports.
- Unit tests use `node:test` next to the code (`*.test.ts`).

## Content

Everything in `content/` is derived from Renegade Game Studios' material and licensed
CC BY-NC 4.0. Don't add material from other sources.
