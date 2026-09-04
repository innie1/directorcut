# Next engineering milestone

The next target is DirectorCut 0.3: a professional timeline/playback engine.

Priority order:
1. GStreamer Editing Services integration for realtime playback.
2. Multiple video/audio tracks with drag/drop, snapping and selection.
3. Frame-accurate trim, ripple, roll, slip and slide edits.
4. Proxy generation/relinking, waveform and thumbnail caches.
5. Typed Director edit-plan protocol so Co-edit can preview operations and Auto can execute them.
6. Autosave/crash recovery before adding heavier AI systems.

The 0.2 Electron renderer should remain runnable while the native playback engine is introduced behind a stable project/timeline model.
