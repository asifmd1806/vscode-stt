import * as vscode from 'vscode';
import { ElevenLabsClient } from 'elevenlabs';
import * as fs from 'fs';
import { TranscriptionService } from './transcriptionService';
import { getElevenLabsConfig, ElevenLabsConfig } from '../config/settings'; 
import { logInfo, logWarn, logError, showWarn, showError } from '../utils/logger'; 

export class ElevenLabsTranscriptionService implements TranscriptionService {
    private client: ElevenLabsClient | null = null;
    private config: ElevenLabsConfig = getElevenLabsConfig(); // Initialize with current config

    constructor() {
        this.initializeClient(); // Initialize client based on initial config
        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('speech-to-text-stt.elevenlabs')) {
                logInfo("[ElevenLabsTranscriptionService] Configuration change detected.");
                this.handleConfigurationChange();
            }
        });
    }

    /** Handles config changes: reloads config and re-initializes client if API key changed. */
    private handleConfigurationChange(): void {
        const oldApiKey = this.config.apiKey;
        this.config = getElevenLabsConfig(); // Reload the configuration
        logInfo(`[ElevenLabsTranscriptionService] Config reloaded. API Key ${this.config.apiKey ? 'Present' : 'Missing'}`);
        
        // Re-initialize client only if API key actually changed
        if (this.config.apiKey !== oldApiKey) {
            logInfo("[ElevenLabsTranscriptionService] API key changed, re-initializing client...");
            this.initializeClient();
        }
    }

    private initializeClient(): void {
        if (!this.config.apiKey) {
            logWarn("[ElevenLabsTranscriptionService] API key missing, client cannot be initialized.");
            this.client = null;
            return;
        }
        try {
            this.client = new ElevenLabsClient({ apiKey: this.config.apiKey });
            logInfo("[ElevenLabsTranscriptionService] ElevenLabs client initialized/updated successfully.");
        } catch (error: any) {
            this.client = null;
            showError(`Failed to initialize ElevenLabs client: ${error.message}`, error);
            logError('[ElevenLabsTranscriptionService] Client initialization error:', error);
        }
    }

    public isClientAvailable(): boolean {
        return !!this.client;
    }

    public ensureProviderConfiguration(): boolean {
        if (!this.config.apiKey) {
            showError('ElevenLabs API key not found. Please set it in the settings (speech-to-text-stt.elevenlabs.apiKey).');
            vscode.commands.executeCommand('workbench.action.openSettings', 'speech-to-text-stt.elevenlabs.apiKey');
            return false;
        }
        if (!this.client) {
            logWarn("[ElevenLabsTranscriptionService] Client not initialized, attempting re-initialization...");
            this.initializeClient();
            if (!this.client) {
                showError('ElevenLabs client could not be initialized. Check API key or logs.');
                return false;
            }
        }
        return true;
    }

    async transcribeFile(audioFilePath: string): Promise<string | null> {
        logInfo(`[ElevenLabsTranscriptionService] transcribeFile called for path: ${audioFilePath}`);
        
        if (!this.ensureProviderConfiguration() || !this.client) {
             logError("[ElevenLabsTranscriptionService] Transcription aborted: Provider not configured or client failed.");
            return null; 
        }

        try {
            await fs.promises.access(audioFilePath, fs.constants.R_OK);
        } catch (accessError: any) {
            showError(`Cannot access temporary audio file: ${accessError.message}`, accessError);
            logError(`[ElevenLabsTranscriptionService] Failed to access temp audio file ${audioFilePath}:`, accessError);
            return null;
        }

        const modelId = this.config.modelId; // Already has default from getter
        const languageCodeApi = this.config.languageCode?.trim() === '' ? undefined : this.config.languageCode;
        let numSpeakersApi: number | undefined = undefined; 
        if (this.config.numSpeakers !== undefined && this.config.numSpeakers >= 1 && this.config.numSpeakers <= 32) {
            numSpeakersApi = this.config.numSpeakers;
        } else if (this.config.numSpeakers !== undefined) {
            logWarn(`[ElevenLabsTranscriptionService] Invalid numSpeakers setting (${this.config.numSpeakers}), letting API default.`);
        }

        logInfo(`[ElevenLabsTranscriptionService] Attempting transcription (Model: ${modelId}, Lang: ${languageCodeApi || 'auto'}, Speakers: ${numSpeakersApi || 'auto'})...`);
        
        const maxRetries = 2; 
        let attempt = 0;
        let lastError: any = null;

        while(attempt <= maxRetries) {
            attempt++;
            let fileStream: fs.ReadStream | null = null; 
            try {
                logInfo(`[ElevenLabsTranscriptionService] Transcription attempt ${attempt}/${maxRetries + 1}`);
                fileStream = fs.createReadStream(audioFilePath);
                
                await new Promise((resolve, reject) => {
                    fileStream?.on('error', (streamErr: any) => reject(new Error(`Stream error: ${streamErr.message}`)));
                    fileStream?.on('open', resolve);
                });
                
                const response = await this.client.speechToText.convert({
                    file: fileStream, 
                    model_id: modelId,
                    language_code: languageCodeApi,
                    num_speakers: numSpeakersApi, 
                    tag_audio_events: false
                });

                if (response && response.text) {
                    logInfo(`[ElevenLabsTranscriptionService] Transcription successful (attempt ${attempt})`);
                    return response.text; // Success!
                } else {
                    lastError = new Error("API returned empty or invalid response.");
                     logError(`[ElevenLabsTranscriptionService] API returned empty/invalid response (attempt ${attempt}):`, response);
                     break; // Don't retry on empty response
                }
            } catch (error: any) {
                lastError = error; 
                logWarn(`[ElevenLabsTranscriptionService] Transcription attempt ${attempt} failed:`, error.message || error);
                const statusCode = error?.response?.status;
                const isRetryable = !statusCode || (statusCode >= 500 && statusCode <= 599);
                if (isRetryable && attempt <= maxRetries) {
                    const delay = Math.pow(2, attempt - 1) * 500; 
                    logInfo(`[ElevenLabsTranscriptionService] Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    logError("[ElevenLabsTranscriptionService] Unretryable error or max retries reached.");
                    break; 
                }
            } finally {
                if (fileStream && !fileStream.destroyed) {
                    fileStream.destroy();
                }
            }
        } 

        // Handle final failure
        logError("[ElevenLabsTranscriptionService] All transcription attempts failed.");
        let errorMsg = `ElevenLabs transcription failed after ${attempt} attempts.`;
        if (lastError?.response?.data?.detail) {
            const detail = lastError.response.data.detail;
            let apiMessage = typeof detail === 'string' ? detail : detail.message;
            errorMsg = `ElevenLabs API Error: ${apiMessage || 'Unknown error'}`;
        } else if (lastError?.message) {
            errorMsg += ` Error: ${lastError.message}`;
        }
        showError(errorMsg, lastError);
        logError('[ElevenLabsTranscriptionService] Final transcription error:', lastError);
        return null;
    }
} 