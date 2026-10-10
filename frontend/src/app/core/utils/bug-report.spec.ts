import { describe, expect, it } from 'vitest';
import { bugReportUrl } from './bug-report';

describe('bugReportUrl', () => {
  it('opens the bug form and fills in the given fields', () => {
    const url = new URL(bugReportUrl({ error: 'Unknown passage X', where: 'Play: Start' }));
    expect(url.pathname).toBe('/shrukan/chronicle/issues/new');
    expect(url.searchParams.get('template')).toBe('bug.yml');
    expect(url.searchParams.get('error')).toBe('Unknown passage X');
    expect(url.searchParams.get('where')).toBe('Play: Start');
    expect(url.searchParams.get('version')).toMatch(/^\d+\.\d+\.\d+/);
    expect(url.searchParams.get('device')).toBeTruthy();
  });
});
