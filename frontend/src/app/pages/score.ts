import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Out } from '@chronicle/engine';
import { Game } from '../core/game';
import { Library } from '../core/library';

interface Player {
  index: number;
  name: string;
  score: number;
}

type Phase = 'entry' | 'masterwork' | 'upgrades' | 'ranking';

/** The family wins together when the tie-breakers can't separate the leaders. */
export const FAMILY = 'The family';

/**
 * Final scoring as in the original app:
 * 1. everyone enters their score; a single leader wins;
 * 2. tied leaders: who completed their Masterwork? exactly one → +1 and wins;
 * 3. several → each adds their Estate Upgrades; still tied → the family wins together.
 * Fixes: the original left out player 5, and made "nobody completed it" unreachable.
 */
export function rankPlayers(players: Player[]): {
  ranking: Player[];
  familyWins: boolean;
  winners: number;
} {
  const ranking = [...players].sort((a, b) => b.score - a.score);
  const top = ranking[0]?.score ?? 0;
  const winners = ranking.filter((p) => p.score === top).length;
  return { ranking, familyWins: winners > 1, winners };
}

@Component({
  selector: 'cr-score',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="paper sheet">
      @if (!link()) {
        <p>Scoring opens at the end of the game.</p>
        <a class="btn" routerLink="/play">Back to the story</a>
      } @else {
        @switch (phase()) {
          @case ('entry') {
            <h1 class="heading">{{ t('UI/Scoring/ViewArea/Title', 'Score Entry') }}</h1>
            <table>
              <thead>
                <tr>
                  <th>
                    {{ t('UI/Scoring/ViewArea/ScorePanel/VerticalList/Titles/Player', 'Player') }}
                  </th>
                  <th>
                    {{ t('UI/Scoring/ViewArea/ScorePanel/VerticalList/Titles/Score', 'Score') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (p of players(); track p.index) {
                  <tr>
                    <td>{{ p.name }}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        inputmode="numeric"
                        [attr.aria-label]="'Score of ' + p.name"
                        [value]="scores()[p.index] ?? ''"
                        (input)="setScore(p.index, $any($event.target).value)"
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <button type="button" class="btn" [disabled]="!allScored()" (click)="afterEntry()">
              {{ continueLabel() }}
            </button>
          }

          @case ('masterwork') {
            <h1 class="heading">{{ t('UI/TieBreak/ViewArea/Title', 'Tie Breaker') }}</h1>
            <table>
              <thead>
                <tr>
                  <th>
                    {{ t('UI/TieBreak/ViewArea/Prompt/TieBreaker1/Titles/Player', 'Player') }}
                  </th>
                  <th>
                    {{
                      t(
                        'UI/TieBreak/ViewArea/Prompt/TieBreaker1/Titles/Completed Masterwork',
                        'Completed Masterwork'
                      )
                    }}
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (p of tied(); track p.index) {
                  <tr>
                    <td>{{ p.name }}</td>
                    <td>
                      <input
                        type="checkbox"
                        [attr.aria-label]="p.name + ' completed their Masterwork'"
                        [checked]="completed().has(p.index)"
                        (change)="toggleCompleted(p.index)"
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <button type="button" class="btn" (click)="afterMasterwork()">
              {{ continueLabel() }}
            </button>
          }

          @case ('upgrades') {
            <h1 class="heading">{{ t('UI/TieBreak/ViewArea/Title', 'Tie Breaker') }}</h1>
            <table>
              <thead>
                <tr>
                  <th>
                    {{ t('UI/TieBreak/ViewArea/Prompt/TieBreaker2/Titles/Player', 'Player') }}
                  </th>
                  <th>
                    {{
                      t(
                        'UI/TieBreak/ViewArea/Prompt/TieBreaker2/Titles/Estate Upgrades',
                        'Estate Upgrades'
                      )
                    }}
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (p of contenders(); track p.index) {
                  <tr>
                    <td>{{ p.name }}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        inputmode="numeric"
                        [attr.aria-label]="'Estate Upgrades of ' + p.name"
                        [value]="upgrades()[p.index] ?? ''"
                        (input)="setUpgrades(p.index, $any($event.target).value)"
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <button type="button" class="btn" [disabled]="!allUpgrades()" (click)="afterUpgrades()">
              {{ continueLabel() }}
            </button>
          }

          @case ('ranking') {
            <h1 class="heading">{{ t('UI/RankingPage/ViewArea/Title', 'Rankings') }}</h1>
            <ol class="ranking">
              @for (p of result().ranking; track p.index; let i = $index) {
                <li>
                  <span class="place">{{ places[i] }}</span>
                  <span class="name">{{ p.name }}</span>
                  @if (isWinner(i) && library.ui('ranking/mfw-crown-icon'); as crown) {
                    <img class="crown" [src]="crown" alt="winner" />
                  }
                </li>
              }
            </ol>
            @if (result().familyWins) {
              <p class="family">{{ family }} share the victory.</p>
            }
            <button type="button" class="btn" (click)="finish()">{{ continueLabel() }}</button>
          }
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .sheet {
      display: grid;
      justify-items: center;
      gap: 1.25rem;
      max-width: 30rem;
      margin: 0 auto;
      text-align: center;
    }
    h1 {
      margin: 0;
      font-size: 2rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      font-family: var(--font-display);
      font-weight: normal;
      color: var(--color-muted);
      border-bottom: 1px solid var(--color-rule);
      padding: 0.3rem;
    }
    td {
      padding: 0.4rem;
      font-size: 1.15rem;
    }
    td input[type='number'] {
      width: 6rem;
      padding: 0.35rem;
      border: 1px solid var(--color-rule);
      border-radius: 0.3rem;
      background: rgb(255 255 255 / 0.6);
      font: inherit;
      text-align: center;
    }
    td input[type='checkbox'] {
      width: 1.4rem;
      height: 1.4rem;
      accent-color: var(--color-accent);
    }
    .ranking {
      list-style: none;
      margin: 0;
      padding: 0;
      width: 100%;
      display: grid;
      gap: 0.5rem;
    }
    .ranking li {
      display: grid;
      grid-template-columns: 3rem 1fr 2.5rem;
      align-items: center;
      padding: 0.4rem 0.75rem;
      border-bottom: 1px solid var(--color-rule);
      text-align: left;
    }
    .place {
      font-family: var(--font-display);
      color: var(--color-muted);
    }
    .name {
      font-size: 1.25rem;
    }
    .crown {
      width: 2rem;
      height: 2rem;
      object-fit: contain;
    }
    .family {
      font-style: italic;
    }
  `,
})
export class Score {
  protected readonly library = inject(Library);
  private readonly game = inject(Game);
  private readonly router = inject(Router);

  protected readonly family = FAMILY;
  protected readonly places = ['1st', '2nd', '3rd', '4th', '5th'];
  protected readonly phase = signal<Phase>('entry');
  protected readonly scores = signal<Record<number, number>>({});
  protected readonly completed = signal(new Set<number>());
  protected readonly upgrades = signal<Record<number, number>>({});
  private readonly bonus = signal<Record<number, number>>({});

  /** The scoring screen's continue link in the story. */
  protected readonly link = computed(() => {
    const find = (out: Out[]): number | undefined => {
      for (const o of out) {
        if (o.t === 'ui' && o.ui === 'scoreEntry' && o.link) return o.link;
        if (o.t === 'block' || o.t === 'group') {
          const inner = find(o.children);
          if (inner) return inner;
        }
      }
      return undefined;
    };
    return find(this.game.view()?.output ?? []);
  });

  protected readonly players = computed(() =>
    this.game.playerNames().map((name, index) => ({ index, name })),
  );
  private readonly totals = computed<Player[]>(() =>
    this.players().map((p) => ({
      ...p,
      score: (this.scores()[p.index] ?? 0) + (this.bonus()[p.index] ?? 0),
    })),
  );
  protected readonly result = computed(() => rankPlayers(this.totals()));
  protected readonly tied = computed(() => {
    const { ranking } = rankPlayers(this.totals());
    return ranking.filter((p) => p.score === ranking[0]?.score);
  });
  protected readonly contenders = computed(() =>
    this.tied().filter((p) => this.completed().has(p.index)),
  );
  protected readonly allScored = computed(() =>
    this.players().every((p) => this.scores()[p.index] !== undefined),
  );
  protected readonly allUpgrades = computed(() =>
    this.contenders().every((p) => this.upgrades()[p.index] !== undefined),
  );
  protected readonly continueLabel = computed(() =>
    this.t('UI/Scoring/ViewArea/ContinueBtn/Text (TMP)', 'Continue'),
  );

  protected t(key: string, fallback: string): string {
    return this.library.text(key, fallback);
  }

  private static parse(v: string): number | undefined {
    const n = Number(v);
    return v.trim() === '' || !Number.isInteger(n) || n < 0 ? undefined : n;
  }

  protected setScore(i: number, v: string): void {
    const n = Score.parse(v);
    this.scores.update((s) => {
      const next = { ...s };
      if (n === undefined) delete next[i];
      else next[i] = n;
      return next;
    });
  }

  protected setUpgrades(i: number, v: string): void {
    const n = Score.parse(v);
    this.upgrades.update((s) => {
      const next = { ...s };
      if (n === undefined) delete next[i];
      else next[i] = n;
      return next;
    });
  }

  protected toggleCompleted(i: number): void {
    this.completed.update((s) => {
      const next = new Set(s);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  }

  protected afterEntry(): void {
    this.phase.set(this.tied().length > 1 ? 'masterwork' : 'ranking');
  }

  protected afterMasterwork(): void {
    const done = this.contenders();
    if (done.length === 1) {
      this.bonus.set({ [done[0]!.index]: 1 });
      this.phase.set('ranking');
    } else if (done.length > 1) {
      this.phase.set('upgrades');
    } else {
      this.phase.set('ranking'); // nobody completed it: the leaders stay tied → the family wins
    }
  }

  protected afterUpgrades(): void {
    this.bonus.set(
      Object.fromEntries(this.contenders().map((p) => [p.index, this.upgrades()[p.index] ?? 0])),
    );
    this.phase.set('ranking');
  }

  protected isWinner(i: number): boolean {
    return i < this.result().winners;
  }

  protected async finish(): Promise<void> {
    const { ranking, familyWins } = this.result();
    const link = this.link();
    if (!link) return;
    this.game.click(link, { winnerName: familyWins ? FAMILY : ranking[0]!.name });
    await this.router.navigate(['/play']);
  }
}
