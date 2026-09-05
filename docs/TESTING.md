# Testing DirectorCut

Three layers, cheapest first. Run the first two on every change; the third before
you ship anything.

## 1. Unit tests — seconds, no display needed

```bash
cd desktop
npm run check     # parses every renderer and host file
npm test          # 28 suites: timeline engine, captions, effects, Director ops…
```

```bash
cmake -S . -B build -DDIRECTORCUT_BUILD_QT_UI=OFF && cmake --build build -j
ctest --test-dir build --output-on-failure
```

These are fast and they cover the maths — trims, ripples, keyframes, script
assembly. **They cannot tell you the app works.** They never load the page, so a
crash at startup passes every one of them.

## 2. Smoke test — the one that catches real breakage

```bash
node scripts/mock-ollama.js &       # stand-in local model, or start real Ollama
cd desktop && npm run smoke
```

Headless machine? Put `xvfb-run -a` in front. Needs `ffmpeg` on `PATH`; it
generates its own test footage and cleans up after itself.

It launches the real app and drives it the way you would — import, split, undo,
full screen, ask the Director, build a cut from a script, export — then prints a
table and exits non-zero if anything failed:

```
 PASS  first import lands on the timeline
 PASS  manual split cuts a clip  (1 -> 2)
 PASS  Ask never mutates the timeline
 PASS  Director builds a cut from the script  (3 clips, 3 captions, 8.0s)
 PASS  exports a playable MP4  (551KB)
 PASS  no renderer console errors
 14/14 passed
```

The last line matters most. Both freezes that once made the editor unusable —
importing a video, and reopening the app after any edit — were load-time faults
that produced console errors and passed every unit test.

## 3. By hand — ten minutes

1. **Start** `./scripts/run-windows.ps1` (or `run-linux.sh`). Home screen appears.
2. **Import** a video. It should land on the timeline immediately and show a
   real frame in the bin. Import a second: it waits in the bin.
3. **Drag** a bin card onto a track. Hover a card and press **+** to append.
4. **Edit**: split (S), undo (Ctrl+Z), drag a clip, trim its edges.
5. **Full screen**: the button in the transport, `Esc` to come back.
6. **Director**, with Ollama running and a model selected:
   - *Ask* — "tighten the intro". It should advise and change **nothing**.
   - *Co-edit* — same request. It proposes; **Apply** commits, **Reject** does not.
   - *Auto* — "build the video from my script" after importing a script. Clips,
     captions and dissolves should appear.
   - "add an opening title", "give the first clip a ken burns move".
7. **Export**. Play the MP4 outside the app.
8. **Reopen** the app. It must start, and offer your autosave on the home screen.

## Testing the Director without a model

`scripts/mock-ollama.js` answers on `127.0.0.1:11434` like Ollama does, reading
scripted replies from `/tmp/dc-mock-script.json` (re-read per request):

```json
[{ "match": "build the video",
   "json": { "intent": "edit_task", "response": "Building it.",
             "operations": [{ "type": "assemble_from_script", "captions": true,
                              "transition": "dissolve" }] } }]
```

That pins down exactly which operations come back, so a failure is the app's
fault and not the model's. Use `"raw"` instead of `"json"` to hand back the
messier output a small quantized model really emits and check the app copes.

To judge how well a **real** model writes operations, run Ollama itself — the app
uses whatever is listening on 11434. A 3B model is the realistic floor for
multi-step edits; 1B models converse well but plan poorly.

## What is not covered

- The native GStreamer/GES monitor beyond its headless CI smoke test.
- Real model quality — the mock proves the pipeline, not the planning.
- Windows and macOS packaging.
