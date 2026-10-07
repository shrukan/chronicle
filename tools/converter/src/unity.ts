/** Helpers for Unity project files. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Asset GUID → path relative to the `Assets` folder, from all `.meta` files. */
export function guidIndex(assets: string): Map<string, string> {
  const index = new Map<string, string>();
  const visit = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) visit(p);
      else if (e.name.endsWith('.meta')) {
        const guid = /^guid: (\w+)/m.exec(readFileSync(p, 'utf8'))?.[1];
        if (guid) index.set(guid, relative(assets, p.slice(0, -'.meta'.length)));
      }
    }
  };
  visit(assets);
  return index;
}
