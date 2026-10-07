import { formatDuration } from './duration';

describe('formatDuration', () => {
  it('shows minutes and seconds, adding hours when needed', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });
});
