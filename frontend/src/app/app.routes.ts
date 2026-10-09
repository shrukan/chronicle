import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/main-menu').then((m) => m.MainMenu),
    title: "Chronicle – My Father's Work",
  },
  {
    path: 'setup',
    loadComponent: () => import('./pages/setup').then((m) => m.Setup),
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
  { path: '**', redirectTo: '' },
];
