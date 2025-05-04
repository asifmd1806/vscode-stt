import { Readable } from 'stream';

export interface TranscriptionService {
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
    ensureProviderConfiguration(): boolean;

    /**
     * Transcribes audio from a file specified by its path.
     * @param audioFilePath The path to the audio file (e.g., WAV, MP3).
     * @returns A Promise resolving to the transcribed text, or null on failure.
     */
    transcribeFile(audioFilePath: string): Promise<string | null>;

    // Optional: Define methods for stream-based transcription if needed later
    // transcribeStream?(audioStream: Readable): Promise<string | null>;
} 