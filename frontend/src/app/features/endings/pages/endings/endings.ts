import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Game } from '../../../../core/services/game';
import { Library } from '../../../../core/services/library';
import { SaveStore } from '../../../../core/services/save-store';
import { Tabs } from '../../../../shared/components/tabs/tabs';

/**
 * Endings and achievements unlocked on this device. Locked endings stay hidden ("???"), as
 * in the original, so the gallery gives nothing away.
 */
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
