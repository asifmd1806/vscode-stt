# FFmpeg Integration in Speech To Text STT

This document explains how the Speech To Text STT extension uses FFmpeg for audio recording and how the FFmpeg detection system works.

## Overview

The extension relies on [FFmpeg](https://ffmpeg.org/) for capturing audio from your microphone and processing it for transcription. FFmpeg is a powerful, cross-platform tool for handling multimedia data.

## How FFmpeg Is Used

The extension uses FFmpeg for two primary purposes:

1. **Device Detection**: Listing available audio input devices on your system
2. **Audio Recording**: Capturing audio from your selected microphone in a format suitable for transcription

The recording process works as follows:

1. FFmpeg captures audio from your microphone using appropriate input formats based on your operating system
   - macOS: Uses AVFoundation
   - Windows: Uses DirectShow
   - Linux: Uses ALSA or PulseAudio
2. The audio is processed with these parameters:
   - Sample rate: 16kHz (16000 Hz)
   - Channels: 1 (mono)
   - Encoding: 16-bit PCM (pcm_s16le)
   - Format: WAV
3. The processed audio stream is piped directly to the transcription service

## Platform-Specific Implementation

### macOS (AVFoundation)

macOS uses Apple's AVFoundation framework for audio capture. There are important format differences compared to other platforms:

- **Device listing**: `ffmpeg -f avfoundation -list_devices true -i ""`
- **Audio recording**: `ffmpeg -f avfoundation -i ":0" -ar 16000 -ac 1 ...`

Note the specific input format for audio-only recording in macOS: `:0` instead of `0:`. This is the opposite of video-only recording, which uses `0:`.

- `:0` means "record audio from device 0"
- `0:` means "record video from device 0"
- `0:1` means "record video from device 0 and audio from device 1"

### Windows (DirectShow)

Windows uses DirectShow for device access:

- **Device listing**: `ffmpeg -f dshow -list_devices true -i dummy`
- **Audio recording**: `ffmpeg -f dshow -i audio="Microphone Name" -ar 16000 -ac 1 ...`

In Windows, devices are referenced by name rather than numeric ID.

### Linux (ALSA/PulseAudio)

Linux systems typically use either ALSA or PulseAudio:

- **Device listing**: `ffmpeg -f alsa -list_devices true -i dummy`
- **Audio recording**: `ffmpeg -f alsa -i hw:0 -ar 16000 -ac 1 ...`

## FFmpeg Detection System

For the extension to work properly, it needs to locate the FFmpeg executable on your system. We've implemented a robust detection system that tries multiple approaches:

### 1. PATH-based Detection

First, the extension tries to find FFmpeg in your system's PATH environment variable:

```typescript
// Check if FFmpeg is available in PATH
const checkInPath = new Promise<string | null>((resolve) => {
    exec('which ffmpeg || where ffmpeg', (error, stdout) => {
        if (error || !stdout) {
            resolve(null);
        } else {
            resolve(stdout.trim());
        }
    });
});
```

This uses:
- `which ffmpeg` on macOS/Linux
- `where ffmpeg` on Windows

### 2. Common Installation Locations

If FFmpeg isn't found in the PATH, the extension checks common installation locations based on your operating system:

#### macOS
- `/opt/homebrew/bin/ffmpeg` (Apple Silicon Homebrew)
- `/usr/local/bin/ffmpeg` (Intel Homebrew)
- `/opt/local/bin/ffmpeg` (MacPorts)

#### Windows
- `C:\Program Files\ffmpeg\bin\ffmpeg.exe`
- `C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe`
- `%USERPROFILE%\ffmpeg\bin\ffmpeg.exe`

#### Linux
- `/usr/bin/ffmpeg`
- `/usr/local/bin/ffmpeg`
- `/opt/bin/ffmpeg`

## Troubleshooting

### Common Error Codes

- **Code 251**: Typically indicates device access issues
  - **macOS**: Check input format (use `:deviceId` not `deviceId:`)
  - **Windows**: Verify the exact device name matches
  - **All platforms**: Ensure microphone permissions are granted

- **Code 1**: General execution failure
  - Check if FFmpeg is installed and executable
  - Verify device access permissions

### ElevenLabs "Empty File" Errors

If you encounter an error message like:
```
ElevenLabs transcription failed after 3 attempts. Error: Status code: 400 Body: { "detail": { "status": "empty_file", "message": "The file you uploaded is empty or corrupted." } }
```

This typically happens when:

1. **Microphone is muted or not working**: Check that your microphone is properly connected and not muted
2. **No audio was captured**: The recording completed but no audio was detected
3. **Permissions issues**: Your system denied permission to record audio
4. **Audio stream terminated unexpectedly**: The FFmpeg process terminated before completing the recording

Troubleshooting steps:

1. **Check microphone hardware**:
   - Ensure your microphone is properly connected
   - Try using a different microphone if available
   - Check if your microphone works in other applications

2. **Check system permissions**:
   - **macOS**: System Preferences > Security & Privacy > Microphone > Ensure VSCode is allowed
   - **Windows**: Settings > Privacy > Microphone > Allow apps to access your microphone
   - **Linux**: Check PulseAudio or ALSA configurations

3. **Test FFmpeg directly**:
   - Run test recording commands as shown in the "Checking Device Access" section below
   - Verify that FFmpeg can create valid audio files from your microphone

4. **Inspect logging output**:
   - Check the extension's output panel for detailed error messages
   - Look for warnings about audio file size or validation failures

5. **Try different settings**:
   - Use a different transcription service (OpenAI or Groq) if available
   - Try changing the sample rate in the extension settings

### "Recording stopped unexpectedly"

This error often occurs when:

1. **Incorrect device format**: The most common issue on macOS is using the wrong format for audio-only recording
2. **Permission issues**: The application doesn't have permission to access the microphone
3. **Device busy**: Another application is using the microphone
4. **Format problems**: The requested audio format isn't supported by the device

### "No active recording to stop"

This happens when:
1. The recording process has already ended (possibly due to an error)
2. The extension is in an inconsistent state where it thinks a recording is active but FFmpeg has already quit

### "Maximum call stack size exceeded" or Clone Error

If you encounter errors like:
- "Maximum call stack size exceeded"
- "An object could not be cloned"
- Or endless recursion when stopping a recording

This indicates a recursion issue in the context management. The extension implements safeguards to prevent this by:

1. Clearing disposable references before calling context-setting methods
2. Using try-catch blocks to prevent cascading failures
3. Separating recording state management from disposal logic
4. Avoiding circular dependencies between action handlers

If you encounter this error, try:
1. Restarting VS Code
2. Ensuring you have the latest version of the extension
3. Checking if your microphone permissions are correctly set

### Checking Device Access

To verify your microphone works with FFmpeg:

#### macOS
```bash
# List devices
ffmpeg -f avfoundation -list_devices true -i ""

# Test recording (for 3 seconds)
ffmpeg -f avfoundation -i ":0" -t 3 test.wav
```

#### Windows
```batch
# List devices
ffmpeg -f dshow -list_devices true -i dummy

# Test recording (replace "Microphone" with your device name)
ffmpeg -f dshow -i audio="Microphone" -t 3 test.wav
```

#### Linux
```bash
# List devices
ffmpeg -f alsa -list_devices true -i dummy

# Test recording
ffmpeg -f alsa -i default -t 3 test.wav
```

## Installation Recommendations

For the best experience, we recommend installing FFmpeg in a standard location:

### macOS

**Preferred method**: Install via Homebrew
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install FFmpeg
brew install ffmpeg
```

This typically installs to:
- `/opt/homebrew/bin/ffmpeg` (Apple Silicon)
- `/usr/local/bin/ffmpeg` (Intel)

### Windows

**Option 1**: Download the pre-built binaries
1. Go to [FFmpeg.org](https://ffmpeg.org/download.html) or [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) for Windows builds
2. Download the latest release build
3. Extract to `C:\Program Files\ffmpeg`
4. Add `C:\Program Files\ffmpeg\bin` to your PATH environment variable:
   - Right-click "This PC" > Properties > Advanced system settings > Environment Variables
   - Edit the "Path" variable, add the FFmpeg bin directory

**Option 2**: Install via Chocolatey
```powershell
# Install Chocolatey if not already installed
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install FFmpeg
choco install ffmpeg
```

### Linux

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

#### CentOS/RHEL
```bash
sudo yum install epel-release
sudo yum install ffmpeg
```

#### Arch Linux
```bash
sudo pacman -S ffmpeg
```

## Saved Recordings

By default, the extension now keeps all recorded audio files instead of deleting them after transcription. This is useful for:

1. **Troubleshooting transcription issues**: If the transcription service returns errors like "empty file", you can examine the actual audio file
2. **Verifying audio quality**: Check if your microphone settings are correct by listening to the saved recordings
3. **Re-transcribing**: Save recordings that you might want to transcribe again later with different settings

### Managing Recordings

You can access your saved recordings using:
- Command Palette: `Speech To Text: View Saved Recordings`
- This opens a list of all recordings with their date and size
- Select a recording to open it with your system's default audio player
- You can also choose to open the recordings directory directly

### Recording File Format

Recordings are saved as WAV files with these specifications:
- Sample rate: 16kHz (16000 Hz)
- Channels: 1 (mono)
- Encoding: 16-bit PCM (pcm_s16le)

### Recording Location

Recordings are stored in the extension's storage area:
- **Windows**: `%APPDATA%\Code\User\globalStorage\[extensionId]\recordings\`
- **macOS**: `~/Library/Application Support/Code/User/globalStorage/[extensionId]/recordings/`
- **Linux**: `~/.config/Code/User/globalStorage/[extensionId]/recordings/`

### Troubleshooting Using Saved Recordings

If you encounter issues with transcription:
1. Open a saved recording and verify it contains actual audio
2. Check for the "empty file" error described in the troubleshooting section
3. If the file exists but is empty or corrupted, the issue may be with microphone permissions 
4. If the file contains audio but transcription fails, the issue is likely with the transcription service 