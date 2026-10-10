import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Library } from '../core/library';

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
  template: `
    <div class="stage">
      @if (library.ui('main-menu/sky-dome'); as src) {
        <img class="sky" [src]="src" alt="" />
      }
      @if (library.ui('main-menu/mountain'); as src) {
        <img class="mountain" [src]="src" alt="" />
      }
      @if (library.ui('main-menu/village'); as src) {
        <img class="village" [src]="src" alt="" />
      }
      @for (l of lights; track $index) {
        <span class="light" [style.left.%]="l.left" [style.top.%]="l.top"></span>
      }
    </div>
    @if (library.ui('general/vignette'); as src) {
      <img class="vignette" [src]="src" alt="" />
    }
    @if (library.ui('general/main-border'); as src) {
      <div class="frame" [style.border-image-source]="'url(' + src + ')'"></div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: -1;
      overflow: hidden;
      background: #0b1418;
      /* The original's scale: 1 at 1920 × 1082. */
      --s: min(100vw / 1920, 100dvh / 1082);
    }
    /* Covers the window like the original's canvas. */
    .stage {
      position: absolute;
      left: 50%;
      top: 50%;
      height: max(100dvh, 100vw * 1082 / 1920);
      aspect-ratio: 1920 / 1082;
      transform: translate(-50%, -50%);
    }
    /* Portrait: the scene in the lower part, plain sky above for the logo. */
    @media (max-aspect-ratio: 1/1) {
      .stage {
        top: auto;
        bottom: 0;
        height: 72dvh;
        transform: translateX(-50%);
      }
      .sky {
        mask: linear-gradient(transparent, #000 25%);
      }
    }
    .stage > * {
      position: absolute;
    }
    img {
      object-fit: fill;
    }
    /* Stretched over the whole screen, like the original. */
    .sky {
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .mountain {
      left: 0;
      bottom: 0;
      width: 100%;
      height: 28.8%;
    }
    .village {
      left: 0;
      bottom: 0;
      width: 100%;
      height: 16.1%;
    }
    .light {
      width: 5.63%;
      aspect-ratio: 1;
      translate: -50% -50%;
      border-radius: 50%;
      background: radial-gradient(rgb(255 184 40 / 0.55), transparent 65%);
      animation: flicker 4s ease-in-out infinite alternate;
    }
    .light:nth-of-type(2n) {
      animation-duration: 5.3s;
    }
    .vignette {
      position: absolute;
      inset: auto 0 0;
      width: 100%;
      height: 90.7%;
      opacity: 0.57;
      pointer-events: none;
    }
    .frame {
      position: absolute;
      inset: 0;
      border-style: solid;
      border-width: calc(166 * var(--s)) calc(160 * var(--s)) calc(177 * var(--s))
        calc(160 * var(--s));
      border-image-slice: 166 160 177 160;
      border-image-repeat: stretch;
    }
    @keyframes flicker {
      to {
        opacity: 0.6;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .light {
        animation: none;
      }
    }
  `,
})
export class TitleScene {
  protected readonly library = inject(Library);
  protected readonly lights = LIGHTS;
}
