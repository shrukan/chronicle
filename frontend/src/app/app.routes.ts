import { inject, isDevMode } from '@angular/core';
import { Router, type Routes } from '@angular/router';
import { Game } from './core/game';

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
    loadComponent: () => import('./pages/main-menu').then((m) => m.MainMenu),
    title: "Chronicle – My Father's Work",
  },
  {
    path: 'setup',
    loadComponent: () => import('./pages/setup').then((m) => m.Setup),
    canActivate: [noSavedGame],
    title: 'Chronicle – new game',
  },
  {
    path: 'play',
    loadComponent: () => import('./pages/play').then((m) => m.Play),
    title: 'Chronicle – storybook',
  },
  {
    path: 'score',
    loadComponent: () => import('./pages/score').then((m) => m.Score),
    title: 'Chronicle – scoring',
  },
  {
    path: 'endings',
    loadComponent: () => import('./pages/endings').then((m) => m.Endings),
    title: 'Chronicle – endings',
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about').then((m) => m.About),
    title: 'Chronicle – about',
  },
  {
    path: 'whats-new',
    loadComponent: () => import('./pages/whats-new').then((m) => m.WhatsNew),
    title: "Chronicle – what's new",
  },
  {
    path: 'help',
    loadComponent: () => import('./pages/help').then((m) => m.Help),
    title: 'Chronicle – help',
  },
  // Development only: compare voices and versions on each scenario's introduction.
  ...(isDevMode()
    ? [
        {
          path: 'voices',
          loadComponent: () => import('./pages/voices').then((m) => m.Voices),
          title: 'Chronicle – voice test',
        },
      ]
    : []),
  { path: '**', redirectTo: '' },
];
