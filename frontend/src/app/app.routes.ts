import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.Home), title: 'Chronicle' },
  {
    path: 'play',
    loadComponent: () => import('./pages/play').then((m) => m.Play),
    title: 'Chronicle – story',
  },
  { path: '**', redirectTo: '' },
];
