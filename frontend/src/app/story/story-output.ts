import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { SETUP_CONTINUE_KEY, type Out } from '@chronicle/engine';
import { Game, PLAIN_CONTINUE } from '../core/game';
import { Library } from '../core/library';
import { RichText } from './rich-text';
import { ScreenCard } from './screen-card';

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
  template: `
    @for (o of panels(tidy(items())); track $index) {
      @switch (o.t) {
        @case ('panel') {
          <!-- An action of a hub page: with one way in, the whole panel is that link. -->
          @if (o.action; as link) {
            <button type="button" class="panel action" (click)="game.click(link.id)">
              <ng-container
                [ngTemplateOutlet]="panelBody"
                [ngTemplateOutletContext]="{ $implicit: o }"
              />
              <span class="go" aria-hidden="true">›</span>
            </button>
          } @else {
            <section class="panel" [class.done]="o.done">
              <ng-container
                [ngTemplateOutlet]="panelBody"
                [ngTemplateOutletContext]="{ $implicit: o }"
              />
            </section>
          }
        }
        @case ('text') {
          <cr-rich-text
            [text]="
              trimmed(o.key) ? beforeLink(game.text(o.key, o.kind)) : game.text(o.key, o.kind)
            "
            [args]="o.args"
            [class]="o.kind"
          />
        }
        @case ('br') {
          <br />
        }
        @case ('link') {
          @if (o.id === hideLink()) {
            <!-- The panel around it is the link. -->
          } @else if (o.id === primaryLink()) {
            <button type="button" class="btn continue-inline" (click)="game.click(o.id)">
              @if (isPlain(o.key)) {
                Continue
              } @else {
                <cr-rich-text [text]="game.text(o.key)" [args]="o.args" />
              }
            </button>
          } @else if (o.disabled) {
            <cr-rich-text class="used-link" [text]="game.text(o.key)" [args]="o.args" />
          } @else if (o.key === setupContinue) {
            <button type="button" class="btn confirm setup-continue" (click)="game.click(o.id)">
              {{ library.text('UI/ItemObtain/ViewArea/Acceptbtn/Text (TMP)', 'Accept') }}
            </button>
          } @else {
            <button type="button" class="story-link" (click)="game.click(o.id)">
              <cr-rich-text [text]="game.text(o.key)" [args]="o.args" />
            </button>
          }
        }
        @case ('group') {
          <cr-story-output [items]="o.children" [primaryLink]="primaryLink()" />
        }
        @case ('block') {
          @if (o.style === 'setupEvent') {
            <!-- A pop-up with a picture in the original; here a box on the page, with the
                 picture beside the text: nothing to click away, and the page stays readable. -->
            <section class="block setupEvent">
              <header>{{ setupLabel }}</header>
              <div class="setup-event">
                @if (o.image && library.setupImage(o.image); as src) {
                  <img class="setup-image" [src]="src" alt="" />
                }
                <div class="setup-body">
                  <cr-story-output [items]="trim(o.children)" [primaryLink]="primaryLink()" />
                </div>
              </div>
            </section>
          } @else {
            <section class="block" [class]="o.style">
              @if (o.style === 'setup') {
                <header>{{ setupLabel }}</header>
              }
              <cr-story-output [items]="trim(o.children)" [primaryLink]="primaryLink()" />
            </section>
          }
        }
        @case ('ui') {
          <cr-screen-card [screen]="o" />
        }
      }
    }
    <ng-template #panelBody let-p>
      <div class="panel-title">
        <cr-story-output [items]="trim(p.title.children)" />
      </div>
      <div class="panel-details">
        <cr-story-output [items]="trim(p.details.children)" [hideLink]="p.action?.id" />
      </div>
      @if (p.done) {
        <span class="mark">✓ Done</span>
      }
    </ng-template>
  `,
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
