import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { bugReportUrl, REPOSITORY } from '../../../../core/utils/bug-report';
import { VERSION } from '../../../../version';

/** Version, author, licences and the attribution CC BY-NC asks for. */
@Component({
  selector: 'cr-about',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  protected readonly version = VERSION;
  protected readonly repository = REPOSITORY;
  protected readonly bugReport = bugReportUrl({ where: 'About' });
}
