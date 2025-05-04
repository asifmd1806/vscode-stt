import * as vscode from 'vscode';
import * as fs from 'fs';
import OpenAI from 'openai';
import { TranscriptionService } from './transcriptionService';
import { getOpenAIConfig, OpenAIConfig } from '../config/settings'; 
import { logInfo, logWarn, logError, showWarn, showError } from '../utils/logger';

export class OpenAIWhisperTranscriptionService implements TranscriptionService {
    private client: OpenAI | null = null;
    private config: OpenAIConfig = getOpenAIConfig(); // Initialize with current config

    constructor() {
        this.initializeClient(); // Initialize based on initial config
        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('speech-to-text-stt.openai')) {
                logInfo("[OpenAIWhisperService] Configuration change detected.");
                this.handleConfigurationChange();
            }
        });
    }

    private handleConfigurationChange(): void {
        const oldApiKey = this.config.apiKey;
        this.config = getOpenAIConfig(); // Reload config
        logInfo(`[OpenAIWhisperService] Config reloaded. API Key ${this.config.apiKey ? 'Present' : 'Missing'}`);
        
        if (this.config.apiKey !== oldApiKey) {
            logInfo("[OpenAIWhisperService] API key changed, re-initializing client...");
            this.initializeClient();
        }
    }
    
    private initializeClient(): void {
        if (!this.config.apiKey) {
            logWarn("[OpenAIWhisperService] API key missing, client cannot be initialized.");
            this.client = null;
            return;
        }
        try {
            this.client = new OpenAI({ apiKey: this.config.apiKey });
            logInfo("[OpenAIWhisperService] OpenAI client initialized/updated successfully.");
        } catch (error: any) {
            this.client = null;
            showError(`Failed to initialize OpenAI client: ${error.message}`, error);
            logError('[OpenAIWhisperService] Client initialization error:', error);
        }
    }

    public isClientAvailable(): boolean {
        return !!this.client;
    }

    public ensureProviderConfiguration(): boolean {
        if (!this.config.apiKey) {
            showError('OpenAI API key not found. Please set it in the settings (speech-to-text-stt.openai.apiKey).');
            vscode.commands.executeCommand('workbench.action.openSettings', 'speech-to-text-stt.openai.apiKey');
            return false;
        }
        if (!this.client) {
            logWarn("[OpenAIWhisperService] Client not initialized, attempting re-initialization...");
            this.initializeClient();
            if (!this.client) {
                showError('OpenAI client could not be initialized. Check API key or logs.');
                return false;
            }
        }
        return true;
    }

    async transcribeFile(audioFilePath: string): Promise<string | null> {
        logInfo(`[OpenAIWhisperService] transcribeFile called for path: ${audioFilePath}`);

        if (!this.ensureProviderConfiguration() || !this.client) {
            logError("[OpenAIWhisperService] Transcription aborted: Provider not configured or client failed.");
            return null;
        }

        try {
            await fs.promises.access(audioFilePath, fs.constants.R_OK);
        } catch (accessError: any) {
            showError(`Cannot access temporary audio file: ${accessError.message}`, accessError);
            logError(`[OpenAIWhisperService] Failed to access temp audio file ${audioFilePath}:`, accessError);
            return null;
        }

        logInfo(`[OpenAIWhisperService] Attempting transcription (Model: ${this.config.modelId})...`);

        try {
            const fileReadStream = fs.createReadStream(audioFilePath);

            const response = await this.client.audio.transcriptions.create({
                file: fileReadStream,
                model: this.config.modelId, // Already has default from getter
                language: this.config.language || undefined,
                prompt: this.config.prompt || undefined,
                temperature: this.config.temperature,
                response_format: 'text'
            });

            if (typeof response === 'string') {
                logInfo("[OpenAIWhisperService] Transcription successful.");
                return response.trim();
            } else {
                logError("[OpenAIWhisperService] Unexpected response format:", response);
                showError("Transcription failed: Unexpected response format from OpenAI.");
                return null;
            }

        } catch (error: any) {
             let errorMsg = "OpenAI transcription failed.";
            if (error.response?.data?.error?.message) {
                errorMsg = `OpenAI API Error: ${error.response.data.error.message}`;
            } else if (error.message) {
                 errorMsg += ` Error: ${error.message}`;
            }
            showError(errorMsg, error);
            logError('[OpenAIWhisperService] Transcription error:', error);
            return null;
        }
    }
} 