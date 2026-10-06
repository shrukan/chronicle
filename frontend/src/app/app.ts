import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'cr-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="bar">
      <a routerLink="/" class="brand">Chronicle</a>
      <span class="sub">a companion for My Father's Work</span>
    </header>
    <main>
      <router-outlet />
    </main>
    <footer>
      Unofficial fan project. Story, text and art © Renegade Game Studios (CC BY-NC 4.0).
    </footer>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }
    .bar {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--color-rule);
    }
    .brand {
      font-family: var(--font-display);
      font-size: 1.4rem;
      color: var(--color-heading);
      text-decoration: none;
    }
    .sub {
      font-size: 0.9rem;
      color: var(--color-muted);
    }
    main {
      flex: 1;
      width: 100%;
      max-width: 44rem;
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
    }
    footer {
      padding: 1rem;
      font-size: 0.8rem;
      text-align: center;
      color: var(--color-muted);
    }
  `,
})
export class App {}
