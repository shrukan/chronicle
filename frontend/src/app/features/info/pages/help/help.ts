import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioPlayer } from '../../../../core/services/audio';
import { Library } from '../../../../core/services/library';
import { RichText } from '../../../storybook/components/rich-text/rich-text';
import { Tabs } from '../../../../shared/components/tabs/tabs';

const TABS = [
  { id: 'HowToUSe', key: 'HowToUSebtn/howtouseText', label: 'How to use' },
  { id: 'StoryActions', key: 'StoryActionsbtn/storyactionText', label: 'Story Actions' },
  { id: 'EndOfRound', key: 'EndOfRoundbtn/endofroundText', label: 'End of Round' },
] as const;

/** The original's help: how to use the storybook, story actions, end of round. */
@Component({
  selector: 'cr-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RichText, Tabs],
  templateUrl: './help.html',
  styleUrl: './help.css',
})
export class Help {
  private readonly library = inject(Library);
  protected readonly tabs = computed(() =>
    TABS.map((tab) => ({
      id: tab.id,
      label: this.library.text(`UI/Help/Viewarea/HowToUSe/${tab.key}`, tab.label),
    })),
  );
  protected readonly active = signal<string>('HowToUSe');

  constructor() {
    inject(AudioPlayer).effect('help');
  }

  protected t(key: string): string {
    return this.library.text(key);
  }
}
