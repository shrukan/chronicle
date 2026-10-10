import { inject, isDevMode } from '@angular/core';
import { Router, type Routes } from '@angular/router';
import { Game } from './core/services/game';

/**
 * A new game replaces the saved one, so it starts from the main menu, which asks first: opening
 * /setup directly while a game is saved leads there.
 */
const noSavedGame = async () => {
  const [game, router] = [inject(Game), inject(Router)];
  return (await game.hasSave()) ? router.parseUrl('/') : true;
};

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/menu/pages/main-menu/main-menu').then((m) => m.MainMenu),
    title: "Chronicle – My Father's Work",
  },
  {
    path: 'setup',
    loadComponent: () => import('./features/setup/pages/setup/setup').then((m) => m.Setup),
    canActivate: [noSavedGame],
    title: 'Chronicle – new game',
  },
  {
    path: 'play',
    loadComponent: () => import('./features/storybook/pages/play/play').then((m) => m.Play),
    title: 'Chronicle – storybook',
  },
  {
    path: 'score',
    loadComponent: () => import('./features/scoring/pages/score/score').then((m) => m.Score),
    title: 'Chronicle – scoring',
  },
  {
    path: 'endings',
    loadComponent: () => import('./features/endings/pages/endings/endings').then((m) => m.Endings),
    title: 'Chronicle – endings',
  },
  {
    path: 'about',
    loadComponent: () => import('./features/info/pages/about/about').then((m) => m.About),
    title: 'Chronicle – about',
  },
  {
    path: 'whats-new',
    loadComponent: () =>
      import('./features/info/pages/whats-new/whats-new').then((m) => m.WhatsNew),
    title: "Chronicle – what's new",
  },
  {
    path: 'help',
    loadComponent: () => import('./features/info/pages/help/help').then((m) => m.Help),
    title: 'Chronicle – help',
  },
  // Development only: compare voices and versions on each scenario's introduction.
  ...(isDevMode()
    ? [
        {
          path: 'voices',
          loadComponent: () => import('./features/dev/pages/voices/voices').then((m) => m.Voices),
          title: 'Chronicle – voice test',
        },
      ]
    : []),
  { path: '**', redirectTo: '' },
];
