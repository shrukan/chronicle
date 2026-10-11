import { FORMAT_VERSION, Story, type Passage, type Scenario } from '@chronicle/engine';
import { describe, expect, it } from 'vitest';
import { revealPlainContinues, takeBoxesTogether } from './auto-steps';
import { eachOut } from './story-output';

function scenario(passages: Record<string, Partial<Passage>>): Scenario {
  const ps: Record<string, Passage> = {};
  for (const [name, p] of Object.entries(passages))
    ps[name] = { name, tags: [], fragments: {}, body: [], ...p };
  return { format: FORMAT_VERSION, id: 'test', start: 'A', variables: {}, passages: ps };
}

const keys = (story: Story, output = story.view().output) => {
  const found: string[] = [];
  eachOut(output, (o) => (o.t === 'text' || o.t === 'link') && found.push(o.key));
  return found;
};

describe('revealPlainContinues', () => {
  it('opens reveals that only say continue, not ones with their own label or a jump', () => {
    const sc = scenario({
      A: {
        body: [
          { t: 'link', key: 'more', reveal: '0', replace: true, role: 'continue' },
          { t: 'link', key: 'secret', reveal: '1', replace: true },
        ],
        fragments: {
          '0': [
            { t: 'text', key: 'shown', kind: 'narrative' },
            { t: 'link', key: 'leave', reveal: '2', replace: true, role: 'continue' },
          ],
          '1': [{ t: 'text', key: 'hidden', kind: 'narrative' }],
          '2': [{ t: 'goto', to: { lit: 'B' } }],
        },
      },
      B: {},
    });
    const story = new Story(sc);
    const view = revealPlainContinues(story, sc.passages, story.start());
    expect(keys(story, view.output)).toEqual(['shown', 'leave', 'secret']);
  });
});

describe('revealPlainContinues and app screens', () => {
  it('opens a reveal of nothing but the Score Entry button, not one of a dialog', () => {
    const sc = scenario({
      A: {
        body: [
          { t: 'link', key: 'score', reveal: '0', replace: true },
          { t: 'link', key: 'vote', reveal: '1', replace: true },
        ],
        fragments: {
          '0': [{ t: 'ui', ui: 'scoreEntry' }, { t: 'br' }],
          '1': [{ t: 'ui', ui: 'bidding' }],
        },
      },
    });
    const story = new Story(sc);
    const view = revealPlainContinues(story, sc.passages, story.start());
    expect(keys(story, view.output)).toEqual(['vote']);
    expect(view.output.some((o) => o.t === 'group' && o.children[0]?.t === 'ui')).toBe(true);
  });
});

describe('takeBoxesTogether', () => {
  it('shows boxes in a row on one page, with the last one’s Accept', () => {
    const box = (key: string, next: string): Partial<Passage> => ({
      body: [
        {
          t: 'block',
          style: 'setupEvent',
          body: [{ t: 'text', key, kind: 'instruction' }],
          next: { lit: next },
        },
      ],
    });
    const sc = scenario({ A: box('a', 'B'), B: box('b', 'C'), C: box('c', 'D'), D: {} });
    const story = new Story(sc);
    const { view, carried } = takeBoxesTogether(story, sc.passages, story.start(), []);
    expect(view.passage).toBe('C');
    expect(keys(story, carried)).toEqual(['a', 'b']);
    expect(keys(story, view.output)).toEqual(['c', 'common.setupContinue']);
  });

  it('stops at a page with more than a box', () => {
    const sc = scenario({
      A: {
        body: [
          {
            t: 'block',
            style: 'setupEvent',
            body: [{ t: 'text', key: 'a', kind: 'instruction' }],
            next: { lit: 'B' },
          },
        ],
      },
      B: { body: [{ t: 'text', key: 'story', kind: 'narrative' }] },
    });
    const story = new Story(sc);
    const { view, carried } = takeBoxesTogether(story, sc.passages, story.start(), []);
    expect(view.passage).toBe('A');
    expect(carried).toEqual([]);
  });
});
