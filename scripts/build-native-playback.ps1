param([switch]$Clean)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root "build"

function Find-GStreamerRoot {
  $candidates = @(
    $env:GSTREAMER_1_0_ROOT_MSVC_X86_64,
    $env:GSTREAMER_1_0_ROOT_X86_64,
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs\gstreamer\1.0\msvc_x86_64" }),
    $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles "gstreamer\1.0\msvc_x86_64" }),
    "C:\gstreamer\1.0\msvc_x86_64"
  ) | Where-Object { $_ -and (Test-Path $_) }
  return $candidates | Select-Object -First 1
}

if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
  Write-Host "CMake is required for native timeline playback." -ForegroundColor Yellow
  Write-Host "Install it with: winget install Kitware.CMake"
  exit 1
}

$gstRoot = Find-GStreamerRoot
if (-not $gstRoot) {
  Write-Host "GStreamer MSVC x86_64 SDK was not found." -ForegroundColor Yellow
  Write-Host "Install BOTH the GStreamer runtime and development packages (MSVC 64-bit), then run this script again."
  Write-Host "DirectorCut will continue using the Chromium source preview until the native helper is built."
  exit 2
}

$gstBin = Join-Path $gstRoot "bin"
$gstPkg = Join-Path $gstRoot "lib\pkgconfig"
$env:PATH = "$gstBin;$env:PATH"
$env:PKG_CONFIG_PATH = if ($env:PKG_CONFIG_PATH) { "$gstPkg;$env:PKG_CONFIG_PATH" } else { $gstPkg }
$env:GSTREAMER_1_0_ROOT_MSVC_X86_64 = $gstRoot

if ($Clean -and (Test-Path $build)) { Remove-Item $build -Recurse -Force }

Write-Host "Building DirectorCut native Program Monitor" -ForegroundColor Cyan
Write-Host "GStreamer: $gstRoot"

cmake -S $root -B $build -DDIRECTORCUT_BUILD_QT_UI=OFF -DDIRECTORCUT_BUILD_TESTS=ON -DDIRECTORCUT_BUILD_GSTREAMER=ON
cmake --build $build --config Release --target directorcut_program_monitor

$candidates = @(
  (Join-Path $build "directorcut_program_monitor.exe"),
  (Join-Path $build "Release\directorcut_program_monitor.exe")
)
$helper = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $helper) { throw "Build completed but directorcut_program_monitor.exe was not found." }

Write-Host "Native Program Monitor ready:" -ForegroundColor Green
Write-Host $helper
Write-Host "Restart DirectorCut. Settings > Playback should report native GES timeline preview ready."
