import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioPlayer } from '../core/audio';
import { Library } from '../core/library';
import { RichText } from '../story/rich-text';
import { Tabs } from '../ui/tabs';

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
  template: `
    <section class="paper sheet">
      <cr-tabs #tabBar [tabs]="tabs()" [(selected)]="active" panelId="help" />
      <div id="help" class="panel" role="tabpanel" [attr.aria-labelledby]="tabBar.tabId(active())">
        <h1 class="heading">{{ t('UI/Help/Viewarea/' + active() + '/DetailsPanel/title') }}</h1>
        <div class="details">
          <cr-rich-text [text]="t('UI/Help/Viewarea/' + active() + '/DetailsPanel/details')" />
        </div>
      </div>
      <a class="btn" routerLink="/">Back</a>
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
      max-width: 36rem;
      margin: 0 auto;
    }
    .panel {
      display: grid;
      gap: 1rem;
      width: 100%;
    }
    h1 {
      margin: 0;
      font-size: 1.8rem;
      text-align: center;
    }
    .details {
      line-height: 1.6;
      font-size: 1.1rem;
      white-space: pre-line;
    }
  `,
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
