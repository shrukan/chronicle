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
import { Modal } from '../../../../shared/components/modal/modal';
import { RichText } from '../rich-text/rich-text';

type Screen = Extract<Out, { t: 'ui' }>;

const ROMAN = ['i', 'ii', 'iii'];

/**
 * App screens the story opens: end of round / generation, special events, secret bids and
 * votes, final scoring. They appear as dialogs over the story, like in the original.
 */
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
    const round = this.round()?.round;
    if (!round) return undefined;
    return this.library.ui(
      `progress-bar/${ROMAN[Math.floor((round - 1) / 3)]}${((round - 1) % 3) + 1}-glow`,
    );
  });

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
