import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Location, NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { AudioPlayer } from '../../../../core/services/audio';
import { Install } from '../../../../core/services/install';
import { Library } from '../../../../core/services/library';
import { RichText } from '../../../storybook/components/rich-text/rich-text';
import { RoundBar } from '../../../../shared/components/round-bar/round-bar';
import { Tabs } from '../../../../shared/components/tabs/tabs';

/** What a topic shows beside its text: the thing on screen it is about. */
type Picture =
  'app' | 'panel' | 'rounds' | 'hand' | 'book' | 'undo' | 'crown' | 'menu' | 'sound' | 'versions';

/** Pictures shown below the text, across the card. */
const WIDE: Picture[] = ['panel', 'rounds', 'versions'];

interface Topic {
  title: string;
  text: string;
  /** How it works in Chronicle, after an original text that describes the original app. */
  note?: string;
  picture?: Picture;
}

/** The original's help texts (title and details), shown word for word. */
const ORIGINAL = {
  howToUse: 'HowToUSe',
  storyActions: 'StoryActions',
  endOfRound: 'EndOfRound',
} as const;

/** Chronicle's own topics: what the original's help can't know about. Written for this app. */
const PLAYING: Topic[] = [
  {
    title: 'Passing the storybook',
    text: 'When a page is for one player only, a screen asks you to hand the device over first. Only that player taps “Ready – show the page”.',
    picture: 'hand',
  },
  {
    title: 'Log book',
    text: 'Lists what has happened so far, page by page.',
    picture: 'book',
  },
  {
    title: 'Undo',
    text: 'Takes back the last choice. It asks first: the page before may be another player’s secret.',
    picture: 'undo',
  },
  {
    title: 'Final scoring',
    text: 'At the end, enter everyone’s score. When the leaders tie, Chronicle asks the tie-breakers right below and names the one that decided.',
    picture: 'crown',
  },
];

const SAVES: Topic[] = [
  {
    title: 'Saving',
    text: 'The game saves after every step: close the app whenever you like and continue from the main menu.',
  },
  {
    title: 'Saved games',
    text: 'Several games can be kept side by side – a new game never replaces one. Find them under Saved games on the main menu, where you can also delete one.',
  },
  {
    title: 'On this device',
    text: 'Saves and settings stay in this browser on this device. Once loaded, Chronicle also works offline.',
  },
];

const SETTINGS: Topic[] = [
  {
    title: 'Menu',
    text: 'During a game it pauses the game – the play time stops too – and holds the settings below, Help and the way to the main menu. On the main menu, the same settings are under Settings.',
    picture: 'menu',
  },
  {
    title: 'Sound',
    text: 'Turns all sound off and on at once; the volumes stay as they are. Music, effects and voice-over each have their own volume in the settings.',
    picture: 'sound',
  },
  {
    title: 'Version of the story',
    text: '**Original** is the story as it was written. **Easy** tells it in plain English, for players whose first language isn’t English; **Short** tells it in about a third of the words. Both are in beta. They change only the story – instructions and rules stay word for word – and a page without its own Easy or Short text shows the original. Switch at any time, also during a game.',
    picture: 'versions',
  },
  {
    title: 'Narrator',
    text: 'Some pages are read aloud. The original recordings read only the original text; the generated voices also read Easy and Short.',
  },
  {
    title: 'Language',
    text: 'Chronicle is in English for now; more languages may follow.',
  },
  {
    title: 'Paper',
    text: 'Light or dark paper; Automatic follows your device.',
  },
  {
    title: 'Your device’s Back button',
    text: 'It closes an open window. Windows that need an answer, such as a hand-over, stay.',
  },
];

/** Installing, step by step on each kind of device. */
const INSTALL_STEPS = [
  '**Android:** in the browser’s menu, choose *Install app* or *Add to home screen*.',
  '**iPhone and iPad:** tap Share, then *Add to Home Screen* – before your first game: the installed app keeps its own saves, separate from Safari’s.',
  '**Computer:** Chrome and Edge show an install button in the address bar; Safari on a Mac: File → *Add to Dock*.',
].join('\n');

const TABS = [
  { id: 'playing', label: 'Playing' },
  { id: 'install', label: 'Install & saves' },
  { id: 'settings', label: 'Settings' },
];

/**
 * Help in three topics: playing at the table (with the original's own help texts), installing
 * and saves, settings. Installing comes first while Chronicle isn't installed: installed, it
 * keeps its games safe.
 */
@Component({
  selector: 'cr-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RichText, RoundBar, Tabs],
  templateUrl: './help.html',
  styleUrl: './help.css',
})
export class Help {
  protected readonly library = inject(Library);
  protected readonly install = inject(Install);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly tabs = TABS;
  protected readonly wide = WIDE;
  protected readonly active = signal('playing');
  protected readonly installSteps = INSTALL_STEPS;
  protected readonly saves = SAVES;
  protected readonly settings = SETTINGS;
  protected readonly playing = computed<Topic[]>(() => [
    this.original(ORIGINAL.howToUse, 'app'),
    this.original(
      ORIGINAL.storyActions,
      'panel',
      'In Chronicle, the actions of a location are panels: tap the whole panel when the game says so.',
    ),
    this.original(
      ORIGINAL.endOfRound,
      'rounds',
      'In Chronicle, that link is the plate below a location’s actions. The bar at the top shows the round.',
    ),
    ...PLAYING,
  ]);
  /** Shown above the tabs until Chronicle is installed, where this device can install it. */
  protected readonly installNote = computed(
    () => !this.install.installed() && (this.install.canPrompt() || this.install.apple),
  );

  constructor() {
    inject(AudioPlayer).effect('help');
  }

  private original(id: string, picture: Picture, note?: string): Topic {
    const text = (part: string) => this.library.text(`UI/Help/Viewarea/${id}/DetailsPanel/${part}`);
    return {
      title: text('title'),
      text: text('details'),
      picture,
      ...(note ? { note } : {}),
    };
  }

  /** Back to where Help was opened from (the game or the title); the title if opened directly. */
  protected back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) this.location.back();
    else void this.router.navigate(['/']);
  }
}
