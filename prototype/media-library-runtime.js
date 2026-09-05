// Professional media-bin workflow: import never replaces the edit; adding to timeline is deliberate.
(() => {
  const MU = window.DirectorMediaLibraryUtils;
  const FI = window.DirectorFootageIntelligence;
  const TL = window.DirectorTimeline;
  const bin = document.querySelector('#mediaBin');
  const pick = document.querySelector('#pickVideo');
  const add = document.querySelector('#addMedia');
  const videoInput = document.querySelector('#videoInput');
  const video = document.querySelector('#video');
  if (!MU || !TL || !bin) return;

  state.mediaLibrary = MU.normalizeLibrary(state.mediaLibrary || (state.media ? [state.media] : []));
  state.selectedLibraryId = state.selectedLibraryId || state.mediaLibrary[0]?.libraryId || null;
  const analyzing = new Set();

  const hasTimelineVideo = () => (state.timeline?.tracks || []).some(t => t.kind === 'video' && (t.clips || []).length);
  const toast = text => typeof window.DirectorCutEditorToast === 'function' ? window.DirectorCutEditorToast(text) : null;
  const meta = media => {
    const duration = Number(media.duration || 0);
    const dims = media.width && media.height ? `${media.width}×${media.height}` : 'video';
    return `${typeof tc === 'function' ? tc(duration) : `${duration.toFixed(1)}s`} · ${dims}`;
  };
  const intelligenceText = media => {
    const summary=media?.intelligence?.summary;if(!summary)return'';
    const parts=[`${summary.sceneCount||0} shot${summary.sceneCount===1?'':'s'}`];
    if(summary.silenceSeconds>0)parts.push(`${Number(summary.silenceSeconds).toFixed(1)}s silence`);
    const duplicates=(summary.duplicateScenes||0)+(summary.nearDuplicateScenes||0);if(duplicates)parts.push(`${duplicates} duplicate${duplicates===1?'':'s'}`);
    if(summary.flaggedScenes)parts.push(`${summary.flaggedScenes} flagged`);
    if(Number.isFinite(summary.averageQuality))parts.push(`quality ${summary.averageQuality}/100`);
    return parts.join(' · ');
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

  function addLibraryItems(items = [], options = {}) {
    const valid=(Array.isArray(items)?items:[items]).filter(item=>item&&!item.error&&(item.path||item.url));
    if(!valid.length)return[];
    state.mediaLibrary=MU.mergeLibrary(state.mediaLibrary,valid);
    const saved=valid.map(item=>state.mediaLibrary.find(entry=>MU.keyFor(entry)===MU.keyFor(item))).filter(Boolean);
    if(options.select!==false&&saved.length)state.selectedLibraryId=saved[saved.length-1].libraryId;
    if(options.preview&&saved.length)setActiveSource(saved[saved.length-1],true);else renderLibrary();
    if(typeof markDirty==='function')markDirty();
    return saved;
  }

  async function analyzeMediaItem(media){
    if(!media?.path||!window.directorcut?.desktop||typeof window.directorcut.analyzeMedia!=='function'){toast('Footage analysis requires a local desktop media file.');return;}
    if(analyzing.has(media.libraryId))return;
    analyzing.add(media.libraryId);renderLibrary();toast(`Analyzing ${media.name} locally…`);
    try{
      const intelligence=await window.directorcut.analyzeMedia({sourcePath:media.path,sceneThreshold:.30,noiseDb:-35,minSilence:.35,maxQualitySamples:32,sampleSize:16});
      media.intelligence=FI?.normalizeAnalysis?FI.normalizeAnalysis(intelligence):intelligence;
      const active=state.mediaLibrary.find(item=>item.libraryId===media.libraryId);if(active&&active!==media)active.intelligence=media.intelligence;
      if(state.media?.libraryId===media.libraryId||state.media?.path===media.path)state.media.intelligence=media.intelligence;
      if(typeof markDirty==='function')markDirty();
      const summary=intelligenceText(media);toast(summary?`Analysis ready · ${summary}`:`Analysis ready for ${media.name}`);
    }catch(error){toast(`Analysis failed: ${error.message||error}`);}
    finally{analyzing.delete(media.libraryId);renderLibrary();}
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
      card.className = `mediaLibraryItem${state.selectedLibraryId === media.libraryId ? ' selected' : ''}${media.intelligence ? ' analyzed' : ''}`;
      card.dataset.mediaId = media.libraryId;
      card.draggable = true;
      card.innerHTML = `<div class="mediaLibraryThumb"><span class="mediaThumbGlyph">${media.source==='recording'?'●':'▶'}</span><small class="mediaThumbTime"></small><button type="button" class="mediaThumbAdd" title="Add to the end of the timeline">＋</button></div><div class="mediaLibraryText"><strong></strong><small class="mediaMeta"></small><small class="mediaIntelligence" hidden></small></div><div class="mediaLibraryActions"><button type="button" data-media-action="append" title="Append to end of timeline">＋ Add</button><button type="button" data-media-action="insert" title="Insert at playhead and move later clips">Insert</button><button type="button" data-media-action="preview" title="Preview this source without changing the timeline">Preview</button><button type="button" data-media-action="analyze" title="Analyze shots, silence, duplicates and quality locally">Analyze</button></div>`;
      // Show a real frame rather than a glyph. A muted metadata-only <video> seeked a
      // little way in renders its own poster locally, with no ffmpeg round trip.
      const thumb = card.querySelector('.mediaLibraryThumb');
      if (media.url) {
        const frame = document.createElement('video');
        frame.className = 'mediaThumbFrame';
        frame.muted = true; frame.playsInline = true; frame.preload = 'metadata';
        frame.src = `${media.url}#t=${(Math.min(1, Number(media.duration || 0) / 4) || 0.1).toFixed(2)}`;
        frame.addEventListener('loadeddata', () => card.classList.add('hasFrame'), { once:true });
        thumb.prepend(frame);
      }
      const thumbTime = card.querySelector('.mediaThumbTime');
      const seconds = Number(media.duration || 0);
      if (seconds > 0) thumbTime.textContent = typeof tc === 'function' ? tc(seconds).slice(0, 8) : `${seconds.toFixed(1)}s`;
      else thumbTime.remove();
      card.querySelector('.mediaThumbAdd').onclick = event => { event.stopPropagation(); addMediaToTimeline(media, 'append'); };
      card.querySelector('strong').textContent = media.name || 'Untitled video';
      card.querySelector('.mediaMeta').textContent = meta(media);
      const intelligence=card.querySelector('.mediaIntelligence'),summary=intelligenceText(media);if(summary){intelligence.textContent=`✦ ${summary}`;intelligence.hidden=false;}
      const analyzeButton=card.querySelector('[data-media-action="analyze"]');if(analyzing.has(media.libraryId)){analyzeButton.textContent='Analyzing…';analyzeButton.disabled=true;}else if(media.intelligence)analyzeButton.textContent='Re-analyze';
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
      analyzeButton.onclick=()=>analyzeMediaItem(media);
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
    const hadTimelineVideo = hasTimelineVideo();
    const added = addLibraryItems(valid, { select:!state.selectedLibraryId });
    let seeded = false;
    if (!hadTimelineVideo && added[0]) {
      setActiveSource(added[0], true);
      // An empty timeline is a dead end: the preview shows a source that is not in
      // the cut and the Director has nothing to edit. Seeding the first import is
      // not "replacing the edit" - there is no edit yet - so place it automatically.
      // Later imports still wait in the bin until the user adds them deliberately.
      addMediaToTimeline(added[0], 'append');
      seeded = true;
    } else renderLibrary();
    const failed = errors.length ? ` · ${errors.length} failed` : '';
    toast(seeded
      ? `${added[0].name} added to the timeline${added.length > 1 ? ` · ${added.length - 1} more in the bin` : ''}${failed}`
      : `${added.length} media item${added.length === 1 ? '' : 's'} imported${failed}`);
  }

  async function importBrowserFiles(files) {
    const incoming = [...(files || [])].map(file => ({
      libraryId:`browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,
      name:file.name, path:null, url:URL.createObjectURL(file), duration:0, frameRate:'30/1', browserFile:file
    }));
    addLibraryItems(incoming);
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
      const [saved] = addLibraryItems([media]);
      if (saved && !hasTimelineVideo()) setActiveSource(saved, true);
      else renderLibrary();
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
  window.DirectorCutMediaLibraryRuntime={renderLibrary,addLibraryItems,addMediaToTimeline,setActiveSource,analyzeMediaItem,intelligenceText};
})();
