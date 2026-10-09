import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { bugReportUrl, REPOSITORY } from '../core/bug-report';
import { compareVersions, WhatsNew as Notes } from '../core/whats-new';

/** The changelog, shipped with the app so it reads offline. Opening it counts as seen. */
@Component({
  selector: 'cr-whats-new',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="paper sheet">
      <h1 class="heading">What's new</h1>
      <p class="current">You are using Chronicle {{ notes.version }}.</p>

      @for (r of notes.releases(); track r.version) {
        <article class="release">
          <h2>
            <span class="heading">Version {{ r.version }}</span>
            @if (isNew(r.version)) {
              <span class="badge">New for you</span>
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
  protected readonly releases = `${REPOSITORY}/releases`;
  protected readonly bugReport = bugReportUrl({ where: "What's new" });

  constructor() {
    this.notes.markSeen();
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
