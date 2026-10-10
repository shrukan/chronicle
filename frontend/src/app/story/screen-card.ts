import { Autofocus } from '../ui/autofocus';
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
import { AudioPlayer } from '../core/audio';
import { Game } from '../core/game';
import { Library } from '../core/library';
import { Modal } from '../ui/modal';
import { RichText } from './rich-text';

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
  template: `
    @switch (screen().ui) {
      @case ('endOfRound') {
        @if (round(); as r) {
          <cr-modal
            [label]="text('UI/Help/Viewarea/EndOfRound/DetailsPanel/title', 'End of Round')"
          >
            <h2 class="heading title">
              {{ text('UI/Help/Viewarea/EndOfRound/DetailsPanel/title', 'End of Round') }}
            </h2>
            @if (marker(); as src) {
              <img class="marker" [src]="src" [alt]="'Round ' + r.round + ' of 9'" />
            }
            <p><cr-rich-text [text]="game.text(r.text)" /></p>
            <p><cr-rich-text [text]="game.text(r.then)" /></p>
            <div class="actions">
              <button crAutofocus type="button" class="btn confirm" (click)="continue()">
                {{ text('UI/EndOfRound/ViewArea/Acceptbtn/Text (TMP)', 'Confirm') }}
              </button>
            </div>
          </cr-modal>
        }
      }
      @case ('endOfGeneration') {
        <cr-modal [open]="!dismissed()" [label]="generationTitle">
          <h2 class="heading title">{{ generationTitle }}</h2>
          <p><cr-rich-text [text]="game.text(arg('text'))" /></p>
          <div class="actions">
            <button crAutofocus type="button" class="btn confirm" (click)="dismissed.set(true)">
              {{ text('UI/EndOfGeneration/ViewArea/Acceptbtn/Text (TMP)', 'Confirm') }}
            </button>
          </div>
        </cr-modal>
      }
      @case ('specialEvent') {
        <cr-modal [open]="!dismissed()" label="Special event">
          <div class="special">
            @if (library.ui('popup-panels/special-event-assets/special-event-text'); as src) {
              <img class="special-title" [src]="src" alt="Special event" />
            } @else {
              <h2 class="heading title">Special Event</h2>
            }
          </div>
          <div class="actions">
            <button crAutofocus type="button" class="btn confirm" (click)="dismissed.set(true)">
              {{ text('UI/SpecialEvent/ViewArea/Acceptbtn/Text (TMP)', 'Accept') }}
            </button>
          </div>
        </cr-modal>
      }
      @case ('bidding') {
        <cr-modal [label]="voting() ? 'Secret vote' : 'Secret bid'">
          <h2 class="heading title">{{ voting() ? 'Secret Vote' : 'Secret Bid' }}</h2>
          @switch (phase()) {
            @case ('ready') {
              @if (voting()) {
                <p>
                  Everyone secretly decides how to vote. Start the countdown when you are all ready.
                </p>
                <p>When you see the word 'REVEAL', simultaneously show everyone your vote.</p>
              } @else {
                <p>{{ text('UI/BidingSystem/ViewArea/Prompt/details1') }}</p>
                <p>{{ text('UI/BidingSystem/ViewArea/Prompt/details2') }}</p>
              }
              <div class="actions">
                <button crAutofocus type="button" class="btn" (click)="startCountdown()">
                  {{
                    voting()
                      ? 'Start Voting'
                      : text('UI/BidingSystem/ViewArea/Prompt/start/Text (TMP)', 'Start Bidding')
                  }}
                </button>
              </div>
            }
            @case ('countdown') {
              <div class="countdown" aria-live="assertive">
                @if (library.ui('popup-panels/clock-graphic'); as src) {
                  <img [src]="src" alt="" />
                }
                <span>{{ count() }}</span>
              </div>
            }
            @case ('reveal') {
              <div class="reveal" aria-live="assertive">
                {{ text('UI/BidingSystem/ViewArea/Prompt/BG/Reveal/RevealText', 'Reveal') }}
              </div>
              <div class="actions">
                <button crAutofocus type="button" class="btn confirm" (click)="continue()">
                  {{ text('UI/BidingSystem/ViewArea/Acceptbtn/Text (TMP)', 'Accept') }}
                </button>
              </div>
            }
          }
        </cr-modal>
      }
      @case ('scoreEntry') {
        <div class="actions inline">
          <button crAutofocus type="button" class="btn" (click)="router.navigate(['/score'])">
            {{ text('UI/Scoring/ViewArea/Title', 'Score Entry') }}
          </button>
        </div>
      }
      @case ('generationEndingContinue') {
        <!-- In the original this enables the ending screen's continue button; nothing to show. -->
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .title {
      margin: 0 0 1rem;
      font-size: 1.5rem;
      text-align: center;
    }
    .actions {
      display: flex;
      justify-content: center;
      margin-top: 1.25rem;
    }
    .actions.inline {
      margin: 1rem 0;
    }
    .marker {
      display: block;
      height: 3rem;
      margin: -0.5rem auto 1rem;
      object-fit: contain;
    }
    .special {
      display: flex;
      justify-content: center;
      padding: 1rem 0;
    }
    .special-title {
      max-width: 100%;
      animation: emerge 1.2s ease-out;
    }
    @keyframes emerge {
      from {
        opacity: 0;
        letter-spacing: 0.5em;
        filter: blur(4px);
      }
    }
    .countdown {
      position: relative;
      display: grid;
      place-items: center;
      height: 9rem;
    }
    .countdown img {
      position: absolute;
      height: 8rem;
      opacity: 0.5;
    }
    .countdown span {
      position: relative;
      font-family: var(--font-display);
      font-size: 4rem;
      color: var(--color-heading);
    }
    .reveal {
      padding: 2rem 0;
      text-align: center;
      font-family: var(--font-display);
      font-size: 3rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--color-accent-text);
      animation: emerge 0.6s ease-out;
    }
  `,
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
