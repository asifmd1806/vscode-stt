import * as vscode from 'vscode';
import * as fs from 'fs';
import OpenAI from 'openai'; // Re-use OpenAI library for compatible API
import { TranscriptionService } from './transcriptionService';
import { getGroqConfig, GroqConfig } from '../config/settings'; // Import config getter
import { logInfo, logWarn, logError, showWarn, showError } from '../utils/logger';
import { eventManager } from '../events/eventManager';
import { EventType } from '../events/events';

export class GroqWhisperTranscriptionService implements TranscriptionService {
    private client: OpenAI | null = null;
    private config: GroqConfig = getGroqConfig(); // Initialize with current config
    private readonly groqApiBaseUrl = "https://api.groq.com/openai/v1"; // Groq's OpenAI-compatible endpoint

    constructor() {
        this.initializeClient(); // Initialize based on initial config
        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('speech-to-text-stt.groq')) {
                logInfo("[GroqWhisperService] Configuration change detected.");
                this.handleConfigurationChange();
            }
        });
    }

    private handleConfigurationChange(): void {
         const oldApiKey = this.config.apiKey;
        this.config = getGroqConfig(); // Reload config
        logInfo(`[GroqWhisperService] Config reloaded. API Key ${this.config.apiKey ? 'Present' : 'Missing'}`);
        
        if (this.config.apiKey !== oldApiKey) {
            logInfo("[GroqWhisperService] API key changed, re-initializing client...");
            this.initializeClient();
        }
    }

    private initializeClient(): void {
        if (!this.config.apiKey) {
            logWarn("[GroqWhisperService] API key missing, client cannot be initialized.");
            this.client = null;
            return;
        }
        try {
            this.client = new OpenAI({
                apiKey: this.config.apiKey,
                baseURL: this.groqApiBaseUrl,
            });
            logInfo(`[GroqWhisperService] Client initialized/updated for Groq endpoint: ${this.groqApiBaseUrl}`);
        } catch (error: any) {
            this.client = null;
            showError(`Failed to initialize client for Groq: ${error.message}`, error);
            logError('[GroqWhisperService] Client initialization error:', error);
            eventManager.emit(EventType.ExtensionError, {
                error,
                message: 'Failed to initialize client for Groq',
                source: 'GroqWhisperTranscriptionService.initializeClient'
            });
        }
    }

    public isClientAvailable(): boolean {
        return !!this.client;
    }

    public ensureProviderConfiguration(): boolean {
        if (!this.config.apiKey) {
            showError('Groq API key not found. Please set it in the settings (speech-to-text-stt.groq.apiKey).');
            vscode.commands.executeCommand('workbench.action.openSettings', 'speech-to-text-stt.groq.apiKey');
            return false;
        }
        if (!this.client) {
            logWarn("[GroqWhisperService] Client not initialized, attempting re-initialization...");
            this.initializeClient();
            if (!this.client) {
                showError('Groq client could not be initialized. Check API key or logs.');
                return false;
            }
        }
        return true;
    }

    async transcribeFile(audioFilePath: string): Promise<string | null> {
        logInfo(`[GroqWhisperService] transcribeFile called for path: ${audioFilePath}`);

        if (!this.ensureProviderConfiguration() || !this.client) {
            logError("[GroqWhisperService] Transcription aborted: Provider not configured or client failed.");
            return null;
        }

        try {
            await fs.promises.access(audioFilePath, fs.constants.R_OK);
        } catch (accessError: any) {
            showError(`Cannot access temporary audio file: ${accessError.message}`, accessError);
            logError(`[GroqWhisperService] Failed to access temp audio file ${audioFilePath}:`, accessError);
            eventManager.emit(EventType.ExtensionError, {
                error: accessError,
                message: 'Failed to access temporary audio file',
                source: 'GroqWhisperTranscriptionService.transcribeFile (accessCheck)'
            });
            return null;
        }

        logInfo(`[GroqWhisperService] Attempting transcription via Groq (Model: ${this.config.modelId})...`);

        try {
            const fileReadStream = fs.createReadStream(audioFilePath);

            const response = await this.client.audio.transcriptions.create({
                file: fileReadStream,
                model: this.config.modelId, // Already has default from getter
                language: this.config.language || undefined,
                prompt: this.config.prompt || undefined,
                temperature: this.config.temperature ?? 0, 
                response_format: 'text' 
            });

            if (typeof response === 'string') {
                logInfo("[GroqWhisperService] Transcription successful.");
                return response.trim();
            } else {
                logError("[GroqWhisperService] Unexpected response format from Groq API:", response);
                showError("Transcription failed: Unexpected response format from Groq.");
                return null;
            }

        } catch (error: any) {
            let errorMsg = "Groq transcription failed.";
            if (error.response?.data?.error?.message) {
                errorMsg = `Groq API Error: ${error.response.data.error.message}`;
            } else if (error.message) {
                 errorMsg += ` Error: ${error.message}`;
            }
            showError(errorMsg, error);
            logError('[GroqWhisperService] Transcription error:', error);
            eventManager.emit(EventType.ExtensionError, {
                error,
                message: errorMsg, // errorMsg already contains details
                source: 'GroqWhisperTranscriptionService.transcribeFile'
            });
            return null;
        }
    }
} 