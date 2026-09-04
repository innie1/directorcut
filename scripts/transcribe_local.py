#!/usr/bin/env python3
"""Local transcription adapter. Uses faster-whisper locally; no paid API calls."""
import argparse
import json
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("media")
    ap.add_argument("-o", "--output", default="transcript.words.json")
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default=None)
    args = ap.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise SystemExit("Install optional dependency: python -m pip install faster-whisper")

    model = WhisperModel(args.model, device="auto", compute_type="default")
    segments, info = model.transcribe(
        args.media,
        language=args.language,
        word_timestamps=True,
        vad_filter=True,
    )
    words = []
    text_parts = []
    for seg in segments:
        text_parts.append(seg.text.strip())
        for w in seg.words or []:
            words.append({
                "text": w.word.strip(),
                "start_ms": round(w.start * 1000),
                "end_ms": round(w.end * 1000),
                "probability": w.probability,
            })

    payload = {
        "media": str(Path(args.media).resolve()),
        "model": args.model,
        "language": getattr(info, "language", args.language),
        "language_probability": getattr(info, "language_probability", None),
        "text": " ".join(p for p in text_parts if p),
        "words": words,
    }
    Path(args.output).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(words)} words to {args.output}")


if __name__ == "__main__":
    main()
