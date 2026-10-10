// feat and fix feed the player-facing changelog and take no scope; every other type needs one
// (CONTRIBUTING.md, "Commits").
const PLAYER_TYPES = ["feat", "fix"];

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "scope-by-type": ({ type, scope }) => {
          if (!type) return [true];
          if (PLAYER_TYPES.includes(type)) {
            return [
              !scope,
              `${type} is for players and takes no scope; internal work uses another type with a scope`,
            ];
          }
          return [
            !!scope,
            `${type} needs a scope (only feat and fix go without one)`,
          ];
        },
      },
    },
  ],
  rules: {
    "scope-by-type": [2, "always"],
    "scope-enum": [
      2,
      "always",
      [
        "engine",
        "converter",
        "tester",
        "frontend",
        "content",
        "docker",
        "task",
        "ci",
        "deps",
        "docs",
        "repo",
      ],
    ],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
  },
};
