import * as vscode from 'vscode';
import { BaseTranscriptionProvider } from './baseProvider';
import { getElevenLabsConfig, ElevenLabsConfig } from '../config/settings';
import { logInfo, logWarn, logError, showError } from '../utils/logger';

interface ElevenLabsClient {
    transcribe: (audioData: Buffer, options: any) => Promise<{ text: string }>;
}

interface ElevenLabsResponse {
    text: string;
}

export class ElevenLabsProvider extends BaseTranscriptionProvider {
    protected config: ElevenLabsConfig;
    protected client: ElevenLabsClient | null = null;

    constructor(outputChannel: vscode.OutputChannel) {
        super(outputChannel);
        this.config = getElevenLabsConfig();
        this.initializeClient();
        
        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('speech-to-text-stt.elevenlabs')) {
                logInfo("[ElevenLabsProvider] Configuration change detected.");
                this.handleConfigurationChange();
            }
        });
    }

    private handleConfigurationChange(): void {
        const oldApiKey = this.config.apiKey;
        this.config = getElevenLabsConfig();
        logInfo(`[ElevenLabsProvider] Config reloaded. API Key ${this.config.apiKey ? 'Present' : 'Missing'}`);
        
        if (this.config.apiKey !== oldApiKey) {
            logInfo("[ElevenLabsProvider] API key changed, re-initializing client...");
            this.initializeClient();
        }
    }

    private validateConfig(): boolean {
        if (!this.config.apiKey || this.config.apiKey.trim() === '') {
            logWarn("[ElevenLabsProvider] API key is missing or empty");
            return false;
        }
        
        if (!this.config.modelId || this.config.modelId.trim() === '') {
            logWarn("[ElevenLabsProvider] Model ID is missing or empty");
            return false;
        }
        
        return true;
    }

    private initializeClient(): void {
        if (!this.validateConfig()) {
            logWarn("[ElevenLabsProvider] Invalid configuration, client cannot be initialized.");
            this.client = null;
            return;
        }
        
        try {
            // Initialize ElevenLabs client with API key
            this.client = {
                transcribe: async (audioData: Buffer, options: any) => {
                    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
                        method: 'POST',
                        headers: {
                            'xi-api-key': this.config.apiKey!,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            audio_data: audioData.toString('base64'),
                            model_id: this.config.modelId,
                            language_code: this.config.languageCode,
                            num_speakers: this.config.numSpeakers,
                            ...options
                        })
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}: ${errorText}`);
                    }

                    const data = await response.json() as ElevenLabsResponse;
                    return { text: data.text };
                }
            };
            logInfo("[ElevenLabsProvider] Client initialized successfully.");
        } catch (error: any) {
            this.client = null;
            showError(`Failed to initialize ElevenLabs client: ${error.message}`, error);
            logError('[ElevenLabsProvider] Client initialization error:', error);
        }
    }

    isClientAvailable(): boolean {
        return !!this.client && this.validateConfig();
    }

    async ensureProviderConfiguration(): Promise<boolean> {
        // Check if we already have a valid configuration
        if (this.validateConfig()) {
            return true;
        }

        // Prompt for API key if missing
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your ElevenLabs API key',
            placeHolder: 'sk-...',
            ignoreFocusOut: true,
            password: true
        });

        if (!apiKey || apiKey.trim() === '') {
            return false;
        }

        // Update configuration and reinitialize
        const config = vscode.workspace.getConfiguration('speech-to-text-stt.elevenlabs');
        await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
        
        // Reload config and reinitialize client
        this.config = getElevenLabsConfig();
        this.initializeClient();
        
        return this.validateConfig();
    }

    async transcribeFileInternal(filePath: string): Promise<string> {
        if (!this.client) {
            throw new Error('ElevenLabs client not initialized');
        }

        if (!this.validateConfig()) {
            throw new Error('ElevenLabs configuration is invalid');
        }

        const audioData = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
        const response = await this.client.transcribe(Buffer.from(audioData), {});
        return response.text;
    }
} 