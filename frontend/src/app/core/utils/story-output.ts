import type { Out } from '@chronicle/engine';

/** Helpers for the engine's page output: a tree of items, nested in boxes and revealed groups. */

export type LinkOut = Extract<Out, { t: 'link' }>;
export type TextOut = Extract<Out, { t: 'text' }>;
type BlockOut = Extract<Out, { t: 'block' }>;

/** Calls `fn` for every item, depth first, also inside boxes and revealed groups. */
export function eachOut(out: Out[], fn: (o: Out) => void): void {
  for (const o of out) {
    fn(o);
    if (o.t === 'block' || o.t === 'group') eachOut(o.children, fn);
  }
}

/**
 * A link by id. `enter` decides which boxes to look into (all by default); revealed groups are
 * always part of the page around them.
 */
export function findLink(
  out: Out[],
  id: number,
  enter: (block: BlockOut) => boolean = () => true,
): LinkOut | undefined {
  for (const o of out) {
    if (o.t === 'link' && o.id === id) return o;
    if (o.t === 'group' || (o.t === 'block' && enter(o))) {
      const inner = findLink(o.children, id, enter);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** The output without one link (the Accept of a box taken together with the next one). */
export function withoutLink(out: Out[], id: number): Out[] {
  return out.flatMap((o): Out[] =>
    o.t === 'link' && o.id === id
      ? []
      : o.t === 'block' || o.t === 'group'
        ? [{ ...o, children: withoutLink(o.children, id) }]
        : [o],
  );
}

/** First title of a passage's output (its heading in the original). */
export function titleKey(out: Out[]): string | undefined {
  for (const o of out) {
    if (o.t === 'text' && o.kind === 'title') return o.key;
    if (o.t === 'text') return undefined;
  }
  return undefined;
}
