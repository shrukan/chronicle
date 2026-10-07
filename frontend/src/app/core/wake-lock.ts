/**
 * Keeps the screen on while the storybook is open: rounds of the board game take a while, and
 * devices would otherwise turn the screen off between pages. Browsers drop the lock when the
 * page is hidden, so it is taken again when the page comes back. Returns a release function.
 */
export function keepScreenOn(): () => void {
  const wakeLock = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
  if (!wakeLock) return () => undefined;
  let lock: WakeLockSentinel | undefined;
  let active = true;
  const acquire = () => {
    if (!active || document.visibilityState !== 'visible') return;
    wakeLock.request('screen').then(
      (l) => (active ? (lock = l) : void l.release()),
      () => undefined, // e.g. battery saver: not worth bothering the players
    );
  };
  document.addEventListener('visibilitychange', acquire);
  acquire();
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', acquire);
    void lock?.release();
  };
}
