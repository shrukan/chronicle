/** How each scenario is wired into the original app (entry points, app screens). */

export interface ScenarioConfig {
  id: string;
  /** Story script, relative to `Assets/Scripts/StoryScript`. */
  source: string;
  /** Passage the app opens when the scenario is chosen (`TwineStoryPlayer.GoToScenarios`). */
  start: string;
  /** Passages the app's own screens jump to directly. */
  entries: string[];
  /** Screens opened with `ViewController.ChangeView` and the passage they continue with. */
  screens: Record<string, { next?: string }>;
}

/** Variables filled in by the app instead of the story (setup and scoring screens). */
export const EXTERNAL_VARIABLES = {
  players: 'number',
  townname: 'string',
  nameA: 'string',
  nameB: 'string',
  nameC: 'string',
  nameD: 'string',
  nameE: 'string',
  winnerName: 'string',
} as const;

export const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'cost-of-disease',
    source: 'English/TheCostofDiseaseEng.cs',
    start: 'Preparations-TCOD',
    // ViewGeneration → "Preface-TCOD"; ViewRankingPage → "VarEndingsPassage".
    entries: ['Preface-TCOD', 'VarEndingsPassage'],
    screens: { scoreEntry: { next: 'VarEndingsPassage' } },
  },
  {
    id: 'fear-of-the-unknown',
    source: 'English/FearoftheUnknownEng.cs',
    start: 'ScenarioBox-FOTU',
    entries: ['VarEndingsPassage'],
    screens: { scoreEntry: { next: 'VarEndingsPassage' } },
  },
  {
    id: 'a-time-of-war',
    source: 'English/ATimeofWarEng.cs',
    start: 'ATOW-Preparations',
    entries: ['VarEndingsPassage'],
    screens: { scoreEntry: { next: 'VarEndingsPassage' } },
  },
];
