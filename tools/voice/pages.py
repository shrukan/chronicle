"""The voiced pages and their flavour text, shared by the Kokoro generator and the voice script."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
MODES = ("full", "easy", "short")


def voiced(scenario_id: str, intro: str | None = None) -> list[str]:
    """The passages the original app has voice-over for, the scenario's introduction first."""
    names = json.loads((CONTENT / scenario_id / "extras.json").read_text())["voiceOver"]
    return list(dict.fromkeys([*([intro] if intro else []), *names]))


def texts(passage: dict, strings: dict) -> dict[str, list[str]]:
    """The passage's flavour text (string-table markup) per reading mode; modes without their own
    text are left out, and an empty result means nothing to read."""
    nodes = [n for n in passage["body"] if n.get("t") == "text" and n.get("kind") == "narrative"]
    if not nodes:
        return {}
    entries = [strings[n["key"]] for n in nodes]
    out = {"full": [e["full"] for e in entries]}
    for mode in MODES[1:]:
        variant = [e.get(mode, e["full"]) for e in entries]
        if variant != out["full"]:
            out[mode] = variant
    return out


def args(passage: dict) -> list[list[dict]]:
    """The values filled into each paragraph during play (names typed in at the table, …)."""
    return [n.get("args", []) for n in passage["body"] if n.get("t") == "text" and n.get("kind") == "narrative"]


def clip(name: str, mode: str) -> str:
    """A clip's file name, the same for every voice."""
    return f"{name.lower()}{'' if mode == 'full' else '-' + mode}.mp3"
