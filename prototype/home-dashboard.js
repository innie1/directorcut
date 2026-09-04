// DirectorCut full-width home dashboard. The editor stays hidden until a project is opened/created.
(() => {
  const overlay = document.querySelector('#welcomeOverlay');
  const card = overlay?.querySelector('.welcomeCard');
  if (!overlay || !card) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'home-dashboard.css';
  css.dataset.homeDashboard = 'true';
  if (!document.querySelector('link[data-home-dashboard]')) document.head.appendChild(css);

  overlay.classList.add('homeDashboard');
  const title = card.querySelector('h1');
  const subtitle = card.querySelector(':scope > p');
  if (title) title.textContent = 'Start creating';
  if (subtitle) subtitle.textContent = 'Choose how you want to begin.';

  let sections = card.querySelector('.homeDashboardSections');
  if (!sections) {
    sections = document.createElement('div');
    sections.className = 'homeDashboardSections';
    sections.innerHTML = `
      <section class="homeSection" aria-labelledby="editedVideosTitle">
        <div class="homeSectionHeader">
          <div><h2 id="editedVideosTitle">Edited videos</h2><p>Your latest DirectorCut exports.</p></div>
        </div>
        <div id="homeEditedGrid" class="homeGrid"></div>
      </section>
      <section class="homeSection" aria-labelledby="projectsTitle">
        <div class="homeSectionHeader">
          <div><h2 id="projectsTitle">Your Projects</h2><p>Continue an autosave or reopen a saved DirectorCut project.</p></div>
          <button id="homeBrowseProject" class="homeSectionAction" type="button">Open project</button>
        </div>
        <div id="homeProjectsGrid" class="homeGrid"></div>
      </section>`;
    card.appendChild(sections);
  }

  const editedGrid = sections.querySelector('#homeEditedGrid');
  const projectsGrid = sections.querySelector('#homeProjectsGrid');
  const browseProject = sections.querySelector('#homeBrowseProject');

  function when(value) {
    if (!value) return 'Recently';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Recently';
    const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  function durationLabel(value) {
    const n = Math.max(0, Number(value || 0));
    if (!n) return '';
    const minutes = Math.floor(n / 60);
    const seconds = Math.floor(n % 60);
    return minutes ? `${minutes}:${String(seconds).padStart(2,'0')}` : `${seconds}s`;
  }

  function emptyCard(titleText, bodyText) {
    const node = document.createElement('div');
    node.className = 'homeEmptyCard';
    node.innerHTML = `<div><b></b><span></span></div>`;
    node.querySelector('b').textContent = titleText;
    node.querySelector('span').textContent = bodyText;
    return node;
  }

  function exportCard(entry) {
    const node = document.createElement('article');
    node.className = 'homeCard';
    node.tabIndex = 0;
    node.innerHTML = `<div class="homeCardVisual exportVisual"><span class="homeCardBadge">Edited video</span><span class="homePlay">▶</span></div><div class="homeCardBody"><strong></strong><small></small></div>`;
    node.querySelector('strong').textContent = entry?.name || 'DirectorCut export';
    const duration = durationLabel(entry?.duration);
    node.querySelector('small').textContent = [duration, when(entry?.updatedAt)].filter(Boolean).join(' · ');
    const open = async () => {
      try { await window.directorcut?.homeOpenExport?.(entry.path); }
      catch (error) { window.DirectorCutEditorToast?.(error.message || 'Could not open edited video'); }
    };
    node.onclick = open;
    node.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
    return node;
  }

  function projectCard(entry, autosaveProject = null) {
    const node = document.createElement('article');
    node.className = `homeCard${autosaveProject ? ' homeAutosave' : ''}`;
    node.tabIndex = 0;
    node.innerHTML = `<div class="homeCardVisual projectVisual"><span class="homeCardBadge"></span><span class="homeProjectGlyph">DC</span></div><div class="homeCardBody"><strong></strong><small></small></div>`;
    node.querySelector('.homeCardBadge').textContent = autosaveProject ? 'Autosave' : 'Project';
    node.querySelector('strong').textContent = autosaveProject?.name || entry?.name || 'Untitled Project';
    const duration = durationLabel(entry?.duration || autosaveProject?.duration || autosaveProject?.media?.duration);
    node.querySelector('small').textContent = [duration, when(autosaveProject?.autosavedAt || entry?.updatedAt)].filter(Boolean).join(' · ');
    const open = async () => {
      try {
        const project = autosaveProject || await window.directorcut?.homeOpenProject?.(entry.path);
        if (!project) return;
        if (typeof loadProjectObject === 'function') loadProjectObject(project);
        overlay.classList.add('hidden');
      } catch (error) {
        window.DirectorCutEditorToast?.(error.message || 'Could not open project');
      }
    };
    node.onclick = open;
    node.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
    return node;
  }

  async function refresh() {
    let history = { projects:[], exports:[] };
    let autosave = null;
    try {
      if (window.directorcut?.homeRecent) history = await window.directorcut.homeRecent() || history;
      if (window.directorcut?.readAutosave) autosave = await window.directorcut.readAutosave();
    } catch (_) {}

    editedGrid.innerHTML = '';
    const exports = Array.isArray(history.exports) ? history.exports.slice(0, 8) : [];
    if (exports.length) exports.forEach(item => editedGrid.appendChild(exportCard(item)));
    else editedGrid.appendChild(emptyCard('No edited videos yet', 'Your exports will appear here after you finish a video.'));

    projectsGrid.innerHTML = '';
    if (autosave?.autosavedAt) projectsGrid.appendChild(projectCard(null, autosave));
    const projects = Array.isArray(history.projects) ? history.projects.slice(0, autosave?.autosavedAt ? 7 : 8) : [];
    projects.forEach(item => projectsGrid.appendChild(projectCard(item)));
    if (!autosave?.autosavedAt && !projects.length) projectsGrid.appendChild(emptyCard('No saved projects yet', 'Save a project and it will appear here for one-click access.'));
  }

  function syncHomeMode() {
    const home = !overlay.classList.contains('hidden');
    document.body.classList.toggle('homeMode', home);
    if (home) refresh();
  }

  browseProject?.addEventListener('click', () => document.querySelector('#openProject')?.click());
  new MutationObserver(syncHomeMode).observe(overlay, { attributes:true, attributeFilter:['class'] });
  window.addEventListener('focus', () => { if (document.body.classList.contains('homeMode')) refresh(); });

  syncHomeMode();
})();
