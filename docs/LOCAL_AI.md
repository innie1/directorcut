# Local AI setup

DirectorCut is local-first. Paid APIs are not required.

## Speech / subtitles

Install the optional local speech stack:

```powershell
python -m pip install -r requirements-ai.txt
```

Then use **Transcribe locally** inside DirectorCut. The first use of a named Whisper model can download model weights; later runs can use the local cache.

## Director language model

The desktop app looks for an OpenAI-compatible local endpoint at:

`http://127.0.0.1:8080/v1/chat/completions`

A straightforward option is `llama-server` from llama.cpp. Example:

```text
llama-server -m C:\models\director-model.gguf --port 8080 -c 8192
```

You can override the endpoint and model label before starting the app:

```powershell
$env:DIRECTORCUT_LLM_URL="http://127.0.0.1:8080/v1/chat/completions"
$env:DIRECTORCUT_LLM_MODEL="local-model"
.\scripts\run-windows.ps1
```

If no local LLM is running, DirectorCut remains usable and falls back to deterministic editing guidance. Timeline operations, FFmpeg export, projects, and Whisper do not depend on the LLM.
