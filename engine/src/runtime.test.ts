import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Story, StoryError, type Chooser, type Out } from './runtime.ts';
import { FORMAT_VERSION, type Passage, type Scenario } from './schema.ts';

function scenario(passages: Record<string, Omit<Passage, 'name' | 'tags' | 'fragments'> & Partial<Passage>>): Scenario {
  const ps: Record<string, Passage> = {};
  for (const [name, p] of Object.entries(passages)) ps[name] = { name, tags: [], fragments: {}, ...p };
  return { format: FORMAT_VERSION, id: 'test', start: Object.keys(ps)[0]!, variables: { count: 0, who: '' }, passages: ps };
}

const keys = (out: Out[]): string[] =>
  out.flatMap((o) => (o.t === 'text' || o.t === 'link' ? [o.key] : o.t === 'block' || o.t === 'group' ? keys(o.children) : []));

const first: Chooser = { choose: () => 0 };

describe('Story', () => {
  it('renders text with evaluated arguments and follows links', () => {
    const s = new Story(
      scenario({
        A: { body: [{ t: 'text', key: 'a', kind: 'narrative', args: [{ var: 'who' }] }, { t: 'link', key: 'go', to: { lit: 'B' } }] },
        B: { body: [{ t: 'text', key: 'b', kind: 'narrative' }] },
      }),
      { vars: { who: 'Ada' } },
    );
    const v = s.start();
    assert.deepEqual(v.output[0], { t: 'text', key: 'a', kind: 'narrative', args: ['Ada'] });
    const next = s.click(v.links[0]!);
    assert.equal(next.passage, 'B');
    assert.deepEqual(keys(next.output), ['b']);
  });

  it('evaluates conditions and sets variables', () => {
    const s = new Story(
      scenario({
        A: {
          body: [
            { t: 'set', var: 'count', value: { op: '+', a: { var: 'count' }, b: { lit: 2 } } },
            {
              t: 'if',
              branches: [
                { cond: { op: '>', a: { var: 'count' }, b: { lit: 1 } }, body: [{ t: 'text', key: 'big', kind: 'narrative' }] },
                { body: [{ t: 'text', key: 'small', kind: 'narrative' }] },
              ],
            },
          ],
        },
      }),
    );
    assert.deepEqual(keys(s.start().output), ['big']);
    assert.equal(s.vars['count'], 2);
  });

  it('reveals a fragment in place of its link', () => {
    const s = new Story(
      scenario({
        A: {
          body: [{ t: 'text', key: 'before', kind: 'narrative' }, { t: 'link', key: 'more', reveal: '0', replace: true }, { t: 'text', key: 'after', kind: 'narrative' }],
          fragments: { '0': [{ t: 'text', key: 'revealed', kind: 'narrative' }] },
        },
      }),
    );
    const v = s.start();
    assert.deepEqual(keys(s.click(v.links[0]!).output), ['before', 'revealed', 'after']);
  });

  it('tells where a link leads', () => {
    const s = new Story(
      scenario({
        A: { body: [{ t: 'link', key: 'more', reveal: '0', replace: true }, { t: 'link', key: 'go', to: { lit: 'B' } }], fragments: { '0': [] } },
        B: { body: [] },
      }),
    );
    const [reveal, go] = s.start().links;
    assert.deepEqual(s.linkTarget(reveal!), { replace: true, reveal: '0', revealFrom: 'A' });
    assert.deepEqual(s.linkTarget(go!), { replace: false, to: 'B', revealFrom: 'A' });
  });

  it('disables a non-replacing reveal link after one click', () => {
    const s = new Story(
      scenario({
        A: { body: [{ t: 'link', key: 'more', reveal: '0' }], fragments: { '0': [{ t: 'text', key: 'revealed', kind: 'narrative' }] } },
      }),
    );
    const v = s.start();
    const after = s.click(v.links[0]!);
    assert.deepEqual(after.links, []);
    assert.deepEqual(after.output[0], { t: 'link', id: 1, key: 'more', args: [], disabled: true });
    assert.deepEqual(keys(after.output), ['more', 'revealed']);
  });

  it('pauses on a prompt and continues with the answer', () => {
    const s = new Story(
      scenario({
        A: {
          body: [
            { t: 'prompt', var: 'count', input: 'number', key: 'q' },
            { t: 'if', branches: [{ cond: { op: '==', a: { var: 'count' }, b: { lit: 7 } }, body: [{ t: 'goto', to: { lit: 'B' } }] }] },
          ],
        },
        B: { body: [{ t: 'text', key: 'b', kind: 'narrative' }] },
      }),
    );
    const v = s.start();
    assert.equal(v.prompt?.var, 'count');
    assert.equal(s.answer('7').passage, 'B');
  });

  it('turns setup pop-ups with a target into a continue link', () => {
    const s = new Story(
      scenario({
        A: { body: [{ t: 'block', style: 'setupEvent', next: { lit: 'B' }, body: [{ t: 'text', key: 'setup', kind: 'instruction' }] }] },
        B: { body: [] },
      }),
    );
    const v = s.start();
    assert.equal(v.links.length, 1);
    assert.equal(s.click(v.links[0]!).passage, 'B');
  });

  it('lets the chooser decide random macros', () => {
    const s = new Story(
      scenario({ A: { body: [{ t: 'set', var: 'who', value: { fn: 'either', args: [{ lit: 'x' }, { lit: 'y' }] } }] } }),
      { chooser: first },
    );
    s.start();
    assert.equal(s.vars['who'], 'x');
  });

  it('rejects storing a value of the wrong type', () => {
    const s = new Story(scenario({ A: { body: [{ t: 'set', var: 'count', value: { lit: 'many' } }] } }));
    assert.throws(() => s.start(), StoryError);
  });

  it('rejects unknown variables', () => {
    const s = new Story(scenario({ A: { body: [{ t: 'text', key: 'a', kind: 'narrative', args: [{ var: 'nope' }] }] } }));
    assert.throws(() => s.start(), StoryError);
  });

  it('keeps the prompt open when a number is expected but text is given', () => {
    const s = new Story(scenario({ A: { body: [{ t: 'prompt', var: 'count', input: 'number', key: 'q' }] } }));
    s.start();
    assert.throws(() => s.answer('lots'), StoryError);
    assert.equal(s.view().prompt?.var, 'count');
    s.answer('4');
    assert.equal(s.vars['count'], 4);
  });

  it('snapshots and restores, including revealed fragments and open links', () => {
    const sc = scenario({
      A: {
        body: [{ t: 'link', key: 'more', reveal: '0', replace: true }, { t: 'link', key: 'go', to: { lit: 'B' } }],
        fragments: { '0': [{ t: 'set', var: 'count', value: { lit: 5 } }, { t: 'text', key: 'revealed', kind: 'narrative' }] },
      },
      B: { body: [{ t: 'text', key: 'b', kind: 'narrative', args: [{ var: 'count' }] }] },
    });
    const s = new Story(sc);
    const v = s.start();
    s.click(v.links[0]!);
    const snap = JSON.parse(JSON.stringify(s.snapshot()));

    const t = new Story(sc);
    const restored = t.restore(snap);
    assert.deepEqual(keys(restored.output), ['revealed', 'go']);
    assert.equal(t.vars['count'], 5);
    const b = t.click(restored.links[0]!);
    assert.deepEqual(b.output[0], { t: 'text', key: 'b', kind: 'narrative', args: ['5'] });
  });

  it('marks random picks in displayed text as display-only', () => {
    const seen: boolean[] = [];
    const s = new Story(
      scenario({
        A: {
          body: [
            { t: 'text', key: 'a', kind: 'narrative', args: [{ fn: 'either', args: [{ lit: 'x' }, { lit: 'y' }] }] },
            { t: 'set', var: 'who', value: { fn: 'either', args: [{ lit: 'x' }, { lit: 'y' }] } },
          ],
        },
      }),
      { chooser: { choose: (_n, _site, display) => (seen.push(display), 0) } },
    );
    s.start();
    assert.deepEqual(seen, [true, false]);
  });

  it('includes other passages inline', () => {
    const s = new Story(
      scenario({
        A: { body: [{ t: 'include', passage: { lit: 'B' } }, { t: 'text', key: 'a', kind: 'narrative' }] },
        B: { body: [{ t: 'text', key: 'b', kind: 'narrative' }] },
      }),
    );
    assert.deepEqual(keys(s.start().output), ['b', 'a']);
  });
});
