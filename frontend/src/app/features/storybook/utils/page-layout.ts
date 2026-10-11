import { SETUP_CONTINUE_KEY, type Out, type StoryView } from '@chronicle/engine';
import { findLink, type LinkOut, type TextOut } from '../../../core/utils/story-output';

/** How the storybook lays out a page of the engine's output. Plain functions of the output. */

/** A clickable story link (not one inside a setup box, which the box handles). */
function findStoryLink(out: Out[], id: number): LinkOut | undefined {
  const link = findLink(out, id, (block) => block.style !== 'setupEvent');
  return link && !link.disabled && link.key !== SETUP_CONTINUE_KEY ? link : undefined;
}

/**
 * What the original showed as a pop-up once the story was read (gain, lose, place …) comes
 * after the story, as a box with its Accept (the way on) right below: read first, then act –
 * also while the voice-over reads the story.
 */
function setupAfterStory(out: Out[]): Out[] {
  const setups: Out[] = [];
  const accepts: Out[] = [];
  // Also inside the sections that "continue" opened on the page.
  const take = (items: Out[]): Out[] =>
    items.flatMap((o): Out[] => {
      if (o.t === 'group') return [{ ...o, children: take(o.children) }];
      if (o.t !== 'block' || o.style !== 'setupEvent') return [o];
      const children = o.children.filter((c) => {
        const accept = c.t === 'link' && c.key === SETUP_CONTINUE_KEY;
        if (accept) accepts.push(c);
        return !accept;
      });
      setups.push({ ...o, children });
      return [];
    });
  const rest = take(out);
  return setups.length ? [...rest, ...setups, ...accepts] : out;
}

/**
 * The page's body: without its title (when the header shows it) and the line breaks around it –
 * the original often ends a page with empty lines after its last button – and with its setup
 * boxes after the story.
 */
export function pageBody(out: Out[], titleShown: boolean): Out[] {
  let i = 0;
  if (titleShown && out[0]?.t === 'text' && out[0].kind === 'title') i = 1;
  while (out[i]?.t === 'br') i++;
  let end = out.length;
  while (end > i && out[end - 1]!.t === 'br') end--;
  return setupAfterStory(out.slice(i, end));
}

/** The single way forward when a page offers no choice; `plain` when it only says "continue". */
export function onlyWay(
  view: StoryView | undefined,
): { id: number; key: string; args: string[]; plain: boolean } | undefined {
  if (!view || view.prompt || view.links.length !== 1) return undefined;
  const link = findStoryLink(view.output, view.links[0]!);
  if (!link) return undefined;
  return { id: link.id, key: link.key, args: link.args, plain: link.role === 'continue' };
}

/**
 * The app commands opening the page ("hand the storybook to …", and a tie rule right after it),
 * shown full screen first. While a player already `holding` the storybook reads on, only a
 * notice that passes it on counts.
 */
export function handoverNotice(body: Out[], holding: boolean): TextOut[] | undefined {
  const out = body.filter((o) => o.t !== 'br');
  const isCommand = (o: Out | undefined) => o?.t === 'text' && o.kind === 'command';
  const start = out.slice(0, 2).findIndex(isCommand);
  if (start < 0) return undefined;
  let end = start;
  while (isCommand(out[end])) end++;
  const notice = out.slice(start, end) as TextOut[];
  const passes = notice.some((o) => o.role === 'handover');
  return holding && !passes ? undefined : notice;
}

/**
 * The page's only link when the page holds nothing but the notice and that link ("click here to
 * reveal your secret …"): confirming the notice follows it, so it takes one tap.
 */
export function noticeLink(
  notice: TextOut[],
  body: Out[],
  view: StoryView | undefined,
): number | undefined {
  if (!view || view.prompt || view.links.length !== 1) return undefined;
  const flat = (out: Out[]): Out[] =>
    out.flatMap((o) => (o.t === 'group' ? flat(o.children) : o.t === 'br' ? [] : [o]));
  const rest = flat(body).filter((o) => !(notice as Out[]).includes(o));
  const only = rest.length === 1 ? rest[0] : undefined;
  return only?.t === 'link' && only.id === view.links[0] && !only.disabled ? only.id : undefined;
}
