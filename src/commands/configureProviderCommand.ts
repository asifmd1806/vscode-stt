import * as vscode from 'vscode';
import { TranscriptionProvider, setTranscriptionProvider, setApiKey, getElevenLabsConfig, getOpenAIConfig, getGroqConfig, getGoogleConfig } from '../config/settings';
import { logInfo, logError } from '../utils/logger';

interface ProviderInfo {
    name: string;
    displayName: string;
    requiredFields: Array<{
        key: string;
        displayName: string;
        isSecret: boolean;
        placeholder?: string;
        validation?: (value: string) => boolean;
    }>;
    optionalFields?: Array<{
        key: string;
        displayName: string;
        placeholder?: string;
    }>;
}

const PROVIDERS: Record<TranscriptionProvider, ProviderInfo> = {
    'elevenlabs': {
        name: 'elevenlabs',
        displayName: 'ElevenLabs',
        requiredFields: [
            {
                key: 'apiKey',
                displayName: 'API Key',
                isSecret: true,
                placeholder: 'Enter your ElevenLabs API key',
                validation: (value: string) => value.length > 0
            }
        ],
        optionalFields: [
            {
                key: 'modelId',
                displayName: 'Model ID',
                placeholder: 'scribe_v1 (default)'
            },
            {
                key: 'languageCode',
                displayName: 'Language Code',
                placeholder: 'en (optional)'
            }
        ]
    },
    'openai': {
        name: 'openai',
        displayName: 'OpenAI',
        requiredFields: [
            {
                key: 'apiKey',
                displayName: 'API Key',
                isSecret: true,
                placeholder: 'Enter your OpenAI API key',
                validation: (value: string) => value.length > 0
            }
        ],
        optionalFields: [
            {
                key: 'modelId',
                displayName: 'Model ID',
                placeholder: 'gpt-4o-transcribe (default)'
            },
            {
                key: 'language',
                displayName: 'Language',
                placeholder: 'en (optional)'
            }
        ]
    },
    'groq': {
        name: 'groq',
        displayName: 'Groq',
        requiredFields: [
            {
                key: 'apiKey',
                displayName: 'API Key',
                isSecret: true,
                placeholder: 'Enter your Groq API key',
                validation: (value: string) => value.length > 0
            }
        ],
        optionalFields: [
            {
                key: 'modelId',
                displayName: 'Model ID',
                placeholder: 'whisper-large-v3-turbo (default)'
            },
            {
                key: 'language',
                displayName: 'Language',
                placeholder: 'en (optional)'
            }
        ]
    },
    'google': {
        name: 'google',
        displayName: 'Google Cloud',
        requiredFields: [
            {
                key: 'credentialsPath',
                displayName: 'Service Account Credentials Path',
                isSecret: false,
                placeholder: 'Path to your Google Cloud service account JSON file',
                validation: (value: string) => value.length > 0
            },
            {
                key: 'projectId',
                displayName: 'Project ID',
                isSecret: false,
                placeholder: 'Your Google Cloud project ID',
                validation: (value: string) => value.length > 0
            }
        ],
        optionalFields: [
            {
                key: 'languageCode',
                displayName: 'Language Code',
                placeholder: 'en-US (default)'
            }
        ]
    }
};

