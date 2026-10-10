import { Autofocus } from '../../../../shared/directives/autofocus/autofocus';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Out } from '@chronicle/engine';
import { Game } from '../../../../core/services/game';
import { Library } from '../../../../core/services/library';

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
  /** Each ranked player's place (1-based); equal scores share one, as in 1st, 1st, 3rd. */
  places: number[];
  familyWins: boolean;
  winners: number;
} {
  const ranking = [...players].sort((a, b) => b.score - a.score);
  const places = ranking.map((p) => ranking.findIndex((q) => q.score === p.score) + 1);
  const top = ranking[0]?.score ?? 0;
  const winners = ranking.filter((p) => p.score === top).length;
  return { ranking, places, familyWins: winners > 1, winners };
}

@Component({
  selector: 'cr-score',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autofocus, RouterLink],
  templateUrl: './score.html',
  styleUrl: './score.css',
})
export class Score {
  protected readonly library = inject(Library);
  private readonly game = inject(Game);
  private readonly router = inject(Router);

  protected readonly family = FAMILY;
  protected readonly ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
  protected readonly phase = signal<Phase>('entry');
  /** Steps taken, for Back: scores can still be corrected after the tie-breakers. */
  private readonly steps = signal<Phase[]>([]);
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

  private go(next: Phase): void {
    this.steps.update((s) => [...s, this.phase()]);
    this.phase.set(next);
  }

  protected back(): void {
    const s = this.steps();
    const previous = s.at(-1);
    if (!previous) return;
    this.steps.set(s.slice(0, -1));
    // Tie-breakers are decided again from the scores as they are then.
    if (previous === 'entry' || previous === 'masterwork') this.bonus.set({});
    this.phase.set(previous);
  }

  protected afterEntry(): void {
    this.bonus.set({});
    this.go(this.tied().length > 1 ? 'masterwork' : 'ranking');
  }

  protected afterMasterwork(): void {
    const done = this.contenders();
    if (done.length === 1) {
      this.bonus.set({ [done[0]!.index]: 1 });
      this.go('ranking');
    } else if (done.length > 1) {
      this.go('upgrades');
    } else {
      this.go('ranking'); // nobody completed it: the leaders stay tied → the family wins
    }
  }

  protected afterUpgrades(): void {
    this.bonus.set(
      Object.fromEntries(this.contenders().map((p) => [p.index, this.upgrades()[p.index] ?? 0])),
    );
    this.go('ranking');
  }

  /** The score a player entered (the ranking's order also counts the tie-breakers). */
  protected entered(i: number): number {
    return this.scores()[i] ?? 0;
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
