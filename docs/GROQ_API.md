# How to Get a Groq API Key

This guide explains how to obtain an API key from Groq for use with the Speech-to-Text STT extension's Groq Whisper transcription provider.

## Step 1: Create a Groq Account

1. Visit the [Groq Cloud website](https://console.groq.com/) and click on **Create Account** or **Login**.
2. You can sign up using your Google account, GitHub account, or email address.
3. Complete the registration process by providing the required information.
4. Verify your email address if required.

## Step 2: Navigate to API Key Settings

1. Log in to your Groq account at [console.groq.com](https://console.groq.com/).
2. Click on **API Keys** in the left sidebar navigation menu.

## Step 3: Generate Your API Key

1. On the API Keys page, click on the **Create API Key** button.
2. Optionally, give your API key a name or description (e.g., "VS Code Speech-to-Text").
3. Select the appropriate scope or permissions for your API key if prompted.
4. Click **Create**.
5. A new API key will be generated and displayed. **Important**: Copy this key immediately and store it in a secure location. For security reasons, Groq will only show the key once, and you won't be able to view it again.

## Step 4: Configure the Speech-to-Text STT Extension

1. Open VS Code and access the settings (File > Preferences > Settings, or `Cmd+,` / `Ctrl+,`).
2. Search for "Speech To Text STT".
3. Select `groq` as your `speech-to-text-stt.transcriptionProvider`.
4. Paste your copied API key into the `speech-to-text-stt.groq.apiKey` field.
5. Configure any additional Groq-specific settings as needed:
   - `speech-to-text-stt.groq.modelId`: The Groq Whisper model ID (default: `whisper-large-v3-turbo`).
   - `speech-to-text-stt.groq.language`: Optional ISO-639-1 language code.
   - `speech-to-text-stt.groq.prompt`: Optional text to guide the model.
   - `speech-to-text-stt.groq.temperature`: Optional sampling temperature (0-1).

## API Key Security

- Your API key grants access to your Groq account and billing. Treat it like a password.
- The extension stores your API key securely within VS Code's built-in secrets storage.
- Never share your API key in public repositories, client-side code, or insecure channels.
- If you suspect your API key has been compromised, immediately delete it and create a new one.

## Usage Limits and Pricing

- Using the Groq API may incur costs based on your usage.
- Check the [Groq Pricing Page](https://console.groq.com/docs/pricing) for current pricing information.
- Be aware of any usage limits associated with your account type.
- Monitor your usage to avoid unexpected charges.

## Supported Whisper Models

Groq provides several Whisper models for speech-to-text conversion:

- `whisper-large-v3-turbo`: A fine-tuned version of a pruned Whisper Large V3 for fast, multilingual transcription tasks.
- `distil-whisper-large-v3-en`: A distilled version designed for faster, lower-cost English speech recognition.
- `whisper-large-v3`: Provides state-of-the-art performance with high accuracy for multilingual transcription.

## Troubleshooting

If you encounter issues with your Groq API key:

1. Verify that the API key is correctly copied and pasted with no extra spaces.
2. Check that your Groq account has billing set up (if required) and sufficient credit.
3. Ensure you haven't exceeded your usage limits.
4. Verify that your account is in good standing.
5. Try generating a new API key if the current one doesn't work.

For more information, visit the [Groq Documentation](https://console.groq.com/docs/quickstart). 