import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Game } from '../../../../core/services/game';
import type { TextOut } from '../../../../core/utils/story-output';
import { RichText } from '../rich-text/rich-text';

/**
 * A box's lines as a list, when the content says they read that way (`list` of a block):
 * separate items behind brass studs, or numbered steps in order.
 */
@Component({
  selector: 'cr-box-lines',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichText],
  templateUrl: './box-lines.html',
  styleUrl: './box-lines.css',
})
export class BoxLines {
  protected readonly game = inject(Game);
  readonly lines = input.required<TextOut[]>();
  readonly numbered = input(false);
}
