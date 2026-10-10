import { compareVersions, parseChangelog } from './whats-new';

const CHANGELOG = `# Changelog

## [0.3.0](https://github.com/o/r/compare/v0.2.0...v0.3.0) (2026-10-08)


### Features

* mute all sound with one tap ([5d59658](https://github.com/o/r/commit/5d59658))
* **frontend:** the main menu shows the app's name ([7bf5b4a](https://x/7bf5b4a)), closes [#4](https://x/4)


### Bug Fixes

* sound effects follow the \`mute\` setting ([5d59658](https://x/5d59658), [fe49f76](https://x/fe49f76))

## 0.1.0 (2026-10-07)


### Features

* the complete storybook ([bef6cfb](https://x/bef6cfb))
`;

describe('parseChangelog', () => {
  it('reads versions, dates and sections in players’ words, newest first', () => {
    const releases = parseChangelog(CHANGELOG);
    expect(releases.map((r) => [r.version, r.date])).toEqual([
      ['0.3.0', '2026-10-08'],
      ['0.1.0', '2026-10-07'],
    ]);
    expect(releases[0]!.sections.map((s) => s.title)).toEqual(['New', 'Fixed']);
  });

  it('drops commit and issue references and Markdown from the entries', () => {
    const [latest] = parseChangelog(CHANGELOG);
    expect(latest!.sections[0]!.entries).toEqual([
      'mute all sound with one tap',
      "frontend: the main menu shows the app's name",
    ]);
    expect(latest!.sections[1]!.entries).toEqual(['sound effects follow the mute setting']);
  });
});

describe('compareVersions', () => {
  it('compares numerically, part by part', () => {
    expect(compareVersions('0.10.0', '0.9.1')).toBeGreaterThan(0);
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0);
    expect(compareVersions('0.2.9', '1.0.0')).toBeLessThan(0);
  });
});
