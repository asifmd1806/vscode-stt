import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as fs from 'fs';
import { BaseTranscriptionProvider } from './baseProvider';
import { getOpenAIConfig, OpenAIConfig } from '../config/settings';
import { logInfo, logWarn, logError, showError } from '../utils/logger';

export class OpenAIProvider extends BaseTranscriptionProvider {
    protected config: OpenAIConfig;
    protected client: OpenAI | null = null;

    constructor(outputChannel: vscode.OutputChannel) {
        super(outputChannel);
        this.config = getOpenAIConfig();
        this.initializeClient();
        
        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('speech-to-text-stt.openai')) {
                logInfo("[OpenAIProvider] Configuration change detected.");
                this.handleConfigurationChange();
            }
        });
    }

    private handleConfigurationChange(): void {
        const oldApiKey = this.config.apiKey;
        this.config = getOpenAIConfig();
        logInfo(`[OpenAIProvider] Config reloaded. API Key ${this.config.apiKey ? 'Present' : 'Missing'}`);
        
        if (this.config.apiKey !== oldApiKey) {
            logInfo("[OpenAIProvider] API key changed, re-initializing client...");
            this.initializeClient();
        }
    }

    private validateConfig(): boolean {
        if (!this.config.apiKey || this.config.apiKey.trim() === '') {
            logWarn("[OpenAIProvider] API key is missing or empty");
            return false;
        }
        
        if (!this.config.modelId || this.config.modelId.trim() === '') {
            logWarn("[OpenAIProvider] Model ID is missing or empty");
            return false;
        }
        
        return true;
    }

    private initializeClient(): void {
        if (!this.validateConfig()) {
            logWarn("[OpenAIProvider] Invalid configuration, client cannot be initialized.");
            this.client = null;
            return;
        }
        
        try {
            this.client = new OpenAI({ apiKey: this.config.apiKey });
            logInfo("[OpenAIProvider] OpenAI client initialized successfully.");
        } catch (error: any) {
            this.client = null;
            showError(`Failed to initialize OpenAI client: ${error.message}`, error);
            logError('[OpenAIProvider] Client initialization error:', error);
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
            prompt: 'Enter your OpenAI API key',
            placeHolder: 'sk-...',
            ignoreFocusOut: true,
            password: true
        });

        if (!apiKey || apiKey.trim() === '') {
            return false;
        }

        // Update configuration and reinitialize
        const config = vscode.workspace.getConfiguration('speech-to-text-stt.openai');
        await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
        
        // Reload config and reinitialize client
        this.config = getOpenAIConfig();
        this.initializeClient();
        
        return this.validateConfig();
    }

    async transcribeFileInternal(filePath: string): Promise<string> {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        if (!this.validateConfig()) {
            throw new Error('OpenAI configuration is invalid');
        }

        try {
            // Create a ReadStream for the file
            const fileStream = fs.createReadStream(filePath);
            
            const transcriptionOptions: any = {
                file: fileStream,
                model: this.config.modelId,
            };

            // Add optional parameters if they exist
            if (this.config.language) {
                transcriptionOptions.language = this.config.language;
            }
            if (this.config.prompt) {
                transcriptionOptions.prompt = this.config.prompt;
            }
            if (this.config.temperature !== undefined) {
                transcriptionOptions.temperature = this.config.temperature;
            }

            const response = await this.client.audio.transcriptions.create(transcriptionOptions);
            return response.text;
        } catch (error) {
            logError('[OpenAIProvider] Transcription error:', error);
            throw error;
        }
    }
} 