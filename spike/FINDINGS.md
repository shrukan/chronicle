# M0 spike – findings

**Question:** can the hand-edited, Cradle-generated C# be turned into a neutral data format
that a small runtime plays faithfully? And should that runtime be Ink or our own?

**Answer:** yes, and use our own runtime. Details below.

Instead of hand-converting ~10 passages, the spike built a prototype converter
(`spike/src/convert.ts`), the real engine (`engine/`), a terminal player and a random-walk
smoke test. That gave hard numbers instead of impressions.

## Results

| Scenario | Passages | Strings (unique) | ~Words | Manual nodes | Unknown expr. | Broken static links |
|---|---|---|---|---|---|---|
| The Cost of Disease (EN) | 361 | 3,325 (1,866) | 52k | 34 | 6 | 1 |
| Fear of the Unknown (EN) | 378 | 3,243 (1,862) | 43k | 61 | 68 | 47 |
| A Time of War (EN) | 297 | 2,602 (1,660) | 40k | 18 | 6 | 4 |
| The Cost of Disease (FR) | 360 | 3,299 (1,894) | 54k | 11 | 5 | 1 |
| Fear of the Unknown (FR) | 379 | 3,307 (1,909) | 47k | 51 | 47 | 58 |
| A Time of War (FR) | 296 | 2,647 (1,661) | 44k | 17 | 6 | 6 |

- **Parsing is solved:** tree-sitter's C# grammar parses all six scripts with zero errors (~0.3 s each).
- **Cost of Disease EN:** all remaining manual nodes sit in 11 passages that are really app screens
  (secret password, naming creations, score entry, winner ranking, "most investigated").
- **Smoke test (1,000 random playthroughs):** ~29% reach `Scoring` (end of game); every
  failure is one of the three expected manual passages. 141/361 passages visited – coverage is
  limited by those blockers, not by conversion errors.
- Converted output plays in the terminal: `task spike:play` (e.g. `START=Feverheart`).

## Decision: own runtime, not Ink

- The source semantics are Harlowe-via-Cradle, not Ink: hooks revealed in place, `(display:)`
  includes, inline conditionals, loose value comparison. Mapping them to Ink would be a second
  translation with its own bugs; interpreting them directly is ~300 lines (`engine/src/runtime.ts`).
- Our format keeps text out of the logic (string tables), which Ink doesn't do well – and
  translations and the Short reading mode both depend on that.
- Ink export remains possible later from the same data if ever needed.

## What the original really does (not obvious from the code)

1. **Value semantics:** an unset variable equals only another unset value; `x == 0` and `x == ""`
   are both false for it. Numbers vs strings compare numerically when the string parses.
   Starting values come from Unity's serialised `MainData` (strings → `""`, numbers → `0`).
   All copied into `engine/src/values.ts` with tests.
2. **Prompts:** the Harlowe `(prompt:)` was replaced by a pop-up that re-runs the whole passage
   (which can re-roll random results). The engine pauses and resumes instead.
3. **Setup pop-ups navigate:** `ViewItemObtain.SetupPassagename = "X"` is not UI plumbing –
   closing the pop-up goes to passage X. Modelled as `next` on `setupEvent` blocks.
4. **App screens continue the story:** end-of-round and bidding screens carry the next passage.
   Modelled as `ui` nodes whose `next` becomes a link the app clicks.
5. **Hand edits break Cradle's conventions:** passages reuse other passages' fragments
   (`FeverHeart2` → `passage28_Fragment_0`), number mismatches (`passage4_Main` vs
   `passage04_Fragment_0`), 134 fragments left unreferenced. The converter resolves these.
6. **Bugs in the original:** e.g. `GoodNote-Goals ` links to a non-existent `Wolves1`;
   Fear of the Unknown links to missing `Blame2`–`Blame5`, `BlameResolve`, and to placeholders
   (`xxxx`). The M2 tester will decide which are reachable.

## Risks found → plan changes

| Finding | Consequence |
|---|---|
| **French scripts are not a pure translation** – passage counts and even start passages differ | French can't just be a string table over the English structure; it would need an alignment step. **French support is deferred** – the converter task only handles English. |
| **Narrative vs instruction heuristic is ~70–75% accurate** | Not safe on its own for Short mode. Default to `instruction` when unsure; review classifications per passage before writing short texts. |
| **Conditional literal text splits sentences** (e.g. "the **Order of St. Hubertus** / **Fraternity of Hunters** knocked…") | Translation units are sometimes sentence fragments. Fine for EN; for new languages, consider merging such runs into variants of one string. |
| **"Click to continue..." etc. repeated ~800×** | Introduce shared `common.*` keys in M1 to cut translation work (1,866 unique of 3,325). |
| **Developer notes live in the story** (`DEV NOTE` passages, `{0} = "bank"…`) | Converter should mark/exclude them. |
| Arrays are saved through `MainData` string fields in the original | Irrelevant for us (we save JSON), but don't copy that save format. |

## Not done in the spike (moved to M1/M2)

- The 11 app-screen passages (`ui` nodes + screens).
- Event summaries / log book CSVs, end-of-round texts (ScriptableObject data).
- Real story tester (exhaustive walk instead of random walk).
