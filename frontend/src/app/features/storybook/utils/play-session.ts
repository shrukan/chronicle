import type { Game } from '../../../core/services/game';
import { keepScreenOn } from '../../../core/utils/wake-lock';

/**
 * What runs while the storybook is open: play time counts while it is on screen and the story
 * isn't over; the game is saved when the app goes to the background (phones may close it
 * there) and when the page is left; the screen stays on. Returns the function that ends it,
 * saving once more.
 */
export function startPlaySession(game: Game): () => void {
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible' && game.view() && !game.isEnding()) game.tick(1000);
  }, 1000);
  const save = () => void game.persist();
  const onVisibility = () => document.visibilityState === 'hidden' && save();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', save);
  const releaseScreen = keepScreenOn();
  return () => {
    releaseScreen();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', save);
    save();
  };
}