export async function configureProviderCommand(context: vscode.ExtensionContext, currentProvider?: TranscriptionProvider): Promise<boolean> {
    try {
        // Step 1: Select provider
        const providerItems = Object.entries(PROVIDERS).map(([key, info]) => ({
            label: info.displayName,
            description: key === currentProvider ? '(Current)' : '',
            detail: getProviderDescription(key as TranscriptionProvider),
            provider: key as TranscriptionProvider
        }));

        const selectedProviderItem = await vscode.window.showQuickPick(providerItems, {
            placeHolder: 'Select a transcription provider',
            title: 'Configure Speech-to-Text Provider'
        });

        if (!selectedProviderItem) {
            return false;
        }

        const selectedProvider = selectedProviderItem.provider;
        const providerInfo = PROVIDERS[selectedProvider];

        // Step 2: Check if provider is already configured
        const isConfigured = await checkProviderConfiguration(selectedProvider);
        
        if (isConfigured) {
            const action = await vscode.window.showQuickPick([
                { label: 'Update Configuration', value: 'update' },
                { label: 'Use Existing Configuration', value: 'use' }
            ], {
                placeHolder: `${providerInfo.displayName} is already configured. What would you like to do?`
            });

            if (!action) {
                return false;
            }

            if (action.value === 'use') {
                await setTranscriptionProvider(selectedProvider);
                vscode.window.showInformationMessage(`Switched to ${providerInfo.displayName} provider`);
                return true;
            }
        }

        // Step 3: Configure required fields
        const config: Record<string, string> = {};
        
        for (const field of providerInfo.requiredFields) {
            const value = await vscode.window.showInputBox({
                prompt: field.displayName,
                placeHolder: field.placeholder,
                password: field.isSecret,
                validateInput: field.validation ? (value) => {
                    if (!field.validation!(value)) {
                        return `${field.displayName} is required`;
                    }
                    return null;
                } : undefined
            });

            if (!value) {
                vscode.window.showWarningMessage('Configuration cancelled');
                return false;
            }

            config[field.key] = value;
        }

        // Step 4: Ask about optional fields
        if (providerInfo.optionalFields && providerInfo.optionalFields.length > 0) {
            const configureOptional = await vscode.window.showQuickPick([
                { label: 'Yes', value: true },
                { label: 'No, use defaults', value: false }
            ], {
                placeHolder: 'Would you like to configure optional settings?'
            });

            if (configureOptional?.value) {
                for (const field of providerInfo.optionalFields) {
                    const value = await vscode.window.showInputBox({
                        prompt: field.displayName,
                        placeHolder: field.placeholder,
                        ignoreFocusOut: true
                    });

                    if (value) {
                        config[field.key] = value;
                    }
                }
            }
        }

        // Step 5: Save configuration
        await saveProviderConfiguration(selectedProvider, config);
        await setTranscriptionProvider(selectedProvider);

        vscode.window.showInformationMessage(`${providerInfo.displayName} configured successfully!`);
        logInfo(`[ConfigureProvider] Successfully configured ${selectedProvider}`);
        
        return true;

    } catch (error) {
        logError('[ConfigureProvider] Error configuring provider:', error);
        vscode.window.showErrorMessage(`Failed to configure provider: ${error}`);
        return false;
    }
}

async function checkProviderConfiguration(provider: TranscriptionProvider): Promise<boolean> {
    switch (provider) {
        case 'elevenlabs': {
            const config = getElevenLabsConfig();
            return !!config.apiKey;
        }
        case 'openai': {
            const config = getOpenAIConfig();
            return !!config.apiKey;
        }
        case 'groq': {
            const config = getGroqConfig();
            return !!config.apiKey;
        }
        case 'google': {
            const config = getGoogleConfig();
            return !!config.credentialsPath && !!config.projectId;
        }
        default:
            return false;
    }
}

async function saveProviderConfiguration(provider: TranscriptionProvider, config: Record<string, string>): Promise<void> {
    const target = vscode.ConfigurationTarget.Global;
    
    for (const [key, value] of Object.entries(config)) {
        if (key === 'apiKey' && (provider === 'elevenlabs' || provider === 'openai' || provider === 'groq')) {
            await setApiKey(provider, value, target);
        } else {
            const configKey = `speech-to-text-stt.${provider}.${key}`;
            await vscode.workspace.getConfiguration().update(configKey, value, target);
        }
    }
}

function getProviderDescription(provider: TranscriptionProvider): string {
    switch (provider) {
        case 'elevenlabs':
            return 'High-quality speech recognition with speaker diarization';
        case 'openai':
            return 'OpenAI Whisper-based transcription';
        case 'groq':
            return 'Fast transcription using Groq\'s optimized models';
        case 'google':
            return 'Google Cloud Speech-to-Text with advanced features';
        default:
            return '';
    }
}

export async function checkAndConfigureProvider(context: vscode.ExtensionContext): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('speech-to-text-stt');
    const currentProvider = config.get<TranscriptionProvider>('transcriptionProvider');
    
    // Check if provider is set and configured
    if (currentProvider && await checkProviderConfiguration(currentProvider)) {
        return true;
    }
    
    // Show welcome message for first-time users
    const message = currentProvider 
        ? `The ${PROVIDERS[currentProvider].displayName} provider is not fully configured. Would you like to configure it now?`
        : 'Welcome to Speech-to-Text! Please configure a transcription provider to get started.';
    
    const action = await vscode.window.showInformationMessage(
        message,
        'Configure Provider',
        'Cancel'
    );
    
    if (action === 'Configure Provider') {
        return await configureProviderCommand(context, currentProvider);
    }
    
    return false;
} 