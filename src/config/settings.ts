import * as vscode from 'vscode';

// --- Type Definitions for Configuration Structures ---

export interface ElevenLabsConfig {
    apiKey?: string;
    modelId: string; // Has default
    languageCode?: string;
    numSpeakers?: number;
}

export interface OpenAIConfig {
    apiKey?: string;
    modelId: string; // Has default
    language?: string;
    prompt?: string;
    temperature?: number;
}

export interface GroqConfig {
    apiKey?: string;
    modelId: string; // Has default
    language?: string;
    prompt?: string;
    temperature?: number;
}

export type TranscriptionProvider = 'elevenlabs' | 'openai' | 'groq';

// --- Helper Function to Get Config Section ---

function getConfigSection(section: string): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(`speech-to-text-stt.${section}`);
}

// --- Exported Functions to Retrieve Settings ---

export function getTranscriptionProvider(): TranscriptionProvider {
    const config = vscode.workspace.getConfiguration('speech-to-text-stt');
    // Default to 'elevenlabs' if not set or invalid
    return config.get<TranscriptionProvider>('transcriptionProvider') || 'elevenlabs';
}

export function getElevenLabsConfig(): ElevenLabsConfig {
    const config = getConfigSection('elevenlabs');
    return {
        apiKey: config.get<string>('apiKey'),
        modelId: config.get<string>('modelId') || 'eleven_multilingual_v2',
        languageCode: config.get<string>('languageCode'),
        numSpeakers: config.get<number>('numSpeakers'),
    };
}

export function getOpenAIConfig(): OpenAIConfig {
    const config = getConfigSection('openai');
    return {
        apiKey: config.get<string>('apiKey'),
        modelId: config.get<string>('modelId') || 'whisper-1',
        language: config.get<string>('language'),
        prompt: config.get<string>('prompt'),
        temperature: config.get<number>('temperature'),
    };
}

export function getGroqConfig(): GroqConfig {
    const config = getConfigSection('groq');
    return {
        apiKey: config.get<string>('apiKey'),
        modelId: config.get<string>('modelId') || 'whisper-large-v3-turbo',
        language: config.get<string>('language'),
        prompt: config.get<string>('prompt'),
        temperature: config.get<number>('temperature'),
    };
}

/**
 * Gets a general boolean setting from the root configuration.
 * @param key The setting key ('copyToClipboardAfterTranscription' or 'insertIntoEditorAfterTranscription').
 * @returns The boolean value of the setting, or its default.
 */
export function getGeneralSetting(key: 'copyToClipboardAfterTranscription' | 'insertIntoEditorAfterTranscription'): boolean {
     const config = vscode.workspace.getConfiguration('speech-to-text-stt');
     // Provide default values matching package.json
     const defaults = {
         copyToClipboardAfterTranscription: true,
         insertIntoEditorAfterTranscription: false,
     };
     return config.get<boolean>(key) ?? defaults[key];
}

// --- Exported Functions to Update Settings ---

/**
 * Updates a specific setting within the extension's configuration scope.
 * @param section The sub-section (e.g., 'elevenlabs', 'openai') or null for root settings.
 * @param key The specific setting key within the section.
 * @param value The value to set.
 * @param target The configuration target (Global or Workspace).
 */
async function updateSetting(section: string | null, key: string, value: any, target: vscode.ConfigurationTarget): Promise<void> {
    const configKey = section ? `speech-to-text-stt.${section}.${key}` : `speech-to-text-stt.${key}`;
    try {
        await vscode.workspace.getConfiguration().update(configKey, value, target);
        console.log(`[Settings] Updated '${configKey}' in ${target === vscode.ConfigurationTarget.Global ? 'Global' : 'Workspace'} settings.`);
    } catch (error) {
        console.error(`[Settings] Failed to update setting '${configKey}':`, error);
        vscode.window.showErrorMessage(`Failed to save setting ${key}.`);
    }
}

/**
 * Sets the main transcription provider.
 * @param provider The provider to set.
 * @param target The scope to save the setting to (default: Global).
 */
export async function setTranscriptionProvider(provider: TranscriptionProvider, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
    await updateSetting(null, 'transcriptionProvider', provider, target);
}

/**
 * Sets the API key for a specific provider.
 * @param provider The provider ('elevenlabs', 'openai', 'groq').
 * @param apiKey The API key string.
 * @param target The scope to save the setting to (default: Global).
 */
export async function setApiKey(provider: TranscriptionProvider, apiKey: string, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
    if (provider === 'elevenlabs' || provider === 'openai' || provider === 'groq') {
        await updateSetting(provider, 'apiKey', apiKey, target);
    } else {
        console.error(`[Settings] Attempted to set API key for unknown provider: ${provider}`);
        vscode.window.showErrorMessage(`Cannot set API key for unknown provider: ${provider}`);
    }
}

