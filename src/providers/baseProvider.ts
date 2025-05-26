import { Readable } from 'stream';
import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logError } from '../utils/logger';

/**
 * Base interface for all transcription providers
 */
export interface TranscriptionProvider {
    /**
     * Checks if the transcription client is available and configured.
     * @returns True if the client is ready, false otherwise.
     */
    isClientAvailable(): boolean;

    /**
     * Ensures the necessary provider configuration (e.g., API key) is present.
     * May trigger UI prompts if configuration is missing.
     * @returns True if the configuration is valid and the provider is ready, false otherwise.
     */
    ensureProviderConfiguration(): Promise<boolean>;

    /**
     * Transcribes audio from a file specified by its path.
     * @param audioFilePath The path to the audio file (e.g., WAV, MP3).
     * @returns A Promise resolving to the transcribed text, or null on failure.
     */
    transcribeFile(filePath: string): Promise<string | null>;

    /**
     * Transcribes audio from an array of audio chunks.
     * @param audioChunks An array of audio chunks.
     * @returns A Promise resolving to the transcribed text, or null on failure.
     */
    transcribeAudioChunks(chunks: Buffer[]): Promise<string | null>;
}

/**
 * Base class for transcription providers with common functionality
 */
export abstract class BaseTranscriptionProvider implements TranscriptionProvider {
    protected client: any | null = null;
    protected config: any;
    protected outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    abstract isClientAvailable(): boolean;
    abstract ensureProviderConfiguration(): Promise<boolean>;
    abstract transcribeFileInternal(filePath: string): Promise<string>;

    /**
     * Save buffer to a temporary file
     */
    protected async saveToTempFile(buffer: Buffer): Promise<string> {
        const tempFilePath = path.join(os.tmpdir(), `transcription-${Date.now()}.wav`);
        await fs.promises.writeFile(tempFilePath, buffer);
        return tempFilePath;
    }

    /**
     * Clean up temporary file
     */
    protected async cleanupTempFile(filePath: string): Promise<void> {
        try {
            await fs.promises.unlink(filePath);
        } catch (error) {
            this.outputChannel.appendLine(`Warning: Failed to clean up temporary file: ${error}`);
        }
    }

    /**
     * Save audio chunks to a temporary file
     */
    private async saveChunksToTempFile(chunks: Buffer[]): Promise<string> {
        const tempFilePath = path.join(os.tmpdir(), `stt-${Date.now()}.wav`);
        
        const writeStream = fs.createWriteStream(tempFilePath);
        return new Promise<string>((resolve, reject) => {
            writeStream.on('error', reject);
            writeStream.on('finish', () => resolve(tempFilePath));
            
            for (const chunk of chunks) {
                writeStream.write(chunk);
            }
            writeStream.end();
        });
    }

    public async transcribeFile(filePath: string): Promise<string | null> {
        try {
            // Check client availability
            if (!this.isClientAvailable()) {
                throw new Error('Transcription provider is not available');
            }

            // Ensure configuration
            const isConfigured = await this.ensureProviderConfiguration();
            if (!isConfigured) {
                throw new Error('Transcription provider is not configured');
            }

            // Note: Events are emitted by the calling action, not here
            const text = await this.transcribeFileInternal(filePath);
            return text;
        } catch (error) {
            logError('[BaseTranscriptionProvider] Transcription error:', error);
            return null;
        }
    }

    public async transcribeAudioChunks(chunks: Buffer[]): Promise<string | null> {
        try {
            // Save chunks to a temporary file
            const tempFilePath = await this.saveChunksToTempFile(chunks);

            // Transcribe the temporary file
            const result = await this.transcribeFile(tempFilePath);

            // Clean up the temporary file
            await this.cleanupTempFile(tempFilePath);

            return result;
        } catch (error) {
            logError('[BaseTranscriptionProvider] Error transcribing audio chunks:', error);
            return null;
        }
    }
} 