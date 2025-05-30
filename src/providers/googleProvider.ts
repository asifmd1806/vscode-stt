import * as vscode from 'vscode';
import { SpeechClient } from '@google-cloud/speech';
import * as fs from 'fs';
import { BaseTranscriptionProvider } from './baseProvider';
import { getGoogleConfig, GoogleConfig } from '../config/settings';
import { logInfo, logWarn, logError, showError } from '../utils/logger';

export class GoogleProvider extends BaseTranscriptionProvider {
    protected config: GoogleConfig;
    protected client: SpeechClient | null = null;

    constructor(outputChannel: vscode.OutputChannel) {
        super(outputChannel);
        this.config = getGoogleConfig();
        this.initializeClient();
        
        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('speech-to-text-stt.google')) {
                logInfo("[GoogleProvider] Configuration change detected.");
                this.handleConfigurationChange();
            }
        });
    }

    private handleConfigurationChange(): void {
        const oldCredentialsPath = this.config.credentialsPath;
        this.config = getGoogleConfig();
        logInfo(`[GoogleProvider] Config reloaded. Credentials ${this.config.credentialsPath ? 'Present' : 'Missing'}`);
        
        if (this.config.credentialsPath !== oldCredentialsPath) {
            logInfo("[GoogleProvider] Credentials path changed, re-initializing client...");
            this.initializeClient();
        }
    }

    private validateConfig(): boolean {
        if (!this.config.credentialsPath || this.config.credentialsPath.trim() === '') {
            logWarn("[GoogleProvider] Credentials path is missing or empty");
            return false;
        }
        
        // Check if credentials file exists
        try {
            if (!fs.existsSync(this.config.credentialsPath)) {
                logWarn("[GoogleProvider] Credentials file does not exist at specified path");
                return false;
            }
        } catch (error) {
            logWarn("[GoogleProvider] Error checking credentials file:", error);
            return false;
        }
        
        if (!this.config.projectId || this.config.projectId.trim() === '') {
            logWarn("[GoogleProvider] Project ID is missing or empty");
            return false;
        }
        
        return true;
    }

    private initializeClient(): void {
        if (!this.validateConfig()) {
            logWarn("[GoogleProvider] Invalid configuration, client cannot be initialized.");
            this.client = null;
            return;
        }
        
        try {
            this.client = new SpeechClient({
                keyFilename: this.config.credentialsPath,
                projectId: this.config.projectId
            });
            logInfo("[GoogleProvider] Google Speech client initialized successfully.");
        } catch (error: any) {
            this.client = null;
            showError(`Failed to initialize Google Speech client: ${error.message}`, error);
            logError('[GoogleProvider] Client initialization error:', error);
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

        // Prompt for credentials path if missing
        if (!this.config.credentialsPath || this.config.credentialsPath.trim() === '') {
            const credentialsPath = await vscode.window.showInputBox({
                prompt: 'Enter the path to your Google Cloud service account credentials JSON file',
                placeHolder: '/path/to/credentials.json',
                ignoreFocusOut: true
            });

            if (!credentialsPath || credentialsPath.trim() === '') {
                return false;
            }

            // Update credentials path
            const config = vscode.workspace.getConfiguration('speech-to-text-stt.google');
            await config.update('credentialsPath', credentialsPath, vscode.ConfigurationTarget.Global);
        }

        // Prompt for project ID if missing
        if (!this.config.projectId || this.config.projectId.trim() === '') {
            const projectId = await vscode.window.showInputBox({
                prompt: 'Enter your Google Cloud Project ID',
                placeHolder: 'my-project-id',
                ignoreFocusOut: true
            });

            if (!projectId || projectId.trim() === '') {
                return false;
            }

            // Update project ID
            const config = vscode.workspace.getConfiguration('speech-to-text-stt.google');
            await config.update('projectId', projectId, vscode.ConfigurationTarget.Global);
        }
        
        // Reload config and reinitialize client
        this.config = getGoogleConfig();
        this.initializeClient();
        
        return this.validateConfig();
    }

    async transcribeFileInternal(filePath: string): Promise<string> {
        if (!this.client) {
            throw new Error('Google Speech client not initialized');
        }

        if (!this.validateConfig()) {
            throw new Error('Google Speech configuration is invalid');
        }

        try {
            // Read the audio file
            const audioBytes = fs.readFileSync(filePath).toString('base64');
            
            const request: any = {
                audio: {
                    content: audioBytes,
                },
                config: {
                    encoding: 'LINEAR16',  // Fixed for WAV files with PCM
                    sampleRateHertz: 44100,  // Fixed to match recorder
                    languageCode: this.config.languageCode || 'en-US',
                },
            };

            const [response] = await this.client.recognize(request);
            
            if (!response.results || response.results.length === 0) {
                throw new Error('No transcription results returned from Google Speech');
            }

            // Combine all transcription results
            const transcription = response.results
                .map((result: any) => result.alternatives?.[0]?.transcript || '')
                .filter((text: string) => text.trim() !== '')
                .join(' ');

            if (!transcription || transcription.trim() === '') {
                throw new Error('Empty transcription result from Google Speech');
            }

            return transcription;
        } catch (error) {
            logError('[GoogleProvider] Transcription error:', error);
            throw error;
        }
    }
} 