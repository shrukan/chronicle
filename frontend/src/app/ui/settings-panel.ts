import { Autofocus } from './autofocus';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Library } from '../core/library';
import type { ReadingMode } from '@chronicle/engine';
import { LANGUAGES, Settings, type Theme } from '../core/settings';

/** Voice, story text and volumes. Used from the main menu and the pause menu. */
@Component({
  selector: 'cr-settings-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autofocus],
  template: `
    @if (showHeading()) {
      <h2 class="heading">
        {{ t('UI/MainMenu/Viewarea/Settings UI/Settings Panel/Panel/SettingsHeader', 'Settings') }}
      </h2>
    }

    <div class="choices">
      <label class="field">
        Language
        <select (change)="setLanguage($any($event.target).value)">
          @for (l of languages; track l.code) {
            <option [value]="l.code" [selected]="settings.language() === l.code">
              {{ l.name }}
            </option>
          }
        </select>
      </label>
      <label class="field">
        Version
        <select (change)="settings.readingMode.set($any($event.target).value)">
          @for (v of versions(); track v.mode) {
            <option [value]="v.mode" [selected]="settings.readingMode() === v.mode">
              {{ v.label }}
            </option>
          }
        </select>
        <small class="hint"
          >Easy and Short change only the story, never the rules. Pages without them yet show the
          original.</small
        >
      </label>
      <label class="field">
        Narrator
        <select (change)="settings.voice.set($any($event.target).value)">
          @for (v of library.voices(); track v.value) {
            <option [value]="v.value" [selected]="settings.voice() === v.value">
              {{ v.label }}
            </option>
          }
        </select>
      </label>
    </div>

    <fieldset class="voice">
      <legend>Paper</legend>
      @for (th of themes; track th.value) {
        <label>
          <input
            type="radio"
            name="theme"
            [value]="th.value"
            [checked]="settings.theme() === th.value"
            (change)="settings.theme.set(th.value)"
          />
          {{ th.label }}
        </label>
      }
    </fieldset>

    <label class="toggle">
      <input
        type="checkbox"
        [checked]="settings.wholePage()"
        (change)="settings.wholePage.set($any($event.target).checked)"
      />
      <span>
        Show each page at once
        <small
          >Opens plain “Click to continue…” sections automatically. Secrets and decisions still
          wait.</small
        >
      </span>
    </label>

    <label class="toggle">
      <input
        type="checkbox"
        [checked]="settings.muted()"
        (change)="settings.muted.set($any($event.target).checked)"
      />
      <span>Mute all sound</span>
    </label>

    @for (s of sliders; track s.fallback) {
      <label class="field slider">
        {{ t(s.key, s.fallback) }}
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          [value]="s.value()"
          (input)="s.value.set(+$any($event.target).value)"
        />
      </label>
    }

    <div class="actions">
      <ng-content select="[actions]" />
      <button crAutofocus type="button" class="btn" (click)="done.emit()">
        {{
          t(
            'UI/MainMenu/Viewarea/Settings UI/Settings Panel/Panel/confirmbtn/Text (TMP)',
            'Confirm'
          )
        }}
      </button>
    </div>
  `,
  styles: `
    h2 {
      margin: 0 0 1rem;
      text-align: center;
      font-size: 1.5rem;
    }
    .voice {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.5rem;
      margin: 0 0 1rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--color-rule);
      border-radius: 0.4rem;
    }
    .choices {
      display: grid;
      gap: 0.75rem;
      margin: 0 0 1rem;
    }
    .hint {
      font-size: 0.85rem;
      color: var(--color-muted);
    }
    .toggle {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      margin: 0 0 1rem;
      cursor: pointer;
    }
    .toggle input {
      width: 1.2rem;
      height: 1.2rem;
      margin-top: 0.2rem;
    }
    .toggle small {
      display: block;
      color: var(--color-muted);
    }
    .slider {
      margin-bottom: 0.75rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.75rem;
      margin-top: 1.25rem;
    }
  `,
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
