import { SETUP_CONTINUE_KEY, type Out, type StoryView } from '@chronicle/engine';
import { describe, expect, it } from 'vitest';
import { handoverNotice, noticeLink, onlyWay, pageBody } from './page-layout';

const text = (key: string, kind: 'narrative' | 'command' | 'title' = 'narrative'): Out => ({
  t: 'text',
  key,
  kind,
  args: [],
});
const link = (id: number, extra: Partial<Extract<Out, { t: 'link' }>> = {}): Out => ({
  t: 'link',
  id,
  key: `link${id}`,
  args: [],
  ...extra,
});
const view = (output: Out[], links: number[]): StoryView => ({ passage: 'P', output, links });

describe('pageBody', () => {
  it('drops the title the header shows and the line breaks around the page', () => {
    const out: Out[] = [text('t', 'title'), { t: 'br' }, text('a'), { t: 'br' }, { t: 'br' }];
    expect(pageBody(out, true)).toEqual([text('a')]);
    expect(pageBody(out, false)[0]).toEqual(text('t', 'title'));
  });

  it('puts setup boxes after the story, their Accept last', () => {
    const accept = link(1, { key: SETUP_CONTINUE_KEY });
    const box: Out = { t: 'block', style: 'setupEvent', children: [text('gain'), accept] };
    expect(pageBody([box, text('story')], false)).toEqual([
      text('story'),
      { ...box, children: [text('gain')] },
      accept,
    ]);
  });
});

describe('onlyWay', () => {
  it('is the single story link, plain when it only says continue', () => {
    expect(onlyWay(view([text('a'), link(1, { role: 'continue' })], [1]))).toMatchObject({
      id: 1,
      plain: true,
    });
    expect(onlyWay(view([link(1)], [1]))?.plain).toBe(false);
  });

  it('is none with a choice, or when the link is a setup box’s Accept', () => {
    expect(onlyWay(view([link(1), link(2)], [1, 2]))).toBeUndefined();
    expect(onlyWay(view([link(1, { key: SETUP_CONTINUE_KEY })], [1]))).toBeUndefined();
  });
});

describe('handoverNotice', () => {
  const handover: Out = { t: 'text', key: 'hand', kind: 'command', role: 'handover', args: [] };

  it('is the commands opening the page', () => {
    expect(handoverNotice([handover, text('rule', 'command'), text('story')], false)).toEqual([
      handover,
      text('rule', 'command'),
    ]);
    expect(handoverNotice([text('story'), text('a'), handover], false)).toBeUndefined();
  });

  it('while a player holds the storybook, only counts when it passes it on', () => {
    expect(handoverNotice([text('keep hidden', 'command'), text('story')], true)).toBeUndefined();
    expect(handoverNotice([handover, text('story')], true)).toEqual([handover]);
  });
});

describe('noticeLink', () => {
  it('is the page’s only link when nothing else is on the page', () => {
    const notice = [text('hand', 'command')] as Extract<Out, { t: 'text' }>[];
    expect(noticeLink(notice, [notice[0]!, link(1)], view([notice[0]!, link(1)], [1]))).toBe(1);
    const more = [notice[0]!, text('story'), link(1)];
    expect(noticeLink(notice, more, view(more, [1]))).toBeUndefined();
  });
});
