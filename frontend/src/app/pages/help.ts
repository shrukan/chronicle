import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioPlayer } from '../core/audio';
import { Library } from '../core/library';
import { RichText } from '../story/rich-text';

const TABS = [
  { id: 'HowToUSe', label: 'How to use' },
  { id: 'StoryActions', label: 'Story Actions' },
  { id: 'EndOfRound', label: 'End of Round' },
] as const;

/** The original's help: how to use the storybook, story actions, end of round. */
@Component({
  selector: 'cr-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RichText],
  template: `
    <section class="paper sheet">
      <nav class="tabs" role="tablist">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="active() === tab.id"
            (click)="active.set(tab.id)"
          >
            {{ tab.label }}
          </button>
        }
      </nav>
      <h1 class="heading">{{ t('UI/Help/Viewarea/' + active() + '/DetailsPanel/title') }}</h1>
      <div class="details">
        <cr-rich-text [text]="t('UI/Help/Viewarea/' + active() + '/DetailsPanel/details')" />
      </div>
      <a class="btn" routerLink="/">Back</a>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .sheet {
      display: grid;
      justify-items: center;
      gap: 1rem;
      max-width: 36rem;
      margin: 0 auto;
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.35rem;
    }
    .tabs button {
      padding: 0.3rem 0.7rem;
      font-size: 0.9rem;
      border: 1px solid var(--color-rule);
      border-radius: 0.4rem;
      background: transparent;
      color: var(--color-muted);
      font: inherit;
      cursor: pointer;
    }
    .tabs button[aria-selected='true'] {
      border-color: var(--color-accent);
      color: var(--color-ink);
    }
    h1 {
      margin: 0;
      font-size: 1.8rem;
      text-align: center;
    }
    .details {
      line-height: 1.6;
      font-size: 1.1rem;
      white-space: pre-line;
    }
  `,
})
export class Help {
  private readonly library = inject(Library);
  protected readonly tabs = TABS;
  protected readonly active = signal<(typeof TABS)[number]['id']>('HowToUSe');

  constructor() {
    inject(AudioPlayer).effect('help');
  }

  protected t(key: string): string {
    return this.library.text(key);
  }
}
