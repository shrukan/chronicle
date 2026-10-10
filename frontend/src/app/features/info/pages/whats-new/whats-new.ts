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
import { AppUpdate } from '../../../../core/services/app-update';
import { bugReportUrl, REPOSITORY } from '../../../../core/utils/bug-report';
import { compareVersions, WhatsNew as Notes } from '../../../../core/services/whats-new';

/**
 * The changelog, shipped with the app so it reads offline. Opening it counts as seen. When
 * online, versions the server has but this device doesn't run yet are shown first.
 */
@Component({
  selector: 'cr-whats-new',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './whats-new.html',
  styleUrl: './whats-new.css',
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
