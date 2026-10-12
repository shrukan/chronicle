import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { resolveText } from '@chronicle/engine';
import { SCENARIOS, type ScenarioId } from '../../../../core/services/content';
import { Game } from '../../../../core/services/game';
import { Library } from '../../../../core/services/library';
import { SaveStore } from '../../../../core/services/save-store';
import { Settings } from '../../../../core/services/settings';
import { Tabs } from '../../../../shared/components/tabs/tabs';

/**
 * Endings and achievements unlocked on this device, one scenario at a time (first the current
 * game's). Locked endings stay hidden ("???"), as in the original, so the gallery gives nothing
 * away.
 */
/** The scenarios in the original's order (its achievement texts follow it). */
const SCENARIOS_IN_ORIGINAL: string[] = ['cost-of-disease', 'fear-of-the-unknown', 'a-time-of-war'];

@Component({
  selector: 'cr-endings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Tabs],
  templateUrl: './endings.html',
  styleUrl: './endings.css',
})
export class Endings {
  private readonly library = inject(Library);
  private readonly game = inject(Game);
  private readonly saves = inject(SaveStore);
  private readonly settings = inject(Settings);

  protected readonly tab = signal('endings');
  protected readonly tabs = computed(() => [
    {
      id: 'endings',
      label: this.t('UI/Endings and Achievement/Viewarea/ending/Text (TMP)', 'Endings'),
    },
    {
      id: 'achievements',
      label: this.t('UI/Endings and Achievement/Viewarea/achievement/Text (TMP)', 'Achievements'),
    },
  ]);
  protected readonly scenarios = SCENARIOS;
  protected readonly scenario = signal<ScenarioId>(this.game.scenarioId());
  protected readonly scenarioName = computed(
    () => SCENARIOS.find((s) => s.id === this.scenario())?.title ?? '',
  );
  private readonly unlocks = resource({
    params: () => this.scenario(),
    loader: ({ params }) => this.saves.unlocks(params),
  });
  /** Ending titles need the scenario's strings. */
  private readonly content = resource({
    params: () => this.scenario(),
    loader: ({ params }) => this.game.contentOf(params),
  });

  protected readonly endings = computed(() => {
    const { scenario, strings } = this.content.value() ?? {};
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
          title?.t === 'text' && strings
            ? resolveText(strings, title.key, this.settings.readingMode(), 'title').replace(
                /\*/g,
                '',
              )
            : passage,
        date: reached[passage] ? new Date(reached[passage]).toLocaleDateString() : '',
      };
    });
  });
  protected readonly unlockedCount = computed(
    () => this.endings().filter((e) => e.unlocked).length,
  );
  protected readonly achievements = computed(() => {
    // The original lists the first-ending achievements of all scenarios, then the all-endings ones.
    const index = SCENARIOS_IN_ORIGINAL.indexOf(this.scenario());
    const [reachEnd, allEndings] = [index, index + 3].map(
      (i) => this.library.list('@ViewEndings.specialAchievement')[i] ?? '',
    );
    const name = this.scenarioName();
    const total = this.endings().length;
    return [
      { text: reachEnd || `Reach the end of ${name}.`, done: this.unlockedCount() > 0 },
      {
        text: allEndings || `Complete all ${total} Endings in ${name}.`,
        done: total > 0 && this.unlockedCount() === total,
      },
    ];
  });

  protected t(key: string, fallback: string): string {
    return this.library.text(key, fallback);
  }
}
