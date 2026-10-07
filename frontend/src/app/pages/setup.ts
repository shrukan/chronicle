import { Autofocus } from '../ui/autofocus';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { AudioPlayer } from '../core/audio';
import { SCENARIOS } from '../core/content';
import { Game } from '../core/game';
import { Library } from '../core/library';
import { Settings, type Voice } from '../core/settings';
import { RichText } from '../story/rich-text';

type Step =
  'voice' | 'players' | 'intro' | 'name' | 'welcome' | 'village' | 'villageIntro' | 'scenario';

const LETTERS = 'ABCDE';

/**
 * The original setup flow: voice → number of players → introduction → each player's name
 * (with a welcome letter) → village → its introduction → scenario. Texts are the original's.
 */
@Component({
  selector: 'cr-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autofocus, FormField, FormRoot, RichText],
  template: `
    <section class="paper sheet">
      @switch (step()) {
        @case ('voice') {
          <h1 class="heading">
            {{ t('UI/VoiceTrack/Viewarea/Prompt/Heading', 'Choose Audio Voice') }}
          </h1>
          <div class="choices">
            @for (v of voices; track v.value) {
              <button
                type="button"
                class="choice"
                [class.selected]="settings.voice() === v.value"
                (click)="settings.voice.set(v.value)"
              >
                {{ t(v.key, v.fallback) }}
              </button>
            }
          </div>
          <button crAutofocus type="button" class="btn" (click)="go('players')">
            {{ continueLabel() }}
          </button>
        }

        @case ('players') {
          <h1 class="heading">Players</h1>
          <p>
            {{
              t(
                'UI/GamePlayerCounts/ViewArea/Description',
                'How many individuals will be sharing this experience today?'
              )
            }}
          </p>
          <div class="choices players">
            @for (n of [2, 3, 4, 5]; track n) {
              <button
                type="button"
                class="choice"
                [class.selected]="players() === n"
                (click)="players.set(n)"
              >
                {{ n }} Players
              </button>
            }
          </div>
          <button crAutofocus type="button" class="btn" (click)="go('intro')">
            {{ continueLabel() }}
          </button>
        }

        @case ('intro') {
          <p class="letter">
            <cr-rich-text [text]="introPanel()" />
          </p>
          <button crAutofocus type="button" class="btn" (click)="startNames()">
            {{ continueLabel() }}
          </button>
        }

        @case ('name') {
          <form [formRoot]="nameForm" class="form">
            <p class="tooltip">{{ passTo() }}</p>
            <label class="field">
              {{ namePrompt() }}
              <input crAutofocus type="text" [formField]="nameForm.name" autocomplete="off" />
            </label>
            <button type="submit" class="btn" [disabled]="nameForm().invalid()">
              {{ continueLabel() }}
            </button>
          </form>
        }

        @case ('welcome') {
          <div class="letter">
            <p>
              {{
                t('UI/PlayerIntro/ViewArea/PLayerNamePaper/Text', "Welcome to My Father's Work,")
              }}
            </p>
            <p class="name">{{ names()[current()] }}</p>
            <p>{{ t('@ViewPlayerIntro.introText' + (current() + 1), 'Our warmest regards.') }}</p>
          </div>
          <button crAutofocus type="button" class="btn" (click)="nextName()">
            {{ continueLabel() }}
          </button>
        }

        @case ('village') {
          <form [formRoot]="villageForm" class="form">
            <h1 class="heading">The Village</h1>
            <p>{{ t('UI/VillageEntery/ViewArea/DescriptionText') }}</p>
            <label class="field">
              {{
                t(
                  'UI/VillageEntery/ViewArea/DescriptionText1',
                  'Please collectively enter the name of the town in which your inheritance resides.'
                )
              }}
              <input crAutofocus type="text" [formField]="villageForm.village" autocomplete="off" />
            </label>
            <button type="submit" class="btn" [disabled]="villageForm().invalid()">
              {{ continueLabel() }}
            </button>
          </form>
        }

        @case ('villageIntro') {
          <div class="letter">
            <p>
              <cr-rich-text [text]="villageIntro()" />
            </p>
            <p>
              {{
                t(
                  'UI/VillageIntro/ViewArea/Paper/DescriptionText1',
                  'Thank you and please do excuse our forgetfulness.'
                )
              }}
            </p>
          </div>
          <button crAutofocus type="button" class="btn" (click)="go('scenario')">
            {{ continueLabel() }}
          </button>
        }

        @case ('scenario') {
          <h1 class="heading">Scenario</h1>
          <p>
            {{ t('@ViewScenarios.chooseText', 'Choose a Scenario for') }} {{ players() }}
            {{ t('@ViewScenarios.playerText', 'players:') }}
          </p>
          <div class="scenarios">
            @for (s of scenarioCards; track s.id) {
              <button
                crAutofocus
                type="button"
                class="scenario"
                [disabled]="!s.available"
                (click)="start(s.id)"
              >
                @if (library.ui(s.image); as src) {
                  <img [src]="src" alt="" />
                }
                <strong>{{ t(s.titleKey, s.title) }}</strong>
                <span>{{ s.available ? t(s.detailsKey) : 'Coming later' }}</span>
              </button>
            }
          </div>
        }
      }

      @if (step() !== 'voice') {
        <button type="button" class="back" (click)="back()">‹ Back</button>
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
      gap: 1rem;
      max-width: 34rem;
      margin: 0 auto;
      text-align: center;
    }
    h1 {
      margin: 0;
      font-size: 2rem;
    }
    .choices {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.6rem;
    }
    .choices.players {
      display: grid;
      grid-template-columns: repeat(2, minmax(7rem, 1fr));
    }
    .choice {
      padding: 0.6rem 1rem;
      border: 1px solid var(--color-rule);
      border-radius: 0.4rem;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .choice.selected {
      border-color: var(--color-accent);
      background: var(--color-accent);
      color: var(--color-on-accent);
    }
    .letter {
      max-width: 28rem;
      font-size: 1.15rem;
      line-height: 1.6;
      font-style: italic;
    }
    .letter .name {
      font-family: var(--font-display);
      font-style: normal;
      font-size: 1.8rem;
      color: var(--color-heading);
      margin: 0.25rem 0;
    }
    .form {
      display: grid;
      gap: 1rem;
      justify-items: center;
      width: 100%;
    }
    .form .field {
      width: min(22rem, 100%);
      text-align: left;
    }
    .tooltip {
      font-style: italic;
      color: var(--color-muted);
    }
    .scenarios {
      display: grid;
      gap: 0.75rem;
      width: 100%;
    }
    .scenario {
      display: grid;
      grid-template-columns: 5rem 1fr;
      grid-template-rows: auto 1fr;
      column-gap: 0.75rem;
      padding: 0.6rem;
      border: 1px solid var(--color-rule);
      border-radius: 0.4rem;
      background: rgb(255 255 255 / 0.35);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .scenario img {
      grid-row: span 2;
      width: 5rem;
      height: 6rem;
      object-fit: cover;
      border-radius: 0.25rem;
    }
    .scenario strong {
      font-family: var(--font-display);
      font-weight: normal;
      font-size: 1.2rem;
      color: var(--color-heading);
    }
    .scenario span {
      font-size: 0.95rem;
    }
    .scenario:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .back {
      order: -1;
      justify-self: start;
      margin: -0.5rem 0 -0.5rem -0.25rem;
      border: 0;
      background: none;
      color: var(--color-muted);
      font: inherit;
      cursor: pointer;
    }
  `,
})
export class Setup {
  protected readonly library = inject(Library);
  protected readonly settings = inject(Settings);
  private readonly game = inject(Game);
  private readonly router = inject(Router);
  private readonly audio = inject(AudioPlayer);

