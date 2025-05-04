import * as vscode from 'vscode';
import { PassThrough, Readable } from 'stream';
import { logInfo, logWarn, logError, showError, showWarn } from '../utils/logger'; 

// Dynamically import speech-recorder to handle potential CJS/ESM issues
let SpeechRecorderModule: any;

export interface AudioDeviceInfo {
    id: number;
    name: string;
}

export class RecorderService {
    private recorderInstance: any | null = null;
    private audioStream: PassThrough | null = null;
    private _isRecording: boolean = false;
    private speechRecorderLoaded: boolean = false;

    constructor() {
        this.loadSpeechRecorder();
    }

    private async loadSpeechRecorder() {
        try {
            // Use dynamic import
            SpeechRecorderModule = await import('speech-recorder');
            this.speechRecorderLoaded = true;
            logInfo("[RecorderService] speech-recorder loaded successfully.");
        } catch (error) {
            this.speechRecorderLoaded = false;
            logError("[RecorderService] Failed to load speech-recorder:", error);
            // Use showError to log AND notify
            showError(`Failed to load audio recording library (speech-recorder): ${error}. Please ensure it's installed correctly.`);
        }
    }

    public get isRecording(): boolean {
        return this._isRecording;
    }

    /** Lists available audio input devices. */
    async listMicrophones(): Promise<AudioDeviceInfo[]> {
        if (!this.speechRecorderLoaded || !SpeechRecorderModule?.devices) {
            // Use showWarn to log AND notify
            showWarn('Audio recording library not loaded. Cannot list devices.');
            logError("[RecorderService] Cannot list microphones, speech-recorder not loaded.");
            return [{ id: -1, name: "Error: Library not loaded" }];
        }
        logInfo("[RecorderService] Listing audio devices...");
        try {
            const deviceList: any[] = SpeechRecorderModule.devices(); 
            logInfo(`[RecorderService] Found ${deviceList.length} devices.`);
            // Map to our interface, providing fallbacks
            return deviceList.map((d: any, index: number) => ({ 
                id: d.id ?? index, // Use index as fallback ID if necessary
                name: d.name || `Device ${d.id ?? index}`, 
            }));
        } catch (error) {
            logError("[RecorderService] Error listing audio devices:", error);
            // Use showError to log AND notify
            showError(`Failed to list audio devices: ${error}`);
            return [{ id: -1, name: "Default/Error" }]; // Provide a fallback
        }
    }

    /**
     * Starts recording audio from the specified device.
     * @param deviceId The ID of the audio device to use (-1 for default).
     * @returns A Readable stream of audio data, or null if recording failed to start.
     */
    startRecording(deviceId: number = -1): Readable | null {
        if (!this.speechRecorderLoaded || !SpeechRecorderModule?.SpeechRecorder) {
             // Use showWarn to log AND notify
             showWarn('Audio recording library not loaded. Cannot start recording.');
             logError("[RecorderService] Cannot start recording, speech-recorder not loaded.");
            return null;
        }
        if (this.recorderInstance) {
            // Use showWarn to log AND notify
            showWarn('Recording is already in progress.');
            return null; // Or return existing stream?
        }

        this.audioStream = new PassThrough();
        const outputStream = this.audioStream; // For closure

        logInfo(`[RecorderService] Attempting to start recording (Device ID: ${deviceId})...`);

        try {
            // Define recording options
            const recorderOptions = {
                device: deviceId === -1 ? undefined : deviceId, // Use undefined for default device
                sampleRate: 16000,
                samplesPerFrame: 960, // Common frame size for STT
                // Optional: Configure VAD if needed
                // vad: { enabled: true, level: 3, ... },

                onAudio: ({ audio }: { audio: Buffer }) => {
                    if (outputStream && !outputStream.destroyed) {
                        outputStream.push(audio);
                    }
                },
                onError: (error: any) => {
                    logError("[RecorderService] speech-recorder internal error:", error);
                    // Use showError to log AND notify
                    showError(`Recording error: ${error.message || error}`);
                    // Automatically stop recording on error
                    this.stopRecording(); 
                }
            };
            
            // Filter out undefined device ID if it was -1
            if (recorderOptions.device === undefined) {
                delete recorderOptions.device;
            }

            this.recorderInstance = new SpeechRecorderModule.SpeechRecorder(recorderOptions);

            this.recorderInstance.start();
            this._isRecording = true;
            logInfo('[RecorderService] Recording started successfully.');

            // Return the stream consumers will read from
            return this.audioStream;

        } catch (error: any) {
            const errorMsg = `Failed to start recording: ${error.message || error}`;
            // Use showError to log AND notify
            showError(errorMsg, error);
            logError('[RecorderService] Start recording error:', error);
            this._isRecording = false;
            this.recorderInstance = null;
            // Ensure stream is ended/destroyed on error
            if (outputStream && !outputStream.destroyed) {
                 outputStream.end(); // Signal end
                 outputStream.destroy(error instanceof Error ? error : new Error(String(error))); // Signal error
            }
            this.audioStream = null;
            return null;
        }
    }

    /** Stops the current audio recording. */
    stopRecording(): void {
        if (!this.recorderInstance) {
            logInfo('[RecorderService] Stop recording called, but no active recording instance.');
            // Ensure state is consistent even if no instance exists
            if (this._isRecording) {
                this._isRecording = false;
            }
            if (this.audioStream && !this.audioStream.destroyed) {
                this.audioStream.end(); // End the stream if it exists
            }
            this.audioStream = null;
            return;
        }
        
        logInfo(`[RecorderService] Stopping recording...`);
        this._isRecording = false; 
        
        try {
            this.recorderInstance.stop(); 
            logInfo('[RecorderService] speech-recorder stop() called.');
        } catch(e) {
             logError("[RecorderService] Error calling speech-recorder stop():", e);
             // Continue cleanup even if stop() throws
        }

        // End the PassThrough stream to signal consumers
        if (this.audioStream && !this.audioStream.destroyed) {
             logInfo('[RecorderService] Ending output audio stream.');
            this.audioStream.end(); 
        }
        
        // Clean up references
        this.recorderInstance = null;
        this.audioStream = null;
        logInfo('[RecorderService] Recording stopped and resources cleaned up.');
    }
} 