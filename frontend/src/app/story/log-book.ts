import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { Game } from '../core/game';
import { Library } from '../core/library';
import { RichText } from './rich-text';

const PER_PAGE = 4;

/** The family's log book: events reached so far (title, place, one-line summary), newest last. */
@Component({
  selector: 'cr-log-book',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichText],
  template: `
    <h2 class="heading">Log Book</h2>
    @if (entries().length) {
      <ol class="entries" [start]="page() * perPage + 1">
        @for (e of visible(); track e.passage + $index) {
          <li>
            <strong><cr-rich-text [text]="game.text(e.title)" /></strong>
            <em><cr-rich-text [text]="game.text(e.location)" /></em>
            <p><cr-rich-text [text]="game.text(e.summary)" /></p>
          </li>
        }
      </ol>
      <nav class="pager">
        <button
          type="button"
          class="arrow"
          [disabled]="page() === 0"
          (click)="page.set(page() - 1)"
          aria-label="Previous page"
        >
          @if (library.ui('log-book/previous-page-arrow'); as src) {
            <img [src]="src" alt="" />
          } @else {
            ‹
          }
        </button>
        <span>{{ page() + 1 }} / {{ pages() }}</span>
        <button
          type="button"
          class="arrow"
          [disabled]="page() + 1 >= pages()"
          (click)="page.set(page() + 1)"
          aria-label="Next page"
        >
          @if (library.ui('log-book/next-page-arrow'); as src) {
            <img [src]="src" alt="" />
          } @else {
            ›
          }
        </button>
      </nav>
    } @else {
      <p class="empty">Nothing recorded yet.</p>
    }
    <div class="actions">
      <button type="button" class="btn" (click)="done.emit()">Close</button>
    </div>
  `,
  styles: `
    h2 {
      margin: 0 0 1rem;
      text-align: center;
      font-size: 1.6rem;
    }
    .entries {
      margin: 0;
      padding-left: 1.5rem;
      display: grid;
      gap: 0.9rem;
    }
    .entries strong {
      display: block;
      font-family: var(--font-display);
      font-weight: normal;
      font-size: 1.15rem;
      color: var(--color-heading);
    }
    .entries em {
      display: block;
      color: var(--color-muted);
    }
    .entries p {
      margin: 0.2rem 0 0;
    }
    .pager {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      margin-top: 1rem;
    }
    .arrow {
      width: 2.5rem;
      height: 2.5rem;
      border: 0;
      background: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: inherit;
    }
    .arrow img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .arrow:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .empty {
      text-align: center;
      font-style: italic;
    }
    .actions {
      display: flex;
      justify-content: center;
      margin-top: 1rem;
    }
  `,
})
export class LogBook implements OnInit {
  protected readonly game = inject(Game);
  protected readonly library = inject(Library);
  readonly done = output<void>();
  protected readonly perPage = PER_PAGE;

  protected readonly entries = computed(() => {
    const book = this.game.content()?.extras.logBook ?? {};
    return this.game
      .log()
      .flatMap((passage) => (book[passage] ? [{ passage, ...book[passage] }] : []));
  });
  protected readonly pages = computed(() =>
    Math.max(1, Math.ceil(this.entries().length / PER_PAGE)),
  );
  /** Opens on the latest page. */
  protected readonly page = signal(0);
  protected readonly visible = computed(() =>
    this.entries().slice(this.page() * PER_PAGE, (this.page() + 1) * PER_PAGE),
  );

  ngOnInit(): void {
    this.page.set(this.pages() - 1);
  }
}
