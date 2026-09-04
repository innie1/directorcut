# DirectorCut roadmap

## 0.2 — runnable local MVP (current)
- Desktop Electron shell
- Local media import/probe
- Program monitor
- Script-to-scenes
- In/Out range deletion + undo
- FFmpeg cut rendering
- Project save/open
- Local Whisper word timestamps
- Phrase-to-timestamp search
- SRT export
- Ask / Co-edit / Auto Director modes
- Local llama.cpp-compatible Director endpoint
- SQLite-native learning core
- C++ command/timeline core + tests

## 0.3 — professional timeline
- GStreamer Editing Services playback graph
- Frame-accurate trim, ripple, roll, slip, slide
- Multiple video/audio tracks
- Drag/drop snapping and magnetic edit modes
- Proxy generation and relinking
- Waveforms + thumbnail cache
- Keyframes and speed controls
- Render queue

## 0.4 — Director actually edits the timeline
- Typed JSON edit-plan protocol
- Transaction preview in Co-edit mode
- Director tool calling for split/trim/move/delete/caption operations
- Automatic rough cut from script + transcript alignment
- Take selection and silence/filler removal
- Central preference synthesis from corrections

## 0.5 — recording Director
- Scene-by-scene camera recorder
- Teleprompter + performance direction
- Take management
- Resume recording across sessions
- Script/take alignment and automatic assembly

## 0.6 — visual intelligence
- Qwen-VL-compatible media understanding
- Semantic B-roll retrieval
- SAM 2 subject masks/tracking
- Face/object search
- OCR/evidence extraction
- Auto reframing

## 0.7 — motion + finishing
- Editable motion-graphics scene graph
- Kinetic typography
- Charts, counters, maps, callouts
- Color-match tools and look memory
- Dialogue cleanup, music ducking and loudness
- Retention and continuity review

## 1.0 — commercial editor
- Installer + signed builds
- GPU backend matrix (NVIDIA/AMD/Intel/Apple)
- Crash recovery/autosave
- Plugin/skill SDK
- Model manager
- Licensing/account layer without making editing cloud-dependent
- Benchmark suite and supported-hardware profiles
