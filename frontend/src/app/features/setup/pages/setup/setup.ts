import { Autofocus } from '../../../../shared/directives/autofocus/autofocus';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { AudioPlayer } from '../../../../core/services/audio';
import { SCENARIOS } from '../../../../core/services/content';
import { Game } from '../../../../core/services/game';
import { Library } from '../../../../core/services/library';
import { Settings } from '../../../../core/services/settings';
import { RichText } from '../../../storybook/components/rich-text/rich-text';

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
  templateUrl: './setup.html',
  styleUrl: './setup.css',
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

  /** "Players" from the original's plate ("2 Players"; it has none for five). */
  protected playersLabel(n: number): string {
    return this.t(
      `UI/GamePlayerCounts/ViewArea/playerCountButtonParent/Player${n}/P${n}Text`,
      `${n} Players`,
    );
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
