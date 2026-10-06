import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  applyEach,
  form,
  FormField,
  FormRoot,
  max,
  min,
  required,
  validate,
} from '@angular/forms/signals';
import { SCENARIOS } from '../core/content';
import { Game } from '../core/game';

interface SetupModel {
  players: number;
  names: string[];
  village: string;
}

/**
 * Placeholder setup screen (M3): player count, names and village, then straight into the
 * story. The original's full setup flow comes in M4.
 */
@Component({
  selector: 'cr-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FormRoot],
  template: `
    <h1>{{ scenario.title }}</h1>

    @if (hasSave.value()) {
      <section class="resume">
        <p>A game is in progress.</p>
        <button type="button" (click)="resume()">Continue</button>
        <button type="button" class="secondary" (click)="discard()">Start over</button>
      </section>
    }

    <form [formRoot]="setupForm" class="setup">
      <label>
        Players
        <input type="number" [formField]="setupForm.players" />
      </label>
      @for (name of setupForm.names; track $index; let i = $index) {
        @if (i < players()) {
          <label>
            Player {{ i + 1 }}
            <input type="text" [formField]="name" autocomplete="off" />
          </label>
        }
      }
      <label>
        Village
        <input type="text" [formField]="setupForm.village" autocomplete="off" />
      </label>
      <button type="submit" [disabled]="setupForm().invalid()">New game</button>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    h1 {
      font-family: var(--font-display);
      font-weight: normal;
      font-size: 2.2rem;
      color: var(--color-heading);
      margin-bottom: 1.5rem;
    }
    .resume {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
    }
    .resume p {
      width: 100%;
      margin: 0;
    }
    .setup {
      display: grid;
      gap: 0.75rem;
      max-width: 24rem;
    }
    label {
      display: grid;
      gap: 0.25rem;
    }
    input {
      padding: 0.4rem 0.6rem;
      border-radius: 0.3rem;
      border: 1px solid var(--color-rule);
      background: var(--color-bg);
      color: inherit;
      font: inherit;
    }
    button {
      justify-self: start;
      padding: 0.4rem 1rem;
      border-radius: 0.4rem;
      border: 1px solid var(--color-accent);
      background: var(--color-accent);
      color: var(--color-on-accent);
      font: inherit;
      cursor: pointer;
    }
    button.secondary {
      background: transparent;
      color: var(--color-accent);
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class Home {
  private readonly game = inject(Game);
  private readonly router = inject(Router);

  protected readonly scenario = SCENARIOS[0];
  protected readonly hasSave = resource({ loader: () => this.game.hasSave() });

  private readonly model = signal<SetupModel>({
    players: 3,
    names: ['', '', '', '', ''],
    village: '',
  });
  protected readonly players = computed(() => this.model().players);

  protected readonly setupForm = form(
    this.model,
    (p) => {
      required(p.players);
      min(p.players, 2);
      max(p.players, 5);
      required(p.village);
      // Only the names of players who take part are required.
      applyEach(p.names, (name) => {
        validate(name, ({ value, key }) =>
          Number(key()) < this.players() && !value().trim() ? { kind: 'required' } : undefined,
        );
      });
    },
    {
      submission: {
        action: async (f) => {
          const { players, names, village } = f().value();
          await this.game.newGame({
            players,
            names: names.map((n) => n.trim()),
            village: village.trim(),
          });
          await this.router.navigate(['/play']);
          return undefined;
        },
      },
    },
  );

  protected async resume(): Promise<void> {
    if (await this.game.resume()) await this.router.navigate(['/play']);
  }

  protected async discard(): Promise<void> {
    await this.game.abandon();
    this.hasSave.reload();
  }
}
