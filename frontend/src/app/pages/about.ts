import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { bugReportUrl, REPOSITORY } from '../core/bug-report';
import { VERSION } from '../version';

/** Version, author, licences and the attribution CC BY-NC asks for. */
@Component({
  selector: 'cr-about',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="paper sheet">
      <h1 class="heading">About Chronicle</h1>
      <p>
        An unofficial, fan-made companion app for the board game <em>My Father's Work</em>. It is
        not affiliated with or endorsed by Renegade Game Studios.
      </p>
      <dl>
        <dt>Version</dt>
        <dd>
          {{ version }} –
          <a [href]="repository + '/blob/main/CHANGELOG.md'" target="_blank" rel="noopener"
            >what's new ↗</a
          >
        </dd>
        <dt>App</dt>
        <dd>
          by Shrukan –
          <a [href]="repository" target="_blank" rel="noopener">source code on GitHub ↗</a> ·
          <a [href]="bugReport" target="_blank" rel="noopener">report a bug ↗</a>
        </dd>
      </dl>

      <h2>Story, art and music</h2>
      <p>
        <em>My Father's Work</em> and its companion app's story, text, images, music and voice-over
        © Renegade Game Studios, released to the community in June 2026. Chronicle takes the story
        scripts from the
        <a
          href="https://github.com/Deusald/MyFathersWork-FanMadeCompanionApp"
          target="_blank"
          rel="noopener"
          >fan-made companion app repository ↗</a
        >
        and uses them, like that repository, under the terms of
        <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener"
          >Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0) ↗</a
        >: non-commercially and with attribution.
      </p>
      <p>
        <strong>Changes:</strong> the story scripts were converted into a new data format, a few
        errors of the original were fixed, texts are classified as story, rules or app instructions,
        images were cropped and converted to WebP, and audio to MP3. Shortened or simplified texts,
        where offered, are adaptations written for this project.
      </p>
      <p>This content may not be used commercially.</p>

      <h2>App code</h2>
      <p>
        The code of this app is released under the
        <a [href]="repository + '/blob/main/LICENSE'" target="_blank" rel="noopener"
          >MIT licence ↗</a
        >. Fonts: EB Garamond and Source Sans 3 (SIL Open Font License).
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
    h2 {
      margin: 0.75rem 0 0;
      font-family: var(--font-display);
      font-size: 1.2rem;
      font-weight: normal;
    }
    p,
    dl {
      margin: 0;
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.25rem 1rem;
    }
    dt {
      color: var(--color-muted);
    }
    dd {
      margin: 0;
    }
    a:not(.btn) {
      color: var(--color-accent);
    }
    .btn {
      justify-self: center;
      margin-top: 0.75rem;
    }
  `,
})
export class About {
  protected readonly version = VERSION;
  protected readonly repository = REPOSITORY;
  protected readonly bugReport = bugReportUrl({ where: 'About' });
}
