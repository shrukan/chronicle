import { Injectable } from '@angular/core';
import type { StorySnapshot } from '@chronicle/engine';
import type { ScenarioId } from './content';

export interface GameSetup {
  players: number;
  names: string[];
  village: string;
}

export interface SavedGame {
  scenario: ScenarioId;
  setup: GameSetup;
  snapshot: StorySnapshot;
  savedAt: number;
}

const DB = 'chronicle';
const STORE = 'saves';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Saved games in IndexedDB, one per scenario. Kept behind this service so cloud saves can
 * be added later without touching the rest of the app.
 */
@Injectable({ providedIn: 'root' })
export class SaveStore {
  private db?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'scenario' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  async load(scenario: ScenarioId): Promise<SavedGame | undefined> {
    const db = await this.open();
    return request<SavedGame | undefined>(db.transaction(STORE).objectStore(STORE).get(scenario));
  }

  async save(game: SavedGame): Promise<void> {
    const db = await this.open();
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(game));
  }

  async remove(scenario: ScenarioId): Promise<void> {
    const db = await this.open();
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(scenario));
  }
}
