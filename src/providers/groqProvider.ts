import * as vscode from 'vscode';
import OpenAI from 'openai';
import { BaseTranscriptionProvider } from './baseProvider';
import { getGroqConfig, GroqConfig } from '../config/settings';
import { logInfo, logWarn, logError, showError } from '../utils/logger';
import path from 'path';

interface GroqTranscriptionResponse {
    text: string;
}

export class GroqProvider extends BaseTranscriptionProvider {
    protected config: GroqConfig;
    private readonly groqApiBaseUrl = "https://api.groq.com/openai/v1";
    protected client: OpenAI | null = null;

    constructor(outputChannel: vscode.OutputChannel) {
        super(outputChannel);
        this.config = getGroqConfig();
        this.initializeClient();
        
        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('speech-to-text-stt.groq')) {
                logInfo("[GroqProvider] Configuration change detected.");
                this.handleConfigurationChange();
            }
        });
    }

    private handleConfigurationChange(): void {
        const oldApiKey = this.config.apiKey;
        this.config = getGroqConfig();
        logInfo(`[GroqProvider] Config reloaded. API Key ${this.config.apiKey ? 'Present' : 'Missing'}`);
        
        if (this.config.apiKey !== oldApiKey) {
            logInfo("[GroqProvider] API key changed, re-initializing client...");
            this.initializeClient();
        }
    }

    private validateConfig(): boolean {
        if (!this.config.apiKey || this.config.apiKey.trim() === '') {
            logWarn("[GroqProvider] API key is missing or empty");
            return false;
        }
        
        if (!this.config.modelId || this.config.modelId.trim() === '') {
            logWarn("[GroqProvider] Model ID is missing or empty");
            return false;
        }
        
        return true;
    }

    private initializeClient(): void {
        if (!this.validateConfig()) {
            logWarn("[GroqProvider] Invalid configuration, client cannot be initialized.");
            this.client = null;
            return;
        }
        
        try {
            this.client = new OpenAI({
                apiKey: this.config.apiKey,
                baseURL: this.groqApiBaseUrl,
            });
            logInfo(`[GroqProvider] Client initialized successfully for Groq endpoint: ${this.groqApiBaseUrl}`);
        } catch (error: any) {
            this.client = null;
            showError(`Failed to initialize Groq client: ${error.message}`, error);
            logError('[GroqProvider] Client initialization error:', error);
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
            prompt: 'Enter your Groq API key',
            placeHolder: 'gsk-...',
            ignoreFocusOut: true,
            password: true
        });

        if (!apiKey || apiKey.trim() === '') {
            return false;
        }

        // Update configuration and reinitialize
        const config = vscode.workspace.getConfiguration('speech-to-text-stt.groq');
        await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
        
        // Reload config and reinitialize client
        this.config = getGroqConfig();
        this.initializeClient();
        
        return this.validateConfig();
    }

    async transcribeFileInternal(filePath: string): Promise<string> {
        if (!this.client) {
            throw new Error('Groq client not initialized');
        }

        if (!this.validateConfig()) {
            throw new Error('Groq configuration is invalid');
        }

        try {
            const audioFile = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            const formData = new FormData();
            formData.append('file', new Blob([audioFile]), path.basename(filePath));
            formData.append('model', this.config.modelId);
            
            // Add optional parameters if they exist
            if (this.config.language) {
                formData.append('language', this.config.language);
            }
            if (this.config.prompt) {
                formData.append('prompt', this.config.prompt);
            }
            if (this.config.temperature !== undefined) {
                formData.append('temperature', this.config.temperature.toString());
            }

            const response = await fetch(`${this.groqApiBaseUrl}/audio/transcriptions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                },
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Groq API error: ${response.status} ${response.statusText}: ${errorText}`);
            }

            const result = await response.json() as GroqTranscriptionResponse;
            return result.text;
        } catch (error) {
            logError('[GroqProvider] Transcription error:', error);
            throw error;
        }
    }
} 