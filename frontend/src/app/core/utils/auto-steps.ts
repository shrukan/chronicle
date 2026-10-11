import {
  SETUP_CONTINUE_KEY,
  type Node,
  type Out,
  type Passage,
  type Story,
  type StoryView,
} from '@chronicle/engine';
import { findLink, withoutLink } from './story-output';

/**
 * Steps the app takes for the players, so a page shows what they would see anyway: reveals that
 * only say "continue", and boxes in a row shown together. Plain functions of the story and its
 * passages; the Game service applies them after every step.
 */

type Passages = Record<string, Passage>;

/** Nodes that must not run without the players: leaving the page, asking a question. */
function interrupts(nodes: Node[], passages: Passages, seen = new Set<string>()): boolean {
  return nodes.some((n) => {
    if (n.t === 'goto' || n.t === 'prompt' || n.t === 'manual') return true;
    if (n.t === 'include') {
      const name = 'lit' in n.passage ? String(n.passage.lit) : undefined;
      if (!name) return true;
      if (seen.has(name)) return false;
      seen.add(name);
      return interrupts(passages[name]?.body ?? [], passages, seen);
    }
    if (n.t === 'block') return interrupts(n.body, passages, seen);
    if (n.t === 'if') return n.branches.some((b) => interrupts(b.body, passages, seen));
    return false;
  });
}

/** A page that shows nothing but a box of things to do at the table (and sets values). */
export function boxOnly(passage: Passage | undefined): boolean {
  const body = passage?.body ?? [];
  return (
    body.some((n) => n.t === 'block' && n.style === 'setupEvent') &&
    body.every(
      (n) => n.t === 'set' || n.t === 'br' || (n.t === 'block' && n.style === 'setupEvent'),
    )
  );
}

/**
 * Opens reveals that only say "continue" and whose content stays on the page – the reader
 * would click them anyway. Reveals with their own label (often hiding something from the other
 * players), jumps and prompts still wait.
 */
export function revealPlainContinues(story: Story, passages: Passages, view: StoryView): StoryView {
  for (let i = 0; i < 30 && !view.prompt; i++) {
    const next = view.links.find((id) => {
      const target = story.linkTarget(id);
      if (!target?.reveal || !target.replace) return false;
      if (findLink(view.output, id)?.role !== 'continue') return false;
      const fragment = passages[target.revealFrom!]?.fragments[target.reveal];
      return !!fragment && !interrupts(fragment, passages);
    });
    if (next === undefined) break;
    view = story.click(next);
  }
  return view;
}

/**
 * Boxes in a row (the opening's setup steps, rewards after a story) on one page: when the
 * page's only way on is a box's Accept and it leads to a page that is just another box, that
 * step is taken now and its box shown below. One Accept then confirms them all; values rolled
 * on the way are rolled once, so what is shown is what counts. `carried` holds the boxes
 * already taken together; the result's `carried` adds the ones taken now.
 */
export function takeBoxesTogether(
  story: Story,
  passages: Passages,
  view: StoryView,
  carried: Out[],
): { view: StoryView; carried: Out[] } {
  for (let i = 0; i < 10 && !view.prompt && view.links.length === 1; i++) {
    const id = view.links[0]!;
    if (findLink(view.output, id)?.key !== SETUP_CONTINUE_KEY) break;
    const to = story.linkTarget(id)?.to;
    if (!to || !boxOnly(passages[to])) break;
    carried = [...carried, ...structuredClone(withoutLink(view.output, id))];
    view = revealPlainContinues(story, passages, story.click(id));
  }
  return { view, carried };
}
