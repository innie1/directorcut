# DirectorCut 0.3

**DirectorCut** is a local-first intelligent video editor: a real manual timeline plus a Director layer that can converse naturally, use local models, perform typed edits, and learn from accepted/rejected decisions. Paid AI APIs are optional rather than fundamental.

> Status: **integrated developer MVP**. The current desktop app is ready for hands-on testing. It is not yet a Premiere/Resolve replacement; the native GStreamer monitor, multi-source compositor/export, and rendered keyframe effects are still being completed.

## Windows — clone/update and run

```powershell
git clone --branch main11 https://github.com/innie1/directorcut.git
cd directorcut
.\scripts\setup-windows.ps1
.\scripts\run-windows.ps1
```

If you already cloned it:

```powershell
git checkout main11
git pull origin main11
.\scripts\setup-windows.ps1
.\scripts\run-windows.ps1
```

Optional local Whisper transcription:

```powershell
.\scripts\setup-windows.ps1 -InstallAI
```

Base setup requires Node.js LTS and FFmpeg/ffprobe. Python is only needed for Whisper.

## What is integrated in 0.3

### Manual + Director on the same timeline

The top workspace toggle switches between **Manual** and **Director** without changing projects or timelines.

- **Manual** — hand-edit normally. AI can chat, explain, search and analyze but cannot mutate the timeline.
- **Director / Ask** — AI may analyze and explain edits but cannot mutate.
- **Director / Co-edit** — AI returns validated typed operations and asks you to Apply or Reject.
- **Director / Auto** — validated editing operations can be applied automatically and remain undoable/logged.

### Ollama

DirectorCut automatically checks local Ollama at `127.0.0.1:11434`, lists models already installed on the computer, remembers the selected model, and warms the selected model for faster conversation. Normal conversation is classified separately from editing tasks. A llama.cpp-compatible endpoint remains available as a fallback.

### Floating composer

A compact floating composer stays available while editing. The `+` button can attach documents, text, images, audio, video and other files as local conversation/editing context. Recent conversation, current playhead, selected clip, In/Out range, transcript excerpt, scene plan and timeline IDs can be supplied to the Director.

### Professional timeline foundation

- Multiple video/audio/caption/graphics tracks.
- Real frame-snapped clip splitting.
- Draggable clips with snapping.
- Select / Ripple / Roll / Slip / Slide tools.
- Source-aware trim limits.
- Frame-rate-snapped In/Out cuts and markers.
- Keyframe storage/display for opacity, scale, volume and future properties.
- Undo snapshots.
- Atomic autosave and recovery.
- Director operations use the same timeline primitives as manual edits.

### Media performance

- FFmpeg media probing.
- Background thumbnail generation.
- Background audio waveform generation.
- Optional cached 1280-wide editing proxy.
- Proxy/original preview toggle; final cut export continues from the original source.
- Frame-snapped cut export uses decode-accurate seeking.

### GStreamer / GPU path

DirectorCut detects GStreamer, GStreamer Editing Services (GES), and common hardware plugin families such as D3D11/12, Vulkan, NVCodec, QSV, VAAPI and AMF. The native C++ `directorcut_gstreamer` target uses GStreamer `playbin3`/`playbin` with accurate seeking when GStreamer development libraries are installed.

**Important:** the Electron program monitor in 0.3 still uses Chromium playback. The native GStreamer backend is now scaffolded and buildable, but the final embedded GStreamer monitor/GES compositor bridge is the next native integration step.

## Other working features

- Import/probe local media; media is not uploaded by default.
- Import `.txt` / `.md` scripts and create scene plans.
- Local faster-whisper transcription with word timestamps.
- Search an exact spoken phrase and jump to its timestamp.
- SRT subtitle export.
- Save/open `.directorcut` projects.
- FFmpeg MP4 export for current cut plan.
- Markdown Director skills.
- Persistent learning history for accepted/rejected decisions.

## Native core

```bash
cmake -S . -B build -DDIRECTORCUT_BUILD_QT_UI=OFF
cmake --build build -j
ctest --test-dir build --output-on-failure
```

If GStreamer development packages are visible through `pkg-config`, CMake also builds `directorcut_gstreamer`. If GES is found, the target gets `DIRECTORCUT_HAS_GES=1`. Missing GStreamer/Qt packages do not prevent the core/CLI from building.

## Repository map

- `core/` — C++ core plus optional native GStreamer playback backend
- `apps/cli/` — native core demo/CLI
- `desktop/` — Electron host, Ollama client, GStreamer detection, FFmpeg background jobs and IPC
- `prototype/` — current integrated editor renderer and frame-snapped timeline engine
- `native-ui/` — Qt/QML native-shell work
- `scripts/` — setup/run/transcription helpers
- `skills/` — editable Markdown Director skills
- `docs/` — architecture, roadmap and `V0.3_TESTING.md`
- `tests/` / `desktop/tests/` — C++ and renderer/timeline regression tests

## Design invariants

1. Manual and Director always operate on the same durable timeline.
2. Every Director edit resolves to a typed timeline operation.
3. Destructive decisions are undoable or transaction-previewed.
4. Manual and Director/Ask cannot silently mutate the timeline.
5. Co-edit proposes before commit; Auto still logs every operation.
6. Conversation is not automatically treated as an editing task.
7. User corrections are learning events, not invisible prompt text.
8. Models are replaceable; project/timeline formats are not model-owned.
9. Media stays local unless the user explicitly chooses a network/cloud feature.

## Testing

```bash
cd desktop && npm run check && npm test      # unit tests, no display needed
node scripts/mock-ollama.js &                # stand-in local model
cd desktop && npm run smoke                  # drives the real app end to end
```

`npm run smoke` launches the app, imports footage, splits, undoes, goes full
screen, asks the Director to build a cut from a script, exports, and fails if the
renderer logged a single error. See `docs/TESTING.md`; `docs/V0.3_TESTING.md`
covers the older manual flow.

## Commercial note

This repository is currently proprietary / all-rights-reserved. Before commercial distribution, codec, Qt/GStreamer/FFmpeg build flags, bundled models/model weights, and all third-party components require a formal license review.
