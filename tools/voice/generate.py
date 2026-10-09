# /// script
# requires-python = ">=3.11"
# dependencies = ["kokoro-onnx>=0.4", "soundfile", "numpy"]
# ///
"""
Generated voice-over: reads a passage's flavour text with Kokoro, in each reading mode that has
its own text, and writes the clips to content/assets/audio/voice/<voice>/ and their index to
content/assets/voices.json. Voices and their sound (speed, pauses, sibilance filter, loudness) are
set in tools/voice/voices.json, as is each scenario's introduction: the page the dev-only voice
test page (/voices) plays.

Spoiler-free output: prints passage names and counts, never the text.

Usage: uv run tools/voice/generate.py [--scenario ID] [--voices emma,george] [PASSAGE …]
       Without passages: the introduction and the passages the original app has voice-over for.
       uv run tools/voice/generate.py --try "Any text"   one clip per voice in build/voice-try/
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
ASSETS = CONTENT / "assets"
INDEX = ASSETS / "voices.json"
CONFIG = json.loads((Path(__file__).parent / "voices.json").read_text())
CACHE = Path.home() / ".cache" / "chronicle" / "kokoro"
MODES = ("full", "easy", "short")


def model() -> Kokoro:
    CACHE.mkdir(parents=True, exist_ok=True)
    files = {}
    for name, url in CONFIG["model"].items():
        path = CACHE / url.rsplit("/", 1)[1]
        if not path.exists():
            print(f"downloading {path.name} …", file=sys.stderr)
            urllib.request.urlretrieve(url, path)
        files[name] = path
    return Kokoro(str(files["onnx"]), str(files["voices"]))


def plain(text: str) -> str:
    """String-table markup to speakable text (see engine/src/text.ts)."""
    text = re.sub(r"\{icon:[^}]*\}", "", text)
    text = re.sub(r"\\(.)", r"\1", re.sub(r"(?<!\\)\*+", "", text))
    return text.strip()


def texts(passage: dict, strings: dict) -> dict[str, list[str]] | None:
    """The passage's flavour text per reading mode; modes without their own text are left out."""
    nodes = [n for n in passage["body"] if n.get("t") == "text" and n.get("kind") == "narrative"]
    if not nodes or any(n.get("args") for n in nodes):
        return None  # nothing to read, or names typed in at the table
    entries = [strings[n["key"]] for n in nodes]
    out = {"full": [e["full"] for e in entries]}
    for mode in MODES[1:]:
        variant = [e[mode] if e.get(mode) and e.get(f"{mode}Reviewed") else e["full"] for e in entries]
        if variant != out["full"]:
            out[mode] = variant
    return {mode: [plain(t) for t in paras] for mode, paras in out.items()}


def loudness(wav: str, voice: dict) -> str:
    """Two-pass loudness normalisation to the original recordings' level (about -14 LUFS)."""
    target = f"loudnorm=I={CONFIG['loudness']}:TP={CONFIG['truePeak']}:LRA=11"
    log = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", wav, "-af", f"{voice['filter']},{target}:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    ).stderr
    m = json.loads(log[log.rindex("{"):])
    return (f"{target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
            f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")


def speak(kokoro: Kokoro, voice: dict, paragraphs: list[str], target: Path) -> float:
    chunks, rate = [], 24000
    for text in paragraphs:
        audio, rate = kokoro.create(text, voice=voice["kokoro"], speed=voice["speed"], lang=voice["lang"])
        chunks += [audio, np.zeros(int(rate * CONFIG["paragraphPause"]), dtype=audio.dtype)]
    with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
        sf.write(wav.name, np.concatenate(chunks), rate)
        target.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", wav.name, "-af", f"{voice['filter']},{loudness(wav.name, voice)}",
             "-ar", "24000", "-ac", "1", "-b:a", CONFIG["bitrate"], str(target)],
            check=True,
        )
    return sum(len(c) for c in chunks) / rate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scenario", default="cost-of-disease")
    parser.add_argument("--voices", default=",".join(CONFIG["voices"]))
    parser.add_argument("--try", dest="text", help="read this text instead, into build/voice-try/")
    parser.add_argument("passages", nargs="*")
    args = parser.parse_args()
    voices = args.voices.split(",")
    if unknown := [v for v in voices if v not in CONFIG["voices"]]:
        sys.exit(f"unknown voice: {', '.join(unknown)}")

    if args.text:
        kokoro = model()
        for voice in voices:
            target = ROOT / "build" / "voice-try" / f"{voice}.mp3"
            seconds = speak(kokoro, CONFIG["voices"][voice], [p for p in args.text.split("\n\n") if p.strip()], target)
            print(f"{target.relative_to(ROOT)}: {seconds:.0f} s")
        return

    folder = CONTENT / args.scenario
    scenario = json.loads((folder / "scenario.json").read_text())
    strings = json.loads((folder / "strings.en.json").read_text())
    intro = CONFIG["intros"].get(args.scenario)
    voiced = json.loads((folder / "extras.json").read_text())["voiceOver"]
    passages = args.passages or list(dict.fromkeys([*([intro] if intro else []), *voiced]))
    if unknown := [p for p in passages if p not in scenario["passages"]]:
        sys.exit(f"unknown passage: {', '.join(unknown)}")

    index = json.loads(INDEX.read_text()) if INDEX.exists() else {"voices": {}, "clips": {}}
    index["voices"] = {v: c["label"] for v, c in CONFIG["voices"].items()}
    index["intros"] = CONFIG["intros"]
    kokoro = model()
    for name in passages:
        by_mode = texts(scenario["passages"][name], strings)
        if by_mode is None:
            print(f"{name}: skipped (no flavour text, or it contains names typed in at the table)")
            continue
        for voice in voices:
            clips = {}
            for mode, paragraphs in by_mode.items():
                file = Path("audio/voice") / voice / f"{name.lower()}{'' if mode == 'full' else '-' + mode}.mp3"
                seconds = speak(kokoro, CONFIG["voices"][voice], paragraphs, ASSETS / file)
                clips[mode] = file.as_posix()
                print(f"{name} · {voice} · {mode}: {seconds:.0f} s")
            index["clips"].setdefault(name, {})[voice] = clips
    INDEX.write_text(json.dumps(index, indent=1, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
