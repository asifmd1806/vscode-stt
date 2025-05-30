# How to Set Up Google Cloud Speech-to-Text

This guide explains how to set up Google Cloud Speech-to-Text for use with the Speech-to-Text STT extension's Google Cloud transcription provider.

## Step 1: Create a Google Cloud Account

1. Visit the [Google Cloud Console](https://console.cloud.google.com/) and sign in with your Google account.
2. If you're new to Google Cloud, you'll need to set up a billing account. Google Cloud offers a free tier and a $300 credit for new users.

## Step 2: Create a New Project

1. In the Google Cloud Console, click on the project dropdown at the top of the page.
2. Click on "New Project" and provide a name for your project.
3. Click "Create" to create the project.
4. Make sure your new project is selected in the project dropdown.

## Step 3: Enable the Speech-to-Text API

1. In the Google Cloud Console, use the search bar at the top and search for "Speech-to-Text API".
2. Select "Cloud Speech-to-Text API" from the results.
3. Click the "Enable" button to enable this API for your project.

## Step 4: Create Service Account Credentials

1. In the Google Cloud Console, navigate to "IAM & Admin" > "Service Accounts" from the left sidebar.
2. Click "Create Service Account" at the top of the page.
3. Enter a name for your service account (e.g., "speech-to-text-stt-extension").
4. Optionally, add a description.
5. Click "Create and Continue".
6. In the "Grant this service account access to project" section, add the "Cloud Speech-to-Text Service Agent" role.
7. Click "Continue" and then "Done".

## Step 5: Generate Service Account Key

1. On the Service Accounts page, find the service account you just created and click on the three dots (actions menu) on the right.
2. Select "Manage keys".
3. Click "Add Key" > "Create new key".
4. Select "JSON" as the key type.
5. Click "Create". A JSON key file will be downloaded to your computer.
6. **Important**: Store this file securely. It contains the credentials that grant access to your Google Cloud resources.

## Step 6: Configure the Speech-to-Text STT Extension

1. Open VS Code and access the settings (File > Preferences > Settings, or `Cmd+,` / `Ctrl+,`).
2. Search for "Speech To Text STT".
3. Select `google` as your `speech-to-text-stt.transcriptionProvider`.
4. Specify the path to your service account credentials JSON file in the `speech-to-text-stt.google.credentialsPath` field.
5. Enter your Google Cloud Project ID in the `speech-to-text-stt.google.projectId` field. You can find this in your Google Cloud Console or in the service account JSON file.
6. Configure any additional Google-specific settings as needed:
   - `speech-to-text-stt.google.languageCode`: The language code (default: `en-US`).
   - `speech-to-text-stt.google.encoding`: Audio encoding format (default: `WEBM_OPUS`).
   - `speech-to-text-stt.google.sampleRateHertz`: Sample rate in Hz (default: 16000).
   - `speech-to-text-stt.google.model`: The Google Speech model (default: `chirp`).
   - `speech-to-text-stt.google.alternativeLanguageCodes`: Optional array of alternative language codes.

## Security Considerations

- The service account JSON key file grants access to your Google Cloud resources. Keep it secure.
- Consider restricting the service account's permissions to only what's needed for Speech-to-Text.
- The extension stores the path to your credentials file, so ensure the file itself is stored in a secure location.
- Never commit service account credentials to version control systems.

## Usage Limits and Pricing

- Google Cloud Speech-to-Text offers a free tier with 60 minutes of audio processing per month.
- Beyond the free tier, you will be charged based on your usage.
- Check the [Google Cloud Speech-to-Text Pricing Page](https://cloud.google.com/speech-to-text/pricing) for current pricing information.
- Consider setting up budget alerts in Google Cloud to monitor your spending.

## Supported Features

Google Cloud Speech-to-Text offers several advanced features:

- Multiple language support
- Speaker diarization (identifying different speakers)
- Automatic punctuation
- Profanity filtering
- Word-level timestamps
- Model selection for different audio types

## Troubleshooting

If you encounter issues with Google Cloud Speech-to-Text:

1. Verify that the Speech-to-Text API is enabled for your project.
2. Check that your service account has the correct permissions.
3. Ensure the path to your credentials file is correct and the file is accessible.
4. Verify that your Google Cloud billing account is active and in good standing.
5. Check your quotas in the Google Cloud Console to ensure you haven't exceeded usage limits.

For more information, visit the [Google Cloud Speech-to-Text Documentation](https://cloud.google.com/speech-to-text/docs). 