# DirectorCut 0.2

**DirectorCut** is a local-first intelligent video-editor project: a real editing core plus a Director layer that can learn a creator's corrections over time. It is designed so paid AI APIs are optional rather than fundamental.

> Status: **working developer MVP**. It can import/probe local video, create script scenes, perform reversible In/Out cut planning, render those cuts through FFmpeg, save/open projects, transcribe locally with Whisper, search exact spoken phrases by timestamp, export SRT captions, and use a local llama.cpp-compatible Director. The native C++ command/timeline core is compiled and tested. It is not yet a Premiere/Resolve replacement; see `docs/ROADMAP.md`.

## Fastest Windows start

Prerequisites: Node.js LTS, Python 3.11/3.12+, and FFmpeg/ffprobe in PATH.

```powershell
git clone https://github.com/innie1/directorcut.git
cd directorcut
.\scripts\setup-windows.ps1
.\scripts\run-windows.ps1
```

If you also want local Whisper transcription:

```powershell
.\scripts\setup-windows.ps1 -InstallAI
```

If a prerequisite is missing, the setup script prints the matching `winget` install command.

## Linux start

```bash
git clone https://github.com/innie1/directorcut.git
cd directorcut
./scripts/setup-linux.sh
./scripts/run-linux.sh
```

## What the desktop MVP can do

- Pick a local video with the native file dialog.
- Probe duration, resolution and codecs with `ffprobe`.
- Preview video locally; it is not uploaded.
- Import a `.txt` or `.md` script and create a scene plan.
- Mark scenes and split points.
- Set **In** / **Out**, delete that range, and undo the change.
- Render the retained ranges into an MP4 using local FFmpeg.
- Save and reopen `.directorcut` project files.
- Run faster-whisper locally for word timestamps.
- Search `where did I say ...`-style phrases and jump the playhead to the exact time.
- Export timestamped transcript words as `.srt` captions.
- Work in Director **Ask / Co-edit / Auto** modes.
- Talk to a local OpenAI-compatible LLM endpoint (for example llama.cpp `llama-server`).
- Fall back to deterministic editing guidance when no local LLM is running.

## Native core

The C++20 core owns durable editing primitives and learning history:

```bash
cmake -S . -B build -DDIRECTORCUT_BUILD_QT_UI=OFF
cmake --build build -j
ctest --test-dir build --output-on-failure
./build/directorcut demo
```

Windows with Visual Studio Build Tools:

```powershell
cmake -S . -B build -DDIRECTORCUT_BUILD_QT_UI=OFF
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
.\build\Release\directorcut.exe demo
```

SQLite development files are required for the native core. Qt 6 is optional; if Qt 6 Quick/QML is installed, CMake also builds the experimental `directorcut_desktop` shell. The immediately runnable UI is currently Electron while the GStreamer/Qt professional playback engine is built out.

## Local Director model

DirectorCut looks for a local OpenAI-compatible server at `http://127.0.0.1:8080/v1/chat/completions`.

Example with llama.cpp:

```text
llama-server -m C:\models\director-model.gguf --port 8080 -c 8192
```

See `docs/LOCAL_AI.md`.

## Repository map

- `core/` — C++ timeline, commands, learning-event store, transcript primitives, media helpers
- `apps/cli/` — native core demo/CLI
- `desktop/` — Electron desktop host and safe IPC bridge
- `prototype/` — renderer UI used by the desktop shell and standalone browser fallback
- `native-ui/` — Qt/QML shell source for the future native professional UI
- `scripts/` — local transcription and setup/run scripts
- `skills/` — editable Markdown Director skills
- `docs/` — architecture, local AI setup, status, and roadmap
- `tests/` — native core tests

## Design invariants

1. Every Director edit should resolve to a typed timeline operation.
2. Destructive decisions must be undoable or transaction-previewed.
3. Ask mode cannot silently mutate the timeline.
4. Co-edit mode proposes before commit.
5. Auto mode still logs every operation.
6. User corrections are learning events, not invisible prompt text.
7. Motion graphics should remain editable until export.
8. Models are replaceable; project/timeline formats are not model-owned.
9. Media stays local unless the user explicitly chooses a network/cloud feature.

## Commercial note

This repository is currently proprietary / all-rights-reserved. Before commercial distribution, codec, Qt/GStreamer/FFmpeg build flags, bundled models, model weights, and every third-party component must go through a formal license review.
