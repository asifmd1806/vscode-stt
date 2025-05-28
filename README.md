# Speech To Text STT (Multi-Provider)

This extension provides a simple interface within VS Code to record audio from your microphone and transcribe it to text using various Speech-to-Text providers.

## Features

*   **Record Audio:** Capture audio directly from your selected microphone.
*   **Multi-Provider Support:** Choose between:
    *   ElevenLabs
    *   OpenAI (Whisper)
    *   Groq (Whisper models)
    *   Google Cloud Speech-to-Text
*   **Transcription:** Convert recorded audio to text using your chosen provider.
*   **History:** View a history of your transcriptions within the VS Code sidebar.
*   **Actions:**
    *   Copy transcription text to clipboard.
    *   Clear transcription history.
    *   (Optional) Automatically copy transcription to clipboard.
    *   (Optional) Automatically insert transcription into the active editor.
    *   View saved recordings.
*   **Status Bar Integration:** Start/stop recording and see the current status directly from the status bar.
*   **Output Channel:** View detailed logs and messages in the "Speech To Text STT" output channel.

## Requirements

* **FFmpeg is required** for audio recording from your microphone. This extension uses FFmpeg to capture audio input.

### Installing FFmpeg

The extension will automatically search for FFmpeg in common installation locations. If not found, you'll need to install it manually:

* **macOS**: 
  ```
  brew install ffmpeg
  ```
  If you don't have Homebrew, install it from [brew.sh](https://brew.sh/)

* **Windows**: 
  * Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to your PATH, or
  * Install via [Chocolatey](https://chocolatey.org/): `choco install ffmpeg`

* **Ubuntu/Debian**: 
  ```
  sudo apt install ffmpeg
  ```

* **CentOS/RHEL**: 
  ```
  sudo yum install ffmpeg
  ```

After installing, ensure FFmpeg is available in your system PATH. You can verify by running `ffmpeg -version` in a terminal.

> **Note**: If you install FFmpeg after launching VS Code, you may need to restart VS Code for the extension to detect it.
>
> For detailed information about how this extension uses FFmpeg, detection methods, and advanced installation guidance, see the [FFmpeg Documentation](docs/FFMPEG.md).

## Configuration

Configure the extension via VS Code settings (File > Preferences > Settings, or `Cmd+,` / `Ctrl+,`). Search for "Speech To Text STT".

**Required:**

1.  **Select Provider:**
    *   `speech-to-text-stt.transcriptionProvider`: Choose your desired transcription service (`elevenlabs`, `openai`, `groq`, or `google`).

2.  **Configure Selected Provider:** You only need to configure the provider you selected above.
    *   **ElevenLabs:**
        *   `speech-to-text-stt.elevenlabs.apiKey`: Your ElevenLabs API key.
        *   *(Optional)* `speech-to-text-stt.elevenlabs.modelId`: Model ID (default: `scribe_v1`).
        *   *(Optional)* `speech-to-text-stt.elevenlabs.languageCode`: BCP-47 language code (e.g., `en`, `es`). Leave empty for auto-detect.
        *   *(Optional)* `speech-to-text-stt.elevenlabs.numSpeakers`: Number of speakers hint (1-32).
    *   **OpenAI:**
        *   `speech-to-text-stt.openai.apiKey`: Your OpenAI API key.
        *   *(Optional)* `speech-to-text-stt.openai.modelId`: Model ID (default: `whisper-1`).
        *   *(Optional)* `speech-to-text-stt.openai.language`: ISO-639-1 language code (e.g., `en`, `es`).
        *   *(Optional)* `speech-to-text-stt.openai.prompt`: Text to guide the model.
        *   *(Optional)* `speech-to-text-stt.openai.temperature`: Sampling temperature (0-1).
    *   **Groq:**
        *   `speech-to-text-stt.groq.apiKey`: Your Groq API key.
        *   *(Optional)* `speech-to-text-stt.groq.modelId`: Model ID (default: `whisper-large-v3-turbo`).
        *   *(Optional)* `speech-to-text-stt.groq.language`: ISO-639-1 language code.
        *   *(Optional)* `speech-to-text-stt.groq.prompt`: Text to guide the model.
        *   *(Optional)* `speech-to-text-stt.groq.temperature`: Sampling temperature (0-1, default 0).
    *   **Google Cloud Speech-to-Text:**
        *   `speech-to-text-stt.google.credentialsPath`: Path to your Google Cloud service account credentials JSON file.
        *   `speech-to-text-stt.google.projectId`: Your Google Cloud Project ID.
        *   *(Optional)* `speech-to-text-stt.google.languageCode`: Language code (default: `en-US`).
        *   *(Optional)* `speech-to-text-stt.google.encoding`: Audio encoding (default: `WEBM_OPUS`).
        *   *(Optional)* `speech-to-text-stt.google.sampleRateHertz`: Sample rate in Hz (default: 16000).
        *   *(Optional)* `speech-to-text-stt.google.model`: Speech model (default: `chirp`).
        *   *(Optional)* `speech-to-text-stt.google.alternativeLanguageCodes`: Array of alternative language codes.

**General Options:**

*   `speech-to-text-stt.copyToClipboardAfterTranscription`: Automatically copy transcription to clipboard (default: `true`).
*   `speech-to-text-stt.insertIntoEditorAfterTranscription`: Automatically insert transcription into the active editor (default: `false`).
*   `speech-to-text-stt.enableSoundNotification`: Play a sound notification when transcription is completed (default: `true`).

## Usage

1.  **Configure:** Set your desired provider and its API key in the VS Code settings.
2.  **Open the View:** Click the "Speech To Text STT" icon in the activity bar (default icon may vary).
3.  **Select Microphone (Optional):** Click "⚙️ Select Microphone..." in the view to choose a specific input device if needed.
4.  **Start Recording:** Click "▶️ Start Recording" in the view or the `$(record) STT: Idle` item in the status bar.
5.  **Stop & Transcribe:** Click "⏹️ Stop Recording & Transcribe" in the view or the `$(debug-pause) STT: Recording...` item in the status bar.
6.  **View History:** Transcriptions appear in the view's history section.
7.  **Copy/Clear:** Use the icons or context menus in the history view to copy text or clear the history.
8.  **View Saved Recordings:** Access previously saved recordings.

## Contributing

Contributions, issues, and feature requests are welcome. Please check the [GitHub repository](https://github.com/asifmd1806/vscode-stt-extension).

## License

[MIT](LICENSE.txt)