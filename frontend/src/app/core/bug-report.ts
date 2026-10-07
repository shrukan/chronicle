import { VERSION } from '../version';

export const REPOSITORY = 'https://github.com/shrukan/chronicle';

/**
 * Link to a new bug report on GitHub, using the issue form in .github/ISSUE_TEMPLATE/bug.yml.
 * Query parameters named like the form's fields fill them in.
 */
export function bugReportUrl(details: { error?: string; where?: string } = {}): string {
  const params = new URLSearchParams({ template: 'bug.yml' });
  if (details.error) params.set('error', details.error);
  if (details.where) params.set('where', details.where);
  params.set('version', VERSION);
  params.set('device', navigator.userAgent);
  return `${REPOSITORY}/issues/new?${params}`;
}
