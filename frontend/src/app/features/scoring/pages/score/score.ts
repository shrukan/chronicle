import { Autofocus } from '../../../../shared/directives/autofocus/autofocus';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Out } from '@chronicle/engine';
import { Game } from '../../../../core/services/game';
import { Library } from '../../../../core/services/library';
import { bugReportUrl } from '../../../../core/utils/bug-report';

interface Player {
  index: number;
  name: string;
  score: number;
}

type Phase = 'entry' | 'ranking';

/** The family wins together when the tie-breakers can't separate the leaders. */
export const FAMILY = 'The family';

/**
 * Final scoring as in the original app:
 * 1. everyone enters their score; a single leader wins;
 * 2. tied leaders: who completed their Masterwork? exactly one → +1 and wins;
 * 3. several → each adds their Estate Upgrades; still tied → the family wins together.
 * Fixes: the original left out player 5, and made "nobody completed it" unreachable.
 * `tieBreak` decides steps 2 and 3, `rankPlayers` the order.
 */

/**
 * Points the tie-breakers add, by player: none without a tie among the leaders; +1 for the only
 * tied leader who completed their Masterwork; their Estate Upgrades when several did.
 */
export function tieBreak(
  players: Player[],
  completed: ReadonlySet<number>,
  upgrades: Readonly<Record<number, number>>,
): Record<number, number> {
  const top = Math.max(...players.map((p) => p.score));
  const tied = players.filter((p) => p.score === top);
  if (tied.length < 2) return {};
  const done = tied.filter((p) => completed.has(p.index));
  if (done.length === 1) return { [done[0]!.index]: 1 };
  return Object.fromEntries(done.map((p) => [p.index, upgrades[p.index] ?? 0]));
}

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
  protected readonly game = inject(Game);
  private readonly router = inject(Router);

  protected readonly family = FAMILY;
  protected readonly ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
  /** Scores and tie-breakers on one page, then the ranking. */
  protected readonly phase = signal<Phase>('entry');
  protected readonly scores = signal<Record<number, number>>({});
  protected readonly completed = signal<ReadonlySet<number>>(new Set());
  protected readonly upgrades = signal<Record<number, number>>({});
  private readonly form = viewChild<ElementRef<HTMLElement>>('form');

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
  private readonly entered = computed<Player[]>(() =>
    this.players().map((p) => ({ ...p, score: this.scores()[p.index] ?? 0 })),
  );
  protected readonly allScored = computed(() =>
    this.players().every((p) => this.scores()[p.index] !== undefined),
  );
  /** The leaders by the scores entered, once all are in; the tie-breakers ask about them. */
  protected readonly tied = computed(() => {
    if (!this.allScored()) return [];
    const { ranking } = rankPlayers(this.entered());
    const leaders = ranking.filter((p) => p.score === ranking[0]?.score);
    return leaders.length > 1 ? leaders : [];
  });
  /** Tied leaders who completed their Masterwork: several → their Estate Upgrades decide. */
  protected readonly contenders = computed(() =>
    this.tied().filter((p) => this.completed().has(p.index)),
  );
  protected readonly needsUpgrades = computed(() => this.contenders().length > 1);
  protected readonly ready = computed(
    () =>
      this.allScored() &&
      (!this.needsUpgrades() ||
        this.contenders().every((p) => this.upgrades()[p.index] !== undefined)),
  );
  /** Points the tie-breakers add (see `tieBreak`). */
  private readonly bonus = computed(() =>
    tieBreak(this.entered(), this.completed(), this.upgrades()),
  );
  protected readonly result = computed(() =>
    rankPlayers(
      this.entered().map((p) => ({ ...p, score: p.score + (this.bonus()[p.index] ?? 0) })),
    ),
  );

  protected t(key: string, fallback: string): string {
    return this.library.text(key, fallback);
  }

  /** "Ada and Bram", "Ada, Bram and Cosima". */
  protected names(players: { name: string }[]): string {
    const names = players.map((p) => p.name);
    return names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
      : names.join('');
  }

  private static parse(v: string): number | undefined {
    const n = Number(v);
    return v.trim() === '' || !Number.isInteger(n) || n < 0 ? undefined : n;
  }

  private static set(record: Record<number, number>, i: number, v: string): Record<number, number> {
    const n = Score.parse(v);
    const next = { ...record };
    if (n === undefined) delete next[i];
    else next[i] = n;
    return next;
  }

  protected setScore(i: number, v: string): void {
    this.scores.update((s) => Score.set(s, i, v));
  }

  protected setUpgrades(i: number, v: string): void {
    this.upgrades.update((s) => Score.set(s, i, v));
  }

  protected toggleCompleted(i: number): void {
    this.completed.update((s) => {
      const next = new Set(s);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  }

  /**
   * Enter (the keyboard's Next) moves to the next field – a tie-breaker's first question
   * included – and on the last one shows the ranking.
   */
  protected next(event: Event): void {
    event.preventDefault();
    const fields = [
      ...(this.form()?.nativeElement.querySelectorAll<HTMLInputElement>('input') ?? []),
    ];
    const following = fields[fields.indexOf(event.target as HTMLInputElement) + 1];
    if (following) following.focus();
    else if (this.ready()) this.phase.set('ranking');
  }

  /**
   * Why a tied leader ranks where they do: the ranking shows the scores entered, so the
   * tie-breaker that decided is named under the name.
   */
  protected tieNote(i: number): string | undefined {
    const points = this.bonus()[i];
    if (points === undefined) return undefined;
    if (this.contenders().length === 1) return 'Completed Masterwork';
    return `${points} Estate Upgrade${points === 1 ? '' : 's'}`;
  }

  protected isWinner(i: number): boolean {
    return i < this.result().winners;
  }

  /** The score a player entered (the ranking's order also counts the tie-breakers). */
  protected scoreOf(i: number): number {
    return this.scores()[i] ?? 0;
  }

  protected bugReport(error: string): string {
    return bugReportUrl({ error, where: 'Scoring' });
  }

  protected async finish(): Promise<void> {
    const { ranking, familyWins } = this.result();
    const link = this.link();
    if (!link) return;
    this.game.click(link, { winnerName: familyWins ? FAMILY : ranking[0]!.name });
    // A story error stays here, shown below, instead of back on the page that opened scoring.
    if (!this.game.error()) await this.router.navigate(['/play']);
  }
}
