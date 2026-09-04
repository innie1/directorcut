// Professional media-bin workflow: import never replaces the edit; adding to timeline is deliberate.
(() => {
  const MU = window.DirectorMediaLibraryUtils;
  const TL = window.DirectorTimeline;
  const bin = document.querySelector('#mediaBin');
  const pick = document.querySelector('#pickVideo');
  const add = document.querySelector('#addMedia');
  const videoInput = document.querySelector('#videoInput');
  const video = document.querySelector('#video');
  if (!MU || !TL || !bin) return;

  state.mediaLibrary = MU.normalizeLibrary(state.mediaLibrary || (state.media ? [state.media] : []));
  state.selectedLibraryId = state.selectedLibraryId || state.mediaLibrary[0]?.libraryId || null;

  const hasTimelineVideo = () => (state.timeline?.tracks || []).some(t => t.kind === 'video' && (t.clips || []).length);
  const toast = text => typeof window.DirectorCutEditorToast === 'function' ? window.DirectorCutEditorToast(text) : null;
  const meta = media => {
    const duration = Number(media.duration || 0);
    const dims = media.width && media.height ? `${media.width}×${media.height}` : 'video';
    return `${typeof tc === 'function' ? tc(duration) : `${duration.toFixed(1)}s`} · ${dims}`;
  };
  const libraryItem = id => state.mediaLibrary.find(item => item.libraryId === id) || null;

  function setActiveSource(media, explicitPreview = false) {
    if (!media) return;
    state.selectedLibraryId = media.libraryId;
    // The legacy state.media field is now the active source/inspector media, not the whole media library.
    state.media = media;
    if (!hasTimelineVideo() || explicitPreview) {
      state.duration = Number(media.duration || 0);
      if (media.url && typeof setVideoSource === 'function') setVideoSource(media.url);
      if (typeof renderMediaInfo === 'function') renderMediaInfo();
      const badge = document.querySelector('#previewBadge');
      if (badge && explicitPreview) badge.textContent = 'SOURCE';
    }
    renderLibrary();
  }

  function addMediaToTimeline(media, mode = 'append') {
    if (!media || media.error) return;
    const beforeHadVideo = hasTimelineVideo();
    if (typeof pushUndo === 'function') pushUndo();
    if (mode === 'insert') state.timeline = MU.insertMedia(state.timeline, media, Number(video?.currentTime || 0));
    else state.timeline = MU.appendMedia(state.timeline, media);
    if (!beforeHadVideo) {
      state.media = media;
      state.duration = Math.max(Number(media.duration || 0), Number(TL.duration(state.timeline) || 0));
      if (media.url && typeof setVideoSource === 'function') setVideoSource(media.url);
      if (typeof renderMediaInfo === 'function') renderMediaInfo();
    }
    state.selectedLibraryId = media.libraryId;
    if (typeof markDirty === 'function') markDirty();
    if (typeof renderTimeline === 'function') renderTimeline();
    renderLibrary();
    toast(mode === 'insert' ? `Inserted ${media.name} at playhead` : `Added ${media.name} to timeline`);
  }

  function renderLibrary() {
    bin.innerHTML = '';
    if (!state.mediaLibrary.length) {
      const empty = document.createElement('div');
      empty.className = 'mediaBinEmpty';
      empty.textContent = 'Import videos here. Nothing is added to the timeline until you choose Add or Insert.';
      bin.appendChild(empty);
      return;
    }
    for (const media of state.mediaLibrary) {
      const card = document.createElement('article');
      card.className = `mediaLibraryItem${state.selectedLibraryId === media.libraryId ? ' selected' : ''}`;
      card.dataset.mediaId = media.libraryId;
      card.draggable = true;
      card.innerHTML = `<div class="mediaLibraryThumb"><span>▶</span></div><div class="mediaLibraryText"><strong></strong><small></small></div><div class="mediaLibraryActions"><button type="button" data-media-action="append" title="Append to end of timeline">＋ Add</button><button type="button" data-media-action="insert" title="Insert at playhead and move later clips">Insert</button><button type="button" data-media-action="preview" title="Preview this source without changing the timeline">Preview</button></div>`;
      card.querySelector('strong').textContent = media.name || 'Untitled video';
      card.querySelector('small').textContent = meta(media);
      card.onclick = event => {
        if (event.target.closest('button')) return;
        state.selectedLibraryId = media.libraryId;
        renderLibrary();
      };
      card.ondblclick = event => {
        if (event.target.closest('button')) return;
        setActiveSource(media, true);
      };
      card.querySelector('[data-media-action="append"]').onclick = () => addMediaToTimeline(media, 'append');
      card.querySelector('[data-media-action="insert"]').onclick = () => addMediaToTimeline(media, 'insert');
      card.querySelector('[data-media-action="preview"]').onclick = () => setActiveSource(media, true);
      card.addEventListener('dragstart', event => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-directorcut-media', media.libraryId);
      });
      bin.appendChild(card);
    }
  }

  async function importDesktopMedia() {
    let items = [];
    try {
      if (typeof window.directorcut?.pickManyMedia === 'function') items = await window.directorcut.pickManyMedia();
      else if (typeof window.directorcut?.pickMedia === 'function') {
        const single = await window.directorcut.pickMedia();
        if (single) items = [single];
      }
    } catch (error) {
      toast(`Import failed: ${error.message}`);
      return;
    }
    if (!items?.length) return;
    const valid = items.filter(item => item && !item.error);
    const errors = items.filter(item => item?.error);
    state.mediaLibrary = MU.mergeLibrary(state.mediaLibrary, valid);
    const added = valid.map(item => state.mediaLibrary.find(saved => MU.keyFor(saved) === MU.keyFor(item))).filter(Boolean);
    if (!state.selectedLibraryId && added[0]) state.selectedLibraryId = added[0].libraryId;
    if (!hasTimelineVideo() && added[0]) setActiveSource(added[0], true);
    else renderLibrary();
    if (typeof markDirty === 'function') markDirty();
    toast(`${added.length} media item${added.length === 1 ? '' : 's'} imported${errors.length ? ` · ${errors.length} failed` : ''}`);
  }

  async function importBrowserFiles(files) {
    const incoming = [...(files || [])].map(file => ({
      libraryId:`browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,
      name:file.name, path:null, url:URL.createObjectURL(file), duration:0, frameRate:'30/1', browserFile:file
    }));
    state.mediaLibrary = MU.mergeLibrary(state.mediaLibrary, incoming);
    renderLibrary();
    toast(`${incoming.length} media item${incoming.length === 1 ? '' : 's'} imported`);
  }

  // Replace the legacy primary-media behavior. Import is library-only.
  if (pick) {
    pick.textContent = 'Import media';
    pick.onclick = () => window.directorcut?.desktop ? importDesktopMedia() : videoInput?.click();
  }
  if (add) {
    add.textContent = '＋ Import';
    add.onclick = () => window.directorcut?.desktop ? importDesktopMedia() : videoInput?.click();
  }
  if (videoInput) {
    videoInput.multiple = true;
    videoInput.onchange = event => importBrowserFiles(event.target.files);
  }
  // Any older caller that still invokes acceptDesktopMedia now adds to the bin rather than rebuilding the edit.
  if (typeof acceptDesktopMedia === 'function') {
    acceptDesktopMedia = async media => {
      if (!media) return;
      state.mediaLibrary = MU.mergeLibrary(state.mediaLibrary, [media]);
      const saved = state.mediaLibrary.find(item => MU.keyFor(item) === MU.keyFor(media));
      if (saved && !hasTimelineVideo()) setActiveSource(saved, true);
      else renderLibrary();
      if (typeof markDirty === 'function') markDirty();
    };
  }

  // Drag a library clip onto a video lane to insert it at that timeline position.
  const tracks = document.querySelector('#tracks');
  if (tracks) {
    tracks.addEventListener('dragover', event => {
      if (!event.dataTransfer.types.includes('application/x-directorcut-media')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    tracks.addEventListener('drop', event => {
      const id = event.dataTransfer.getData('application/x-directorcut-media');
      const media = libraryItem(id);
      const lane = event.target.closest('.lane');
      if (!media || !lane) return;
      event.preventDefault();
      const rect = lane.getBoundingClientRect();
      const duration = Math.max(Number(TL.duration(state.timeline) || 0), Number(media.duration || 0), 1);
      const at = Math.max(0, Math.min(duration, ((event.clientX - rect.left) / Math.max(1, rect.width)) * duration));
      if (typeof pushUndo === 'function') pushUndo();
      state.timeline = MU.insertMedia(state.timeline, media, at);
      if (!state.media) state.media = media;
      if (typeof markDirty === 'function') markDirty();
      if (typeof renderTimeline === 'function') renderTimeline();
      toast(`Inserted ${media.name}`);
    });
  }

  // Persist the full bin with the project. Legacy state.media remains for compatibility.
  if (typeof projectObject === 'function') {
    const baseProjectObject = projectObject;
    projectObject = function (...args) {
      const project = baseProjectObject.apply(this,args);
      project.mediaLibrary = state.mediaLibrary.map(({browserFile,...item}) => item);
      project.selectedLibraryId = state.selectedLibraryId;
      return project;
    };
  }
  if (typeof loadProjectObject === 'function') {
    const baseLoadProject = loadProjectObject;
    loadProjectObject = function (project, ...rest) {
      const result = baseLoadProject.call(this, project, ...rest);
      state.mediaLibrary = MU.normalizeLibrary(project?.mediaLibrary?.length ? project.mediaLibrary : project?.media ? [project.media] : []);
      state.selectedLibraryId = project?.selectedLibraryId || state.mediaLibrary[0]?.libraryId || null;
      renderLibrary();
      return result;
    };
  }

  renderLibrary();
})();
