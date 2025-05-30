# How to Get an OpenAI API Key

This guide explains how to obtain an API key from OpenAI for use with the Speech-to-Text STT extension's OpenAI Whisper transcription provider.

## Step 1: Create an OpenAI Account

1. Visit the [OpenAI Platform website](https://platform.openai.com/) and click on **Sign Up** if you don't already have an account.
2. Complete the registration process by providing the required information.
3. Verify your email address and phone number if required.

## Step 2: Navigate to API Key Settings

1. Log in to your OpenAI account at [platform.openai.com](https://platform.openai.com/).
2. Click on your profile icon in the top-right corner of the screen.
3. Select **View API Keys** from the dropdown menu.

## Step 3: Generate Your API Key

1. On the API Keys page, click on the **+ Create new secret key** button.
2. Optionally, give your API key a name (e.g., "VS Code Speech-to-Text").
3. Click **Create secret key**.
4. A new API key will be generated and displayed. **Important**: Copy this key immediately and store it in a secure location. For security reasons, OpenAI will only show the key once, and you won't be able to view it again.

## Step 4: Configure the Speech-to-Text STT Extension

1. Open VS Code and access the settings (File > Preferences > Settings, or `Cmd+,` / `Ctrl+,`).
2. Search for "Speech To Text STT".
3. Select `openai` as your `speech-to-text-stt.transcriptionProvider`.
4. Paste your copied API key into the `speech-to-text-stt.openai.apiKey` field.
5. Configure any additional OpenAI-specific settings as needed:
   - `speech-to-text-stt.openai.modelId`: The OpenAI Whisper model ID (default: `whisper-1`).
   - `speech-to-text-stt.openai.language`: Optional ISO-639-1 language code.
   - `speech-to-text-stt.openai.prompt`: Optional text to guide the model.
   - `speech-to-text-stt.openai.temperature`: Optional sampling temperature (0-1).

## API Key Security

- Your API key grants access to your OpenAI account and billing. Treat it like a password.
- The extension stores your API key securely within VS Code's built-in secrets storage.
- Never share your API key in public repositories, client-side code, or insecure channels.
- If you suspect your API key has been compromised, immediately delete it and create a new one.

## Usage Limits and Pricing

- Using the OpenAI API incurs costs based on your usage.
- Check the [OpenAI Pricing Page](https://openai.com/pricing) for current pricing information.
- By default, new accounts have a usage limit. You can view and request an increase to this limit in your account settings.
- Monitor your usage in the [OpenAI Dashboard](https://platform.openai.com/usage) to avoid unexpected charges.

## Troubleshooting

If you encounter issues with your OpenAI API key:

1. Verify that the API key is correctly copied and pasted with no extra spaces.
2. Check that your OpenAI account has billing set up and sufficient credit.
3. Ensure you haven't exceeded your usage limits.
4. Verify that your account is in good standing (not suspended).
5. Try generating a new API key if the current one doesn't work.

For more information, visit the [OpenAI Documentation](https://platform.openai.com/docs/api-reference/authentication). 