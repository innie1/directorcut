param([switch]$InstallAI)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Write-Host "DirectorCut setup" -ForegroundColor Cyan

function Require-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Host "Missing: $name" -ForegroundColor Red
    Write-Host "Install with: $installHint" -ForegroundColor Yellow
    exit 1
  }
}

Require-Command node "winget install OpenJS.NodeJS.LTS"
Require-Command npm "winget install OpenJS.NodeJS.LTS"
Require-Command ffmpeg "winget install Gyan.FFmpeg"
Require-Command ffprobe "winget install Gyan.FFmpeg"
Require-Command python "winget install Python.Python.3.12"

Push-Location (Join-Path $root "desktop")
try {
  npm install
} finally { Pop-Location }

if ($InstallAI) {
  python -m pip install -r (Join-Path $root "requirements-ai.txt")
}

Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Run: .\scripts\run-windows.ps1"
if (-not $InstallAI) {
  Write-Host "For local Whisper later: .\scripts\setup-windows.ps1 -InstallAI"
}
