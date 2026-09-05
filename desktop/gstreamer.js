const fs = require('fs');
const path = require('path');
const { runProcess } = require('./media-utils');

function candidates(name, platform = process.platform, env = process.env) {
  const exe = platform === 'win32' ? `${name}.exe` : name;
  const list = [exe];
  if (platform === 'win32') {
    const roots = [
      env.GSTREAMER_1_0_ROOT_MSVC_X86_64,
      env.GSTREAMER_1_0_ROOT_X86_64,
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'gstreamer', '1.0', 'msvc_x86_64'),
      env.ProgramFiles && path.join(env.ProgramFiles, 'gstreamer', '1.0', 'msvc_x86_64'),
      'C:\\gstreamer\\1.0\\msvc_x86_64',
      'C:\\gstreamer\\1.0\\mingw_x86_64'
    ].filter(Boolean);
    for (const root of roots) list.push(path.join(root, 'bin', exe));
  }
  return [...new Set(list)];
}

function firstExistingAbsolute(name) {
  return candidates(name).find(command => path.isAbsolute(command) && fs.existsSync(command)) || null;
}

async function firstWorking(name, args = ['--version']) {
  for (const command of candidates(name)) {
    if (path.isAbsolute(command) && !fs.existsSync(command)) continue;
    try {
      const result = await runProcess(command, args);
      return { command, ...result };
    } catch (_) {}
  }
  return null;
}

async function findInstalledCommand(name, probeArgs = ['--help']) {
  // On Windows, prefer the known installation path. ges-launch 1.28.x does not
  // implement a conventional --version switch: it treats that token as timeline
  // input and exits with a parse error even though GES is installed correctly.
  const existing = firstExistingAbsolute(name);
  if (existing) return { command: existing, stdout:'', stderr:'', discoveredBy:'filesystem' };
  const working = await firstWorking(name, probeArgs);
  return working ? { ...working, discoveredBy:'probe' } : null;
}

function parseVersion(text = '') {
  const match = text.match(/GStreamer\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i) || text.match(/version\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
  return match ? match[1] : null;
}

async function detectGStreamer() {
  const launch = await firstWorking('gst-launch-1.0');
  if (!launch) return { available:false, ges:false, version:null, hardware:[], playbackBackend:'chromium' };

  const version = parseVersion(`${launch.stdout}\n${launch.stderr}`);
  const inspect = await firstWorking('gst-inspect-1.0', []);
  const registry = `${inspect?.stdout || ''}\n${inspect?.stderr || ''}`.toLowerCase();
  const checks = [
    ['d3d12', /d3d12/],
    ['d3d11', /d3d11/],
    ['vulkan', /vulkan/],
    ['nvcodec', /nvcodec|nvh264dec|nvh265dec/],
    ['qsv', /qsv|msdk/],
    ['vaapi', /vaapi/],
    ['amf', /amf/],
    ['videotoolbox', /vtdec|videotoolbox/]
  ];
  const hardware = checks.filter(([, re]) => re.test(registry)).map(([name]) => name);
  const gesLaunch = await findInstalledCommand('ges-launch-1.0', ['--help']);
  const nativeGesEnabled = process.env.DIRECTORCUT_NATIVE_GES === '1';
  const nativeGesReady = Boolean(gesLaunch && nativeGesEnabled);

  return {
    available:true,
    ges:nativeGesReady,
    version,
    gstLaunch:launch.command,
    gesLaunch:gesLaunch?.command || null,
    hardware,
    playbackBackend:'chromium',
    nativeBackendReady:nativeGesReady,
    note:gesLaunch
      ? nativeGesEnabled
        ? 'GStreamer Editing Services detected and native embedded preview is enabled.'
        : 'GStreamer Editing Services detected. DirectorCut is using the stable Chromium preview by default; set DIRECTORCUT_NATIVE_GES=1 only when testing the experimental native preview.'
      : 'GStreamer detected but GES is missing.'
  };
}

module.exports = { detectGStreamer, candidates, firstExistingAbsolute, findInstalledCommand };
