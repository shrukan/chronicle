# Original sources

`original/` holds the files from the original *My Father's Work* app that the converter
(`tools/converter`, `task content:convert`) reads – copied from the fan-made companion app
repository (https://github.com/Deusald/MyFathersWork-FanMadeCompanionApp, commit `f703f83`,
19 July 2026), so Chronicle can still be converted if that repository goes offline:

| File | Used for |
|---|---|
| `Assets/Scripts/StoryScript/English/*.cs` | the three scenarios' stories (Cradle/Twine compiled to C#) |
| `Assets/Scripts/Data/MainData.cs` | story variables shared by all scenarios |
| `Assets/Scenes/Main.unity` | end-of-round and end-of-generation texts |
| `Assets/CSV/Updated Features MFW - Log Book Data (1).csv` | log book entries |
| `Assets/Scripts/ScriptableObject/VOAudio.asset` + the clips' `.meta` files | which passage has which voice-over clip |

The files are unchanged. Like everything in `content/`, they are © Renegade Game Studios,
released to the community in June 2026, and used non-commercially with credit under the terms
of CC BY-NC 4.0 – see [content/LICENSE.md](../content/LICENSE.md).

They are temporary: once all scenarios are converted and `content/` is edited directly, the
converter and this folder are removed (see PLAN.md, "Content lifecycle").