  protected readonly step = signal<Step>('voice');
  private readonly history: Step[] = [];
  protected readonly players = signal(3);
  protected readonly names = signal<string[]>(['', '', '', '', '']);
  protected readonly current = signal(0);
  private readonly village = signal('');

  protected readonly voices: { value: Voice; key: string; fallback: string }[] = [
    { value: 'female', key: 'UI/VoiceTrack/Viewarea/Prompt/Female/Lable', fallback: 'Feminine' },
    { value: 'male', key: 'UI/VoiceTrack/Viewarea/Prompt/Male/Lable', fallback: 'Masculine' },
  ];

  protected readonly scenarioCards = SCENARIOS_UI;

  protected readonly continueLabel = computed(() =>
    this.t('UI/PlayerIntro/ViewArea/MFWPaper/ContinueBtn2/Text (TMP)', 'Continue'),
  );
  protected readonly introPanel = computed(() => {
    const word =
      this.library.list('@ViewPlayerIntro.LanguageWiseNumberWord')[this.players() - 2] ??
      String(this.players());
    return `${this.t('@ViewPlayerIntro.introPanelText1')} ${word} ${this.t('@ViewPlayerIntro.introPanelText2')}`;
  });
  protected readonly namePrompt = computed(() =>
    this.t(
      'UI/PlayerSelection/ViewArea/DescriptionText',
      'Player A - Please enter your given name:',
    ).replace('Player A', `Player ${LETTERS[this.current()]}`),
  );
  protected readonly passTo = computed(() =>
    this.t(
      'UI/PlayerSelection/ViewArea/Tooltip/ToolTipText',
      'Carefully pass the storybook to Player A',
    ).replace('Player A', `Player ${LETTERS[this.current()]}`),
  );
  protected readonly villageIntro = computed(
    () =>
      `${this.t('@ViewVillageIntro.villageIntro1', 'Of course')}, **${this.village()}** ${this.t('@ViewVillageIntro.villageIntro2')}`,
  );

