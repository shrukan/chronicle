import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Library } from '../../../../core/services/library';

/** Lit windows in the village (the original's "FakeLight"s), centres in %. */
const LIGHTS = [
  { left: 90.74, top: 89.6 },
  { left: 80.61, top: 93.9 },
  { left: 82.69, top: 91.37 },
  { left: 87.16, top: 91.37 },
];

/**
 * The original title screen's backdrop: storm sky, mountains and the village with lit windows,
 * inside the metal frame. The manor is left out: its picture was cut from a larger painting
 * and has gaps the original covered with trees and a hill not in the released files.
 */
@Component({
  selector: 'cr-title-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  templateUrl: './title-scene.html',
  styleUrl: './title-scene.css',
})
export class TitleScene {
  protected readonly library = inject(Library);
  protected readonly lights = LIGHTS;
}
