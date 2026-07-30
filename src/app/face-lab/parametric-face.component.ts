import { Component, Input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { FaceGenome } from './face-genome';
import { drawParametric } from './face-parametric';

/**
 * DEV-ONLY thin wrapper that renders a Face Lab genome on the same 100x100 canvas the
 * production `<app-player-face>` uses. Production faces keep using the frozen
 * `drawX()` renderers — this component is only ever mounted by the face gallery.
 */
@Component({
  selector: 'app-parametric-face',
  template: `<svg [attr.width]="size" [attr.height]="size" viewBox="0 0 100 100"
                  class="pf-svg" [innerHTML]="innerSvg"></svg>`,
  styles: [`svg { display: block; }`],
})
export class ParametricFaceComponent {
  @Input() genome!: FaceGenome;
  @Input() size = 64;
  /** Ink width tier, mirroring the component's style tiers. */
  @Input() inkWidth = 1.6;
  /** Must be unique on the page — clipPath ids collide otherwise. */
  @Input() uid = '';

  private cacheKey = '';
  private cached: SafeHtml = '';

  constructor(private sanitizer: DomSanitizer) {}

  get innerSvg(): SafeHtml {
    const key = JSON.stringify(this.genome) + '|' + this.inkWidth + '|' + this.uid;
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.cached = this.sanitizer.bypassSecurityTrustHtml(
        drawParametric(this.genome, { uid: this.uid || undefined, inkWidth: this.inkWidth }));
    }
    return this.cached;
  }
}