  private readonly nameModel = signal({ name: '' });
  protected readonly nameForm = form(this.nameModel, (p) => required(p.name), {
    submission: {
      action: async (f) => {
        const name = f.name().value().trim();
        this.names.update((n) => n.map((old, i) => (i === this.current() ? name : old)));
        this.go('welcome');
        return undefined;
      },
    },
  });

  private readonly villageModel = signal({ village: '' });
  protected readonly villageForm = form(this.villageModel, (p) => required(p.village), {
    submission: {
      action: async (f) => {
        this.village.set(f.village().value().trim());
        this.go('villageIntro');
        return undefined;
      },
    },
  });

  protected t(key: string, fallback = ''): string {
    return this.library.text(key, fallback);
  }

  protected go(step: Step): void {
    this.history.push(this.step());
    this.step.set(step);
  }

  protected back(): void {
    const prev = this.history.pop();
    if (prev) this.step.set(prev);
    if (prev === 'name' || prev === 'welcome')
      this.nameModel.set({ name: this.names()[this.current()] ?? '' });
  }

  protected startNames(): void {
    this.current.set(0);
    this.nameModel.set({ name: this.names()[0] ?? '' });
    this.audio.effect('footsteps');
    this.go('name');
  }

  protected nextName(): void {
    if (this.current() + 1 < this.players()) {
      this.current.update((c) => c + 1);
      this.nameModel.set({ name: this.names()[this.current()] ?? '' });
      this.audio.effect('footsteps');
      this.go('name');
    } else {
      this.villageModel.set({ village: this.village() });
      this.go('village');
    }
  }

  protected async start(id: string): Promise<void> {
    if (id !== this.game.scenarioId()) return;
    await this.game.newGame({
      players: this.players(),
      names: this.names(),
      village: this.village(),
    });
    await this.router.navigate(['/play']);
  }
}

/** The three scenarios as the original's chooser shows them; only The Cost of Disease is converted. */
const SCENARIOS_UI = [
  {
    id: 'cost-of-disease',
    title: 'The Cost of Disease',
    titleKey: 'UI/Scenarios/Viewarea/costOfDiseaseBtn/costofDiseaseTitle',
    detailsKey: 'UI/Scenarios/Viewarea/costOfDiseaseBtn/costofDiseaseDetails',
    image: 'scenario/mfw-scenario-1',
    available: SCENARIOS.some((s) => s.id === 'cost-of-disease'),
  },
  {
    id: 'fear-of-the-unknown',
    title: 'Fear of the Unknown',
    titleKey: 'UI/Scenarios/Viewarea/FearoftheUnknownBtn/industryForeverTitle',
    detailsKey: 'UI/Scenarios/Viewarea/FearoftheUnknownBtn/industryForeverDetails',
    image: 'scenario/mfw-scenario-2',
    available: false,
  },
  {
    id: 'a-time-of-war',
    title: 'A Time of War',
    titleKey: 'UI/Scenarios/Viewarea/timeOfWarBtn/timeOfWarTitle',
    detailsKey: 'UI/Scenarios/Viewarea/timeOfWarBtn/timeOfWarDetails',
    image: 'scenario/mfw-scenario-3',
    available: false,
  },
];
