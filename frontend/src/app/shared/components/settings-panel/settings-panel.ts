import { Autofocus } from '../../directives/autofocus/autofocus';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Library } from '../../../core/services/library';
import type { ReadingMode } from '@chronicle/engine';
import { LANGUAGES, Settings, type Theme } from '../../../core/services/settings';

/** Voice, story text and volumes. Used from the main menu and the pause menu. */
@Component({
  selector: 'cr-settings-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autofocus],
  templateUrl: './settings-panel.html',
  styleUrl: './settings-panel.css',
})
export class SettingsPanel {
  protected readonly settings = inject(Settings);
  protected readonly library = inject(Library);
  readonly done = output<void>();
  /** Off when the panel sits in another dialog with its own heading (pause menu). */
  readonly showHeading = input(true);

  protected readonly languages = LANGUAGES;
  /** The versions the chosen language has. */
  protected readonly versions = computed(() =>
    Object.entries(
      (LANGUAGES.find((l) => l.code === this.settings.language()) ?? LANGUAGES[0]!).versions,
    ).map(([mode, label]) => ({ mode: mode as ReadingMode, label })),
  );

  protected setLanguage(code: string): void {
    this.settings.language.set(code);
    // A version the new language lacks falls back to the original.
    if (!this.versions().some((v) => v.mode === this.settings.readingMode()))
      this.settings.readingMode.set('full');
  }
  protected readonly themes: { value: Theme; label: string }[] = [
    { value: 'auto', label: 'Automatic' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  protected readonly sliders = [
    {
      key: 'UI/MainMenu/Viewarea/Settings UI/Settings Panel/Panel/Music Text',
      fallback: 'Music',
      value: this.settings.music,
    },
    { key: '', fallback: 'Sound effects', value: this.settings.effects },
    {
      key: 'UI/MainMenu/Viewarea/Settings UI/Settings Panel/Panel/Voice',
      fallback: 'Voice',
      value: this.settings.voiceOver,
    },
  ];

  protected t(key: string, fallback: string): string {
    return this.library.text(key, fallback);
  }
}
