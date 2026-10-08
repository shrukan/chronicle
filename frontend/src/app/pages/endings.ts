import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Game } from '../core/game';
import { Library } from '../core/library';
import { SaveStore } from '../core/save-store';

/**
 * Endings and achievements unlocked on this device. Locked endings stay hidden ("???"), as
 * in the original, so the gallery gives nothing away.
 */
@Component({
  selector: 'cr-endings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="paper sheet">
      <nav class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="tab() === 'endings'"
          (click)="tab.set('endings')"
        >
          {{ t('UI/Endings and Achievement/Viewarea/ending/Text (TMP)', 'Endings') }}
        </button>
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="tab() === 'achievements'"
          (click)="tab.set('achievements')"
        >
          {{ t('UI/Endings and Achievement/Viewarea/achievement/Text (TMP)', 'Achievements') }}
        </button>
      </nav>

      <h1 class="heading">{{ scenarioName }}</h1>

      @if (tab() === 'endings') {
        <p class="count">
          {{ unlockedCount() }}
          {{ t('@ViewShareEnding.endingScenarioText', 'out of 8 endings for this scenario.') }}
        </p>
        <ol class="slots">
          @for (e of endings(); track e.passage) {
            <li [class.locked]="!e.unlocked">
              @if (e.unlocked) {
                <strong>{{ e.title }}</strong>
                <small>{{ e.date }}</small>
              } @else {
                <strong>???</strong>
              }
            </li>
          }
        </ol>
      } @else {
        <ul class="slots">
          @for (a of achievements(); track a.text) {
            <li [class.locked]="!a.done">
              <strong>{{ a.text }}</strong>
              <small>{{ a.done ? 'Unlocked' : 'Locked' }}</small>
            </li>
          }
        </ul>
      }

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
      max-width: 30rem;
      margin: 0 auto;
      text-align: center;
    }
    .tabs {
      display: flex;
      gap: 0.5rem;
    }
    .tabs button {
      padding: 0.4rem 1rem;
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
    }
    .count {
      margin: 0;
      font-style: italic;
    }
    .slots {
      width: 100%;
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.5rem;
    }
    .slots li {
      display: grid;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--color-rule);
      border-radius: 0.4rem;
      background: var(--color-field);
    }
    .slots li.locked {
      opacity: 0.55;
    }
    .slots strong {
      font-family: var(--font-display);
      font-weight: normal;
      font-size: 1.15rem;
      color: var(--color-heading);
    }
    .slots small {
      color: var(--color-muted);
    }
  `,
})
export class Endings {
  private readonly library = inject(Library);
  private readonly game = inject(Game);
  private readonly saves = inject(SaveStore);

  protected readonly tab = signal<'endings' | 'achievements'>('endings');
  protected readonly scenarioName = 'The Cost of Disease';
  private readonly unlocks = resource({ loader: () => this.saves.unlocks(this.game.scenarioId()) });
  /** Ending titles need the scenario's strings. */
  private readonly content = resource({ loader: () => this.game.loadContent() });

  protected readonly endings = computed(() => {
    const scenario = this.content.value()?.scenario;
    const reached = this.unlocks.value()?.endings ?? {};
    const order = this.library
      .list('@PassageTracker.endingPassageList')
      .filter((p) => scenario?.passages[p]);
    return order.map((passage) => {
      const title = scenario?.passages[passage]?.body.find(
        (n) => n.t === 'text' && n.kind === 'title',
      );
      return {
        passage,
        unlocked: !!reached[passage],
        title:
          title?.t === 'text' ? this.game.text(title.key, 'title').replace(/\*/g, '') : passage,
        date: reached[passage] ? new Date(reached[passage]).toLocaleDateString() : '',
      };
    });
  });
  protected readonly unlockedCount = computed(
    () => this.endings().filter((e) => e.unlocked).length,
  );
  protected readonly achievements = computed(() => {
    const [reachEnd, allEndings] = [0, 3].map(
      (i) => this.library.list('@ViewEndings.specialAchievement')[i] ?? '',
    );
    const total = this.endings().length;
    return [
      { text: reachEnd || 'Reach the end of The Cost of Disease.', done: this.unlockedCount() > 0 },
      {
        text: allEndings || 'Complete all 8 Endings in The Cost of Disease.',
        done: total > 0 && this.unlockedCount() === total,
      },
    ];
  });

  protected t(key: string, fallback: string): string {
    return this.library.text(key, fallback);
  }
}
