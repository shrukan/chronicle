import { computed, Injectable, resource, signal } from '@angular/core';
import { VERSION } from '../version';

export interface Release {
  version: string;
  /** ISO date (YYYY-MM-DD), if the heading has one. */
  date?: string;
  sections: { title: string; entries: string[] }[];
}

/** release-please's section names, as players read them. */
const SECTION_TITLES: Record<string, string> = {
  Features: 'New',
  'Bug Fixes': 'Fixed',
};

/**
 * The releases in release-please's CHANGELOG.md, newest first. Commit and comparison links
 * and Markdown emphasis are dropped: the entries are for players.
 */
export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  let section: Release['sections'][number] | undefined;
  for (const line of markdown.split('\n')) {
    const release = /^##\s+\[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?(?:\s+\((\d{4}-\d{2}-\d{2})\))?/.exec(
      line,
    );
    if (release) {
      releases.push({ version: release[1]!, date: release[2], sections: [] });
      section = undefined;
      continue;
    }
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading && releases.length) {
      section = { title: SECTION_TITLES[heading[1]!] ?? heading[1]!, entries: [] };
      releases[releases.length - 1]!.sections.push(section);
      continue;
    }
    const entry = /^[*-]\s+(.+)$/.exec(line);
    if (entry && section) section.entries.push(plain(entry[1]!));
  }
  return releases;
}

/** An entry without its commit and issue references, Markdown links and emphasis. */
function plain(entry: string): string {
  const commit = String.raw`\[[0-9a-f]{7,}\]\([^)]*\)`;
  return entry
    .replace(new RegExp(String.raw`\s*\(${commit}(?:,\s*${commit})*\)`, 'g'), '')
    .replace(/,\s*closes\s.*$/i, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** Negative, zero or positive as `a` is older than, the same as or newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) {
    const d = (x![i] ?? 0) - (y![i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The changelog shipped with this version, or with `latest` the server's current one. */
function fetchChangelog(latest = false): Promise<string> {
  // ngsw-bypass: past the service worker, which serves the version this device runs.
  const url = latest ? 'content/changelog.md?ngsw-bypass=1' : 'content/changelog.md';
  return fetch(url, latest ? { cache: 'no-store' } : {}).then((r) =>
    r.ok ? r.text() : Promise.reject(new Error(`changelog: ${r.status}`)),
  );
}

const SEEN_KEY = 'chronicle.seenVersion';
/** Present for anyone who used the app before it remembered the versions they had seen. */
const SETTINGS_KEY = 'chronicle.settings';

function storage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The changelog shipped with the app (copied from CHANGELOG.md at build time, so it works
 * offline), and whether this device has seen the current version's notes yet.
 */
@Injectable({ providedIn: 'root' })
export class WhatsNew {
  readonly version = VERSION;

  /** The version whose notes this device saw last; undefined on a first visit. */
  private readonly lastSeen = (() => {
    const store = storage();
    const seen = store?.getItem(SEEN_KEY);
    if (seen) return seen;
    // Played before this was remembered: everything up to now counts as new.
    if (store?.getItem(SETTINGS_KEY)) return '0.0.0';
    try {
      store?.setItem(SEEN_KEY, VERSION);
    } catch {
      // Storage disabled: nothing to remember.
    }
    return VERSION;
  })();
  /** Fixed for the session, so the page can mark what is new even after it was opened. */
  readonly previous = this.lastSeen;

  private readonly seen = signal(this.lastSeen);
  /** True after an update, until the notes are opened or the reminder is dismissed. */
  readonly unseen = computed(() => compareVersions(VERSION, this.seen()) > 0);

  private readonly changelog = resource({ loader: () => fetchChangelog() });
  readonly releases = computed(() => {
    const md = this.changelog.hasValue() ? this.changelog.value() : '';
    // Without the service worker's copy (e.g. a first visit) the file may be newer than the app.
    return parseChangelog(md).filter((r) => compareVersions(r.version, VERSION) <= 0);
  });
  readonly loading = computed(() => this.changelog.isLoading());
  readonly failed = computed(() => !!this.changelog.error());

  /**
   * Versions the server already has but this device doesn't run yet, newest first. Asks the
   * server past the offline copy; empty when offline. Loaded by whoever shows them.
   */
  upcoming(): Promise<Release[]> {
    return fetchChangelog(true)
      .then((md) => parseChangelog(md).filter((r) => compareVersions(r.version, VERSION) > 0))
      .catch(() => []);
  }

  markSeen(): void {
    this.seen.set(VERSION);
    try {
      storage()?.setItem(SEEN_KEY, VERSION);
    } catch {
      // Storage disabled: the reminder comes back next time, nothing worse.
    }
  }
}
