import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { SETUP_CONTINUE_KEY, type Out } from '@chronicle/engine';
import { Game, PLAIN_CONTINUE } from '../../../../core/services/game';
import { Library } from '../../../../core/services/library';
import { RichText } from '../rich-text/rich-text';
import { ScreenCard } from '../screen-card/screen-card';

type Block = Extract<Out, { t: 'block' }>;
type Link = Extract<Out, { t: 'link' }>;
interface Panel {
  t: 'panel';
  title: Block;
  details: Block;
  /** The single, still open link: the whole panel is it. */
  action: Link | undefined;
  /** Every link already followed. */
  done: boolean;
}

function links(out: Out[]): Link[] {
  return out.flatMap((o) =>
    o.t === 'link' ? [o] : o.t === 'group' || o.t === 'block' ? links(o.children) : [],
  );
}

/** Renders the engine's output tree. Recursive for blocks and revealed fragments. */
@Component({
  selector: 'cr-story-output',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RichText, ScreenCard],
  templateUrl: './story-output.html',
  styleUrl: './story-output.css',
})
export class StoryOutput {
  protected readonly game = inject(Game);
  protected readonly library = inject(Library);
  readonly items = input.required<Out[]>();
  /** The page's only way forward: shown as a button instead of a text link. */
  readonly primaryLink = input<number | undefined>(undefined);
  /** A link drawn by the panel around it: left out, and the comma before it trimmed. */
  readonly hideLink = input<number | undefined>(undefined);
  protected readonly setupContinue = SETUP_CONTINUE_KEY;

  protected isPlain(key: string): boolean {
    return PLAIN_CONTINUE.test(this.game.text(key).replace(/[*\\]/g, '').trim());
  }

  /** Text right before the hidden link ("…the Track, click here"). */
  protected trimmed(key: string): boolean {
    const id = this.hideLink();
    if (id === undefined) return false;
    const items = this.items();
    const at = items.findIndex((o) => o.t === 'link' && o.id === id);
    const before = items
      .slice(0, at)
      .filter((o) => o.t !== 'br')
      .at(-1);
    return at > 0 && before?.t === 'text' && before.key === key;
  }

  /** "…the Track, click here" → "…the Track." */
  protected beforeLink(text: string): string {
    const cut = text.replace(/[\s,;:–-]+$/, '');
    return /[.!?…]\**$/.test(cut) ? cut : `${cut}.`;
  }

  /**
   * Hub pages list their actions as a heading block followed by a details block: each pair
   * becomes one panel.
   */
  protected panels(out: Out[]): (Out | Panel)[] {
    const result: (Out | Panel)[] = [];
    for (let k = 0; k < out.length; k++) {
      const title = out[k]!;
      let next = k + 1;
      while (out[next]?.t === 'br') next++;
      const details = out[next];
      if (
        title.t === 'block' &&
        title.style === 'hubTitle' &&
        details?.t === 'block' &&
        details.style === 'hubDetails'
      ) {
        const all = links(details.children);
        result.push({
          t: 'panel',
          title,
          details,
          action: all.length === 1 && !all[0]!.disabled ? all[0] : undefined,
          done: all.length > 0 && all.every((l) => l.disabled),
        });
        k = next;
      } else result.push(title);
    }
    return result;
  }

  /** Line breaks at the start or end of a block only add empty space. */
  protected trim(out: Out[]): Out[] {
    let start = 0,
      end = out.length;
    while (start < end && out[start]!.t === 'br') start++;
    while (end > start && out[end - 1]!.t === 'br') end--;
    return out.slice(start, end);
  }

  /**
   * The original stacks line breaks generously. Boxes and notices bring their own spacing, so
   * breaks next to them go; elsewhere at most one empty line remains.
   */
  protected tidy(out: Out[]): Out[] {
    const boxed = (o: Out | undefined): boolean =>
      o !== undefined &&
      (o.t === 'block' || o.t === 'ui' || (o.t === 'text' && o.kind === 'command'));
    const kept: Out[] = [];
    for (let k = 0; k < out.length; k++) {
      const o = out[k]!;
      if (o.t === 'br') {
        const prev = kept[kept.length - 1];
        let next = k + 1;
        while (out[next]?.t === 'br') next++;
        if (boxed(prev) || boxed(out[next])) continue;
        if (prev?.t === 'br' && kept[kept.length - 2]?.t === 'br') continue;
      }
      kept.push(o);
    }
    return kept;
  }

  protected get setupLabel(): string {
    return this.library.text('@TwineTMProPlayer.setupText', 'Setup');
  }
}
