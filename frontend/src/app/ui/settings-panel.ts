import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Library } from '../core/library';
import { Settings, type Voice } from '../core/settings';

/** Voice and volumes. Used from the main menu and the pause menu. */
@Component({
  selector: 'cr-settings-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="heading">
      {{ t('UI/MainMenu/Viewarea/Settings UI/Settings Panel/Panel/SettingsHeader', 'Settings') }}
    </h2>

    <fieldset class="voice">
      <legend>{{ t('UI/VoiceTrack/Viewarea/Prompt/Heading', 'Choose Audio Voice') }}</legend>
      @for (v of voices; track v.value) {
        <label>
          <input
            type="radio"
            name="voice"
            [value]="v.value"
            [checked]="settings.voice() === v.value"
            (change)="settings.voice.set(v.value)"
          />
          {{ t(v.key, v.fallback) }}
        </label>
      }
    </fieldset>

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
      <button type="button" class="btn" (click)="done.emit()">
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
      gap: 1.5rem;
      margin: 0 0 1rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--color-rule);
      border-radius: 0.4rem;
    }
    .slider {
      margin-bottom: 0.75rem;
    }
    .actions {
      display: flex;
      justify-content: center;
      margin-top: 1rem;
    }
  `,
})
export class SettingsPanel {
  protected readonly settings = inject(Settings);
  private readonly library = inject(Library);
  readonly done = output<void>();

  protected readonly voices: { value: Voice; key: string; fallback: string }[] = [
    { value: 'female', key: 'UI/VoiceTrack/Viewarea/Prompt/Female/Lable', fallback: 'Feminine' },
    { value: 'male', key: 'UI/VoiceTrack/Viewarea/Prompt/Male/Lable', fallback: 'Masculine' },
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
