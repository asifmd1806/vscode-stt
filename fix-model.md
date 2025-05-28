# Fix for Single Word Transcription Issue

## Problem
The `gpt-4o-transcribe` model has known issues with truncating transcriptions and dropping words, especially for longer recordings (10-15 seconds). This is a known issue reported by many users in the OpenAI community.

## Solution
Change your OpenAI model from `gpt-4o-transcribe` to `whisper-1`:

### Option 1: Via VS Code Settings UI
1. Open VS Code Settings (`Cmd+,`)
2. Search for "Speech To Text STT"
3. Find "OpenAI: Model Id"
4. Change from `gpt-4o-transcribe` to `whisper-1`

### Option 2: Via Settings JSON
1. Open VS Code Settings JSON (`Cmd+Shift+P` → "Preferences: Open Settings (JSON)")
2. Find the line with `"speech-to-text-stt.openai"` 
3. Change `"modelId": "gpt-4o-transcribe"` to `"modelId": "whisper-1"`

### Option 3: Direct Edit
Edit your settings file at:
`~/Library/Application Support/Cursor/User/settings.json`

Change:
```json
"speech-to-text-stt.openai": {
  "modelId": "gpt-4o-transcribe",
  "apiKey": "your-api-key"
}
```

To:
```json
"speech-to-text-stt.openai": {
  "modelId": "whisper-1", 
  "apiKey": "your-api-key"
}
```

## Why whisper-1 is better
- More reliable for longer recordings
- Doesn't truncate transcriptions
- Faster processing
- Better accuracy for continuous speech
- No word dropping issues

The `gpt-4o-transcribe` model is newer but has significant issues with:
- Truncating recordings after ~10 minutes
- Dropping words at beginning/end of recordings
- Generating nonsense for some audio files
- Higher latency

## Test the fix
1. Change the model setting
2. Restart VS Code or reload the extension
3. Try recording for 10-15 seconds again
4. You should now get the full transcription 