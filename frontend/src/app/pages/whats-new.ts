import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  resource,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppUpdate } from '../core/app-update';
import { bugReportUrl, REPOSITORY } from '../core/bug-report';
import { compareVersions, WhatsNew as Notes } from '../core/whats-new';

/**
 * The changelog, shipped with the app so it reads offline. Opening it counts as seen. When
 * online, versions the server has but this device doesn't run yet are shown first.
 */
@Component({
  selector: 'cr-whats-new',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink],
  template: `
    <section class="paper sheet">
      <h1 class="heading">What's new</h1>
      <p class="current">You are using Chronicle {{ notes.version }}.</p>

      @if (upcoming.value()?.length) {
        <section class="upcoming" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" class="heading">On its way</h2>
          <p>
            Published, but not on this device yet. Your game is saved after every step, so updating
            loses nothing.
          </p>
          @if (update.ready() || !update.controlled) {
            <button type="button" class="btn" (click)="update.reload()">Update now</button>
          } @else {
            <p class="status">Downloading the new version…</p>
          }
          @for (r of upcoming.value(); track r.version) {
            <ng-container *ngTemplateOutlet="release; context: { $implicit: r, badge: '' }" />
          }
        </section>
      }

      @for (r of notes.releases(); track r.version) {
        <ng-container
          *ngTemplateOutlet="
            release;
            context: { $implicit: r, badge: isNew(r.version) ? 'New for you' : '' }
          "
        />
      } @empty {
        @if (notes.loading()) {
          <p class="status">Opening the notes…</p>
        } @else {
          <p class="status">
            The notes could not be loaded.
            <a [href]="releases" target="_blank" rel="noopener">Read them on GitHub ↗</a>
          </p>
        }
      }

      <p class="links">
        <a [href]="releases" target="_blank" rel="noopener">All releases on GitHub ↗</a> ·
        <a [href]="bugReport" target="_blank" rel="noopener">Report a bug ↗</a> ·
        <a routerLink="/about">About &amp; credits</a>
      </p>

      <a class="btn" routerLink="/">Back</a>
    </section>

    <ng-template #release let-r let-badge="badge">
      <article class="release">
        <h2>
          <span class="heading">Version {{ r.version }}</span>
          @if (badge) {
            <span class="badge">{{ badge }}</span>
          }
          @if (r.date) {
            <time [attr.datetime]="r.date">{{ date(r.date) }}</time>
          }
        </h2>
        @for (s of r.sections; track s.title) {
          <h3>{{ s.title }}</h3>
          <ul>
            @for (e of s.entries; track $index) {
              <li>{{ e }}</li>
            }
          </ul>
        }
      </article>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }
    .sheet {
      display: grid;
      gap: 0.75rem;
      max-width: 36rem;
      margin: 0 auto;
    }
    h1 {
      margin: 0;
      text-align: center;
      font-size: 2rem;
    }
    .current,
    .status {
      margin: 0;
      text-align: center;
      font-style: italic;
      color: var(--color-muted);
    }
    /* Versions not yet on this device: set apart from the installed history. */
    .upcoming {
      display: grid;
      gap: 0.6rem;
      padding: 0.75rem 1rem 1rem;
      border: 1px dashed var(--color-accent-text);
      border-radius: 0.5rem;
      background: var(--color-field);
    }
    .upcoming > h2 {
      justify-content: center;
      font-size: 1.5rem;
      color: var(--color-heading);
    }
    .upcoming > p {
      margin: 0;
      text-align: center;
    }
    .upcoming .btn {
      justify-self: center;
    }
    .upcoming .release:first-of-type {
      margin-top: 0.25rem;
    }
    .release {
      padding-top: 0.75rem;
      border-top: 1px solid var(--color-rule);
    }
    h2 {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.25rem 0.75rem;
      margin: 0;
      font-size: 1.35rem;
      font-weight: normal;
    }
    time {
      margin-left: auto;
      font-size: 0.95rem;
      color: var(--color-muted);
    }
    .badge {
      padding: 0 0.5rem;
      border-radius: 0.3rem;
      background: var(--color-accent);
      color: var(--color-on-accent);
      font-size: 0.8rem;
      letter-spacing: 0.04em;
    }
    h3 {
      margin: 0.6rem 0 0.2rem;
      font-family: var(--font-display);
      font-size: 0.95rem;
      font-weight: normal;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-accent-text);
    }
    ul {
      margin: 0;
      padding-left: 1.25rem;
      display: grid;
      gap: 0.3rem;
      line-height: 1.5;
    }
    /* The entries are written as continuations ("mute all sound …"). */
    li::first-letter {
      text-transform: uppercase;
    }
    .links {
      margin: 0.75rem 0 0;
      text-align: center;
      font-size: 0.9rem;
      color: var(--color-muted);
    }
    a:not(.btn) {
      color: var(--color-accent-text);
    }
    .btn {
      justify-self: center;
    }
  `,
})
export class WhatsNew {
  protected readonly notes = inject(Notes);
  protected readonly update = inject(AppUpdate);
  /** Asked for each time the page opens; nothing when offline. */
  protected readonly upcoming = resource({ loader: () => this.notes.upcoming() });
  protected readonly releases = `${REPOSITORY}/releases`;
  protected readonly bugReport = bugReportUrl({ where: "What's new" });

  constructor() {
    this.notes.markSeen();
    // Newer notes on the server: start downloading that version, so it can be switched to.
    effect(() => {
      if (this.upcoming.value()?.length) void untracked(() => this.update.check());
    });
  }

  /** Released since the notes this device saw before (not on a first visit). */
  protected isNew(version: string): boolean {
    const previous = this.notes.previous;
    return previous !== '0.0.0' && compareVersions(version, previous) > 0;
  }

  protected date(iso: string): string {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' });
  }
}
