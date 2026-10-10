import type { Scenario, ScenarioExtras, StringTable } from '@chronicle/engine';

/** Everything the app needs to play one scenario (served from `/content/<id>/`). */
export interface ScenarioContent {
  scenario: Scenario;
  strings: StringTable;
  extras: ScenarioExtras;
}

export const SCENARIOS = [{ id: 'cost-of-disease', title: 'The Cost of Disease' }] as const;
export type ScenarioId = (typeof SCENARIOS)[number]['id'];

async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return (await res.json()) as T;
}

export async function loadContent(id: ScenarioId, signal: AbortSignal): Promise<ScenarioContent> {
  const base = `content/${id}`;
  const [scenario, strings, extras] = await Promise.all([
    json<Scenario>(`${base}/scenario.json`, signal),
    json<StringTable>(`${base}/strings.en.json`, signal),
    json<ScenarioExtras>(`${base}/extras.json`, signal),
  ]);
  return { scenario, strings, extras };
}
