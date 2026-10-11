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
  /** Several games can be saved; each has its own id (see `newSaveId`). */
  id: string;
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
const GAMES = 'games';
const UNLOCKS = 'unlocks';
/** Up to database version 2: one game per scenario, keyed by the scenario. */
const OLD_SAVES = 'saves';

/** A new saved game's id (random, so ids from other devices never clash). */
export function newSaveId(): string {
  // randomUUID only exists on https (and localhost); a self-hosted copy may run on plain http.
  return (
    crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

/** An IndexedDB request as a promise; `T` is what this app stored there. */
function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
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
      const req = indexedDB.open(DB, 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        const tx = req.transaction!;
        if (!db.objectStoreNames.contains(UNLOCKS))
          db.createObjectStore(UNLOCKS, { keyPath: 'scenario' });
        if (!db.objectStoreNames.contains(GAMES)) db.createObjectStore(GAMES, { keyPath: 'id' });
        // The game saved before there could be several becomes the first of them.
        if (db.objectStoreNames.contains(OLD_SAVES)) {
          const old = tx.objectStore(OLD_SAVES).getAll();
          old.onsuccess = () => {
            for (const game of old.result as object[])
              tx.objectStore(GAMES).put({ ...game, id: newSaveId() });
            db.deleteObjectStore(OLD_SAVES);
          };
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab with a newer version wants to upgrade the database: let it.
        db.onversionchange = () => {
          db.close();
          this.db = undefined;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB could not be opened'));
    });
    return this.db;
  }

  private async store(
    name: string,
    mode: IDBTransactionMode = 'readonly',
  ): Promise<IDBObjectStore> {
    return (await this.open()).transaction(name, mode).objectStore(name);
  }

  /** Every saved game as stored, possibly by an earlier version of the app (see `migrateSave`). */
  async list(): Promise<unknown[]> {
    return request<unknown[]>((await this.store(GAMES)).getAll());
  }

  /** One saved game as stored (see `list`). */
  async load(id: string): Promise<unknown> {
    return request<unknown>((await this.store(GAMES)).get(id));
  }

  async save(game: SavedGame): Promise<void> {
    await request((await this.store(GAMES, 'readwrite')).put(game));
  }

  async remove(id: string): Promise<void> {
    await request((await this.store(GAMES, 'readwrite')).delete(id));
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
