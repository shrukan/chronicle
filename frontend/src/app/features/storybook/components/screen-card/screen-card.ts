import { Autofocus } from '../../../../shared/directives/autofocus/autofocus';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnDestroy,
  type OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { toText, type Out } from '@chronicle/engine';
import { AudioPlayer } from '../../../../core/services/audio';
import { Game } from '../../../../core/services/game';
import { Library } from '../../../../core/services/library';
import {
  generationNumeral,
  ROUNDS,
  ROUNDS_PER_GENERATION,
  roundPosition,
} from '../../../../core/utils/rounds';
import { Modal } from '../../../../shared/components/modal/modal';
import { RichText } from '../rich-text/rich-text';

type Screen = Extract<Out, { t: 'ui' }>;

/**
 * App screens the story opens: end of round / generation, special events, secret bids and
 * votes, final scoring. They appear as dialogs over the story, like in the original.
 */
/** A text's sentences, one step each ("Remove all pieces. Return the cards." → two). */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?](?:\*\*)?)\s+(?=[A-Z*{])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

@Component({
  selector: 'cr-screen-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autofocus, RichText, Modal],
  templateUrl: './screen-card.html',
  styleUrl: './screen-card.css',
})
export class ScreenCard implements OnInit, OnDestroy {
  protected readonly game = inject(Game);
  protected readonly library = inject(Library);
  protected readonly router = inject(Router);
  private readonly audio = inject(AudioPlayer);
  readonly screen = input.required<Screen>();

  protected readonly dismissed = signal(false);
  protected readonly phase = signal<'ready' | 'countdown' | 'reveal'>('ready');
  protected readonly count = signal(3);
  private timer?: ReturnType<typeof setInterval>;

  protected readonly round = computed(
    () => this.game.content()?.extras.endOfRound[this.arg('progress')],
  );
  protected readonly voting = computed(() => this.arg('mode') === 'Voting');
  /** The round just completed, as the original's glowing marker (I-1 … III-3). */
  protected readonly marker = computed(() => {
    const n = this.round()?.round;
    if (!n) return undefined;
    const { generation, round } = roundPosition(n);
    const numeral = generationNumeral(generation).toLowerCase();
    return this.library.ui(`progress-bar/${numeral}${round}-glow`);
  });

  /**
   * The end of a round as steps: the original's first sentence says which round ended, the
   * others what to do, in order. Its wording stays as it is; only the layout changes.
   */
  protected readonly roundSteps = computed(() => {
    const r = this.round();
    if (!r) return undefined;
    const [ended = '', ...todo] = sentences(this.game.text(r.text));
    return { ended, steps: [...todo, ...sentences(this.game.text(r.then))] };
  });
  /** The third round's end leads to the end of the generation, not to a next round. */
  protected readonly lastRound = computed(
    () => (this.round()?.round ?? 0) % ROUNDS_PER_GENERATION === 0,
  );
  protected readonly rounds = ROUNDS;
  protected readonly generationSteps = computed(() => sentences(this.game.text(this.arg('text'))));

  protected get generationTitle(): string {
    return this.text(
      'UI/EndOfGeneration/ViewArea/MainPanel/HeaderTitle/EndOfRoundText',
      'End of Generation',
    );
  }

  ngOnInit(): void {
    const sound = {
      endOfRound: 'endOfRound',
      endOfGeneration: 'endOfRound',
      specialEvent: 'specialEvent',
      bidding: 'biddingOpen',
    }[this.screen().ui];
    if (sound) this.audio.effect(sound);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  protected text(key: string, fallback = ''): string {
    return this.library.text(key, fallback);
  }

  protected arg(name: string): string {
    const v = this.screen().args[name];
    return v === undefined ? '' : toText(v);
  }

  protected startCountdown(): void {
    this.phase.set('countdown');
    this.count.set(3);
    this.timer = setInterval(() => {
      if (this.count() > 1) this.count.update((c) => c - 1);
      else {
        clearInterval(this.timer);
        this.phase.set('reveal');
        this.audio.effect('reveal');
      }
    }, 1000);
  }

  /** Moves the story on; not a choice of its own, so undo returns to before this screen. */
  protected continue(): void {
    const link = this.screen().link;
    if (link) this.game.click(link, undefined, false);
  }
}
