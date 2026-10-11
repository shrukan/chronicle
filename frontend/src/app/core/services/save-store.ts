import { Injectable } from '@angular/core';
import type { Out, StorySnapshot } from '@chronicle/engine';
import type { ScenarioId } from './content';

export interface GameSetup {
  players: number;
  names: string[];
  village: string;
}

/** Version of the saved-game format; `migrateSave` brings older saves up to it. */
export const SAVE_VERSION = 1;

export interface SavedGame {
  version: typeof SAVE_VERSION;
  scenario: ScenarioId;
  setup: GameSetup;
  snapshot: StorySnapshot;
  /** Passages with a log book entry, in the order they were reached. */
  log: string[];
  /** Time spent in the storybook, in milliseconds. */
  playTime: number;
  /** Earlier states for "undo last choice", oldest first. */
  undo: UndoStep[];
  /** Rounds completed (of `ROUNDS`), for the progress bar. */
  roundsDone: number;
  /** Boxes from steps taken together with the current page (see Game). */
  carried: Out[];
  savedAt: number;
}

/** A state to go back to, with the log book as it was then. */
export interface UndoStep {
  snapshot: StorySnapshot;
  log: string[];
  roundsDone: number;
  carried: Out[];
}

/** Endings reached on this device: passage → first time reached. */
export interface Unlocks {
  scenario: ScenarioId;
  endings: Record<string, number>;
}

const DB = 'chronicle';
const SAVES = 'saves';
const UNLOCKS = 'unlocks';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Saved games and unlocked endings in IndexedDB. Kept behind this service so cloud saves
 * can be added later without touching the rest of the app.
 */
@Injectable({ providedIn: 'root' })
export class SaveStore {
  private db?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SAVES))
          db.createObjectStore(SAVES, { keyPath: 'scenario' });
        if (!db.objectStoreNames.contains(UNLOCKS))
          db.createObjectStore(UNLOCKS, { keyPath: 'scenario' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  private async store(
    name: string,
    mode: IDBTransactionMode = 'readonly',
  ): Promise<IDBObjectStore> {
    return (await this.open()).transaction(name, mode).objectStore(name);
  }

  /** The save as stored, possibly by an earlier version of the app (see `migrateSave`). */
  async load(scenario: ScenarioId): Promise<unknown> {
    return request<unknown>((await this.store(SAVES)).get(scenario));
  }

  async save(game: SavedGame): Promise<void> {
    await request((await this.store(SAVES, 'readwrite')).put(game));
  }

  async remove(scenario: ScenarioId): Promise<void> {
    await request((await this.store(SAVES, 'readwrite')).delete(scenario));
  }

  async unlocks(scenario: ScenarioId): Promise<Unlocks> {
    return (
      (await request<Unlocks | undefined>((await this.store(UNLOCKS)).get(scenario))) ?? {
        scenario,
        endings: {},
      }
    );
  }

  /** Records an ending; returns true the first time. */
  async unlock(scenario: ScenarioId, passage: string): Promise<boolean> {
    const current = await this.unlocks(scenario);
    if (current.endings[passage]) return false;
    current.endings[passage] = Date.now();
    await request((await this.store(UNLOCKS, 'readwrite')).put(current));
    return true;
  }
}
