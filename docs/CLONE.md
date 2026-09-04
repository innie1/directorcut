# Clone and run

Because this repository was initially created with `main11` as its default branch, the tested source currently lives there.

## Windows

```powershell
git clone --branch main11 https://github.com/innie1/directorcut.git
cd directorcut
.\scripts\setup-windows.ps1
.\scripts\run-windows.ps1
```

Optional local Whisper:

```powershell
.\scripts\setup-windows.ps1 -InstallAI
```

## Linux

```bash
git clone --branch main11 https://github.com/innie1/directorcut.git
cd directorcut
./scripts/setup-linux.sh
./scripts/run-linux.sh
```
