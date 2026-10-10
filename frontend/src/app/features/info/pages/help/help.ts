import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { AudioPlayer } from '../../../../core/services/audio';
import { Library } from '../../../../core/services/library';
import { RichText } from '../../../storybook/components/rich-text/rich-text';
import { Tabs } from '../../../../shared/components/tabs/tabs';

const TABS = [
  { id: 'HowToUSe', key: 'HowToUSebtn/howtouseText', label: 'How to use' },
  { id: 'StoryActions', key: 'StoryActionsbtn/storyactionText', label: 'Story Actions' },
  { id: 'EndOfRound', key: 'EndOfRoundbtn/endofroundText', label: 'End of Round' },
] as const;

/** Chronicle's own tab: what the original's help can't know about. Written for this app. */
const CHRONICLE = {
  id: 'Chronicle',
  label: 'Chronicle',
  title: 'Using Chronicle',
  text: [
    '**Passing the storybook.** When a page is for one player only, a screen asks you to hand the device over first. Only that player taps “Ready – show the page”.',
    '**Undo.** ↶ at the top takes back the last choice. It asks first: the page before may be another player’s secret.',
    '**Log book.** The book at the top left lists what has happened so far.',
    '**Location pages.** Each action is a panel of its own: tap it when the game says so. The plate below the actions moves on to the next round.',
    '**Menu.** ☰ pauses the game. There you can switch the story to Easy English or Short, change the narrator, the paper and the volume – at any time. Easy and Short change only the story, never the rules.',
    '**Sound.** The speaker turns all sound off and on.',
    '**Saving.** The game saves after every step: close the app whenever you like and continue from the main menu. Once loaded, Chronicle also works offline; add it to your home screen from the browser’s menu.',
    '**Back.** Your device’s Back closes an open window. Windows that need an answer, such as a hand-over, stay.',
  ].join('\n\n'),
};

/** The original's help: how to use the storybook, story actions, end of round. */
@Component({
  selector: 'cr-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichText, Tabs],
  templateUrl: './help.html',
  styleUrl: './help.css',
})
export class Help {
  private readonly library = inject(Library);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly chronicle = CHRONICLE;
  protected readonly tabs = computed(() => [
    ...TABS.map((tab) => ({
      id: tab.id,
      label: this.library.text(`UI/Help/Viewarea/HowToUSe/${tab.key}`, tab.label),
    })),
    { id: CHRONICLE.id, label: CHRONICLE.label },
  ]);
  protected readonly active = signal<string>('HowToUSe');

  constructor() {
    inject(AudioPlayer).effect('help');
  }

  /** Back to where Help was opened from (the game or the title); the title if opened directly. */
  protected back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) this.location.back();
    else void this.router.navigate(['/']);
  }

  protected t(key: string): string {
    return this.library.text(key);
  }
}
