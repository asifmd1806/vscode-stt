# How to Get an ElevenLabs API Key

This guide explains how to obtain an API key from ElevenLabs for use with the Speech-to-Text STT extension's ElevenLabs transcription provider.

## Step 1: Create an ElevenLabs Account

1. Visit the [ElevenLabs website](https://elevenlabs.io/) and click on **Sign Up** if you don't already have an account.
2. Complete the registration process by providing the required information.
3. Verify your email address if required.

## Step 2: Navigate to Your API Key Settings

1. Log in to your ElevenLabs account.
2. Click on your profile name or icon in the top-right corner of the screen.
3. Select **Profile** from the dropdown menu.
4. In the left sidebar, click on **API Key**.

## Step 3: Generate or Copy Your API Key

1. On the API Key page, you'll see your existing API key or an option to generate a new one.
2. If you need to create a new key, click the **Create New API Key** button.
3. Give your API key a name if prompted (e.g., "VS Code Speech-to-Text").
4. Copy the API key to your clipboard. **Important**: Make sure to copy it immediately, as you may not be able to view the complete key again later for security reasons.

## Step 4: Configure the Speech-to-Text STT Extension

1. Open VS Code and access the settings (File > Preferences > Settings, or `Cmd+,` / `Ctrl+,`).
2. Search for "Speech To Text STT".
3. Select `elevenlabs` as your `speech-to-text-stt.transcriptionProvider`.
4. Paste your copied API key into the `speech-to-text-stt.elevenlabs.apiKey` field.
5. Configure any additional ElevenLabs-specific settings as needed:
   - `speech-to-text-stt.elevenlabs.modelId`: The ElevenLabs model ID (default: `scribe_v1`).
   - `speech-to-text-stt.elevenlabs.languageCode`: Optional BCP-47 language code.
   - `speech-to-text-stt.elevenlabs.numSpeakers`: Optional hint for the number of speakers (1-32).

## API Key Security

- Your API key is like a password - keep it confidential.
- The extension stores your API key securely within VS Code's built-in secrets storage.
- Never share your API key in public repositories or insecure channels.
- If you suspect your API key has been compromised, immediately generate a new one and revoke the old key.

## Usage Limits and Pricing

- ElevenLabs offers different tiers of service with varying usage limits.
- Check the [ElevenLabs Pricing Page](https://elevenlabs.io/pricing) for current pricing information.
- Basic (free) accounts have limited usage quotas, while paid plans offer higher limits.

## Troubleshooting

If you encounter issues with your ElevenLabs API key:

1. Verify that the API key is correctly copied and pasted with no extra spaces.
2. Check that your ElevenLabs account has sufficient credits or permissions.
3. Ensure your account is in good standing (not suspended).
4. Try generating a new API key if the current one doesn't work.

For more information, visit the [ElevenLabs Documentation](https://elevenlabs.io/docs). 