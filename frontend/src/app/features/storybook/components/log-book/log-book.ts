import { Autofocus } from '../../../../shared/directives/autofocus/autofocus';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { Game } from '../../../../core/services/game';
import { Library } from '../../../../core/services/library';
import { RichText } from '../rich-text/rich-text';

const PER_PAGE = 4;

/** The family's log book: events reached so far (title, place, one-line summary), newest last. */
@Component({
  selector: 'cr-log-book',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autofocus, RichText],
  templateUrl: './log-book.html',
  styleUrl: './log-book.css',
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
