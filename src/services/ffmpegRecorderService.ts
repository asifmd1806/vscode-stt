import * as vscode from 'vscode';
import * as vscode from 'vscode';
import { PassThrough, Readable } from 'stream';
import { spawn, ChildProcess, exec } from 'child_process';
import { logInfo, logWarn, logError, showError, showWarn } from '../utils/logger';
import { AudioDeviceInfo, IRecorderService } from './recorderService';
import { eventManager } from '../events/eventManager';
import { EventType } from '../events/events';
import * as path from 'path';
import * as os from 'os';

export class FFmpegRecorderService implements IRecorderService {
    private ffmpegProcess: ChildProcess | null = null;
    private audioStream: PassThrough | null = null;
    private _isRecording: boolean = false;
    private ffmpegAvailable: boolean = false;
    private ffmpegPath: string = 'ffmpeg'; // Default to just the command name

    constructor() {
        this.detectFFmpeg();
    }

    /**
     * Attempts to find FFmpeg in the system by checking:
     * 1. Default PATH
     * 2. Common installation locations based on OS
     */
    private async detectFFmpeg(): Promise<void> {
        try {
            // First check if FFmpeg is available in PATH
            const checkInPath = new Promise<string | null>((resolve) => {
                exec('which ffmpeg || where ffmpeg', (error, stdout) => {
                    if (error || !stdout) {
                        resolve(null);
                    } else {
                        resolve(stdout.trim());
                    }
                });
            });

            const pathResult = await checkInPath;
            
            if (pathResult) {
                this.ffmpegPath = pathResult;
                logInfo(`[FFmpegRecorderService] Found FFmpeg in PATH at: ${pathResult}`);
                this.ffmpegAvailable = true;
                return;
            }

            // If not found in PATH, check common locations based on OS
            const commonLocations: string[] = [];
            
            if (os.platform() === 'darwin') {
                // macOS common locations
                commonLocations.push(
                    '/opt/homebrew/bin/ffmpeg',
                    '/usr/local/bin/ffmpeg',
                    '/opt/local/bin/ffmpeg'
                );
            } else if (os.platform() === 'win32') {
                // Windows common locations
                commonLocations.push(
                    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
                    'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe',
                    path.join(os.homedir(), 'ffmpeg', 'bin', 'ffmpeg.exe')
                );
            } else {
                // Linux common locations
                commonLocations.push(
                    '/usr/bin/ffmpeg',
                    '/usr/local/bin/ffmpeg',
                    '/opt/bin/ffmpeg'
                );
            }

            // Try each location
            for (const location of commonLocations) {
                try {
                    const checkResult = await new Promise<boolean>((resolve) => {
                        exec(`"${location}" -version`, (error) => {
                            resolve(!error);
                        });
                    });

                    if (checkResult) {
                        this.ffmpegPath = location;
                        this.ffmpegAvailable = true;
                        logInfo(`[FFmpegRecorderService] Found FFmpeg at: ${location}`);
                        return;
                    }
                } catch {
                    // Continue to next location
                }
            }

            // If we got here, FFmpeg wasn't found
            this.ffmpegAvailable = false;
            logError("[FFmpegRecorderService] FFmpeg not found in PATH or common locations");
            
            let installInstructions = '';
            if (os.platform() === 'darwin') {
                installInstructions = 'Install with: brew install ffmpeg';
            } else if (os.platform() === 'win32') {
                installInstructions = 'Download from: https://ffmpeg.org/download.html or install with: choco install ffmpeg';
            } else {
                installInstructions = 'Install with: sudo apt install ffmpeg (Ubuntu/Debian) or sudo yum install ffmpeg (CentOS/RHEL)';
            }
            
            showError(`FFmpeg is not installed or not in PATH. ${installInstructions}`);
            
        } catch (error: any) {
            this.ffmpegAvailable = false;
            logError("[FFmpegRecorderService] Error detecting FFmpeg:", error);
            showError(`Failed to check FFmpeg availability: ${error.message || error}`);
            eventManager.emit(EventType.ExtensionError, {
                error,
                message: 'Error detecting FFmpeg',
                source: 'FFmpegRecorderService.detectFFmpeg'
            });
        }
    }

    public get isRecording(): boolean {
        return this._isRecording;
    }

    /** Lists available audio input devices using ffmpeg. */
    async listMicrophones(): Promise<AudioDeviceInfo[]> {
        if (!this.ffmpegAvailable) {
            showWarn('FFmpeg not available. Cannot list audio devices.');
            logError("[FFmpegRecorderService] Cannot list microphones, ffmpeg not available.");
            return [{ id: -1, name: "Error: FFmpeg not installed" }];
        }

        logInfo("[FFmpegRecorderService] Listing audio devices...");
        
        try {
            // Choose the right device listing approach based on platform
            let listDevicesArgs: string[] = [];
            
            if (os.platform() === 'darwin') {
                // macOS uses AVFoundation
                listDevicesArgs = ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''];
            } else if (os.platform() === 'win32') {
                // Windows uses DirectShow
                listDevicesArgs = ['-f', 'dshow', '-list_devices', 'true', '-i', 'dummy'];
            } else {
                // Linux platforms - try ALSA first
                listDevicesArgs = ['-f', 'alsa', '-list_devices', 'true', '-i', 'dummy'];
            }
            
            const process = spawn(this.ffmpegPath, listDevicesArgs);
            
            let deviceOutput = '';
            
            process.stderr.on('data', (data) => {
                deviceOutput += data.toString();
            });
            
            return new Promise<AudioDeviceInfo[]>((resolve) => {
                process.on('close', () => {
                    const devices: AudioDeviceInfo[] = [];
                    const lines = deviceOutput.split('\n');
                    
                    // The parsing logic depends on the platform
                    if (os.platform() === 'darwin') {
                        // Parse macOS AVFoundation devices
                        let captureAudioInputs = false;
                        
                        for (const line of lines) {
                            // Check if we're in the audio input section
                            if (line.includes('AVFoundation audio devices')) {
                                captureAudioInputs = true;
                                continue;
                            }
                            
                            // Stop when we hit video devices or end of device listing
                            if (captureAudioInputs && (line.includes('AVFoundation video devices') || line.includes('AVFoundation input device'))) {
                                break;
                            }
                            
                            // Parse audio input device line
                            if (captureAudioInputs) {
                                // Example line: "[0] Built-in Microphone"
                                const match = line.match(/\[(\d+)\]\s+(.+)/);
                                if (match) {
                                    const id = parseInt(match[1], 10);
                                    const name = match[2].trim();
                                    devices.push({ id, name });
                                }
                            }
                        }
                    } else if (os.platform() === 'win32') {
                        // Parse Windows DirectShow devices
                        let captureAudioInputs = false;
                        
                        for (const line of lines) {
                            if (line.includes('DirectShow audio devices')) {
                                captureAudioInputs = true;
                                continue;
                            }
                            
                            if (captureAudioInputs && line.includes('DirectShow video devices')) {
                                break;
                            }
                            
                            if (captureAudioInputs && line.includes('"')) {
                                // Example: "Microphone (HD Webcam)" (audio)
                                const match = line.match(/"([^"]+)"/);
                                if (match) {
                                    // In DirectShow, we use the name as the ID as well
                                    const name = match[1].trim();
                                    devices.push({ id: devices.length, name });
                                }
                            }
                        }
                    } else {
                        // Parse Linux devices (ALSA or PulseAudio)
                        // Simple parsing - add any line that might be a device
                        for (const line of lines) {
                            if (line.includes('audio') && !line.includes('devices')) {
                                const cleanedLine = line.trim();
                                devices.push({ id: devices.length, name: cleanedLine });
                            }
                        }
                    }
                    
                    if (devices.length === 0) {
                        logWarn("[FFmpegRecorderService] No audio devices found or failed to parse ffmpeg output");
                        // Provide a default device as fallback
                        resolve([{ id: 0, name: "Default Device" }]);
                    } else {
                        logInfo(`[FFmpegRecorderService] Found ${devices.length} devices.`);
                        resolve(devices);
                    }
                });
                
                process.on('error', (error) => {
                    logError("[FFmpegRecorderService] Error listing audio devices:", error);
                    resolve([{ id: -1, name: "Error: Failed to list devices" }]);
                });
            });
        } catch (error: any) {
            logError("[FFmpegRecorderService] Error executing ffmpeg for device listing:", error);
            showError(`Failed to list audio devices: ${error.message || error}`);
            eventManager.emit(EventType.ExtensionError, {
                error,
                message: 'Error listing microphones',
                source: 'FFmpegRecorderService.listMicrophones'
            });
            return [{ id: -1, name: "Default/Error" }];
        }
    }

    /**
     * Starts recording audio from the specified device using ffmpeg.
     * @param deviceId The ID of the audio device to use (-1 for default).
     * @returns A Readable stream of audio data, or null if recording failed to start.
     */
    startRecording(deviceId: number = -1): Readable | null {
        if (!this.ffmpegAvailable) {
            showWarn('FFmpeg not available. Cannot start recording.');
            logError("[FFmpegRecorderService] Cannot start recording, ffmpeg not available.");
            return null;
        }

        if (this.ffmpegProcess) {
            showWarn('Recording is already in progress.');
            return null;
        }

        this.audioStream = new PassThrough();
        const outputStream = this.audioStream; // For closure

        logInfo(`[FFmpegRecorderService] Attempting to start recording (Device ID: ${deviceId})...`);

        try {
            // For AVFoundation on macOS, the format is ":audio_device_id" for audio-only recording
            // For other platforms we'll use the existing format
            let inputFormat = '';
            if (os.platform() === 'darwin') {
                // For macOS, use ":deviceId" format for audio-only recording
                const audioDeviceId = deviceId === -1 ? "0" : deviceId.toString();
                inputFormat = `:${audioDeviceId}`;
                logInfo(`[FFmpegRecorderService] Using macOS AVFoundation input format: ${inputFormat}`);
            } else {
                // Keep original format for other platforms
                const deviceSelector = deviceId === -1 ? "default" : deviceId.toString();
                inputFormat = `${deviceSelector}:`;
            }
            
            // Build the FFmpeg command
            const ffmpegArgs = [
                '-f', 'avfoundation',
                '-i', inputFormat,
                '-ar', '16000',
                '-ac', '1',
                '-acodec', 'pcm_s16le',
                '-f', 'wav',
                'pipe:1'
            ];
            
            logInfo(`[FFmpegRecorderService] FFmpeg command: ${this.ffmpegPath} ${ffmpegArgs.join(' ')}`);
            
            this.ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs);

            // Handle process errors
            this.ffmpegProcess.on('error', (error) => {
                logError("[FFmpegRecorderService] FFmpeg process error:", error);
                showError(`Recording error: ${error.message || error}`);
                this.stopRecording();
            });

            // Handle process exit
            this.ffmpegProcess.on('close', (code) => {
                if (code !== 0 && this._isRecording) {
                    logError(`[FFmpegRecorderService] FFmpeg process exited with code ${code}`);
                    showError(`Recording stopped unexpectedly with code ${code}`);
                }
                this._isRecording = false;
                
                // Ensure stream is ended if the process exits
                if (outputStream && !outputStream.destroyed) {
                    outputStream.end();
                }
                
                this.ffmpegProcess = null;
            });

            // Handle stderr (ffmpeg writes logs to stderr)
            this.ffmpegProcess.stderr?.on('data', (data) => {
                // Only log if it's an error message (ffmpeg uses stderr for regular logs too)
                const str = data.toString();
                if (str.includes('Error') || str.includes('error')) {
                    logError(`[FFmpegRecorderService] FFmpeg stderr: ${str}`);
                }
            });

            // Pipe the stdout (audio data) to our PassThrough stream
            this.ffmpegProcess.stdout?.pipe(outputStream);

            this._isRecording = true;
            logInfo('[FFmpegRecorderService] Recording started successfully.');

            // Return the stream consumers will read from
            return this.audioStream;

        } catch (error: any) {
            const errorMsg = `Failed to start recording: ${error.message || error}`;
            showError(errorMsg, error);
            logError('[FFmpegRecorderService] Start recording error:', error);
            eventManager.emit(EventType.ExtensionError, {
                error,
                message: 'Failed to start recording in FFmpegRecorderService',
                source: 'FFmpegRecorderService.startRecording'
            });
            this._isRecording = false;
            this.ffmpegProcess = null;
            
            // Ensure stream is ended/destroyed on error
            if (outputStream && !outputStream.destroyed) {
                outputStream.end();
                outputStream.destroy(error instanceof Error ? error : new Error(String(error)));
            }
            
            this.audioStream = null;
            return null;
        }
    }

    /** Stops the current audio recording. */
    stopRecording(): void {
        if (!this.ffmpegProcess) {
            logInfo('[FFmpegRecorderService] Stop recording called, but no active recording instance.');
            // Ensure state is consistent even if no instance exists
            if (this._isRecording) {
                this._isRecording = false;
            }
            if (this.audioStream && !this.audioStream.destroyed) {
                this.audioStream.end();
            }
            this.audioStream = null;
            return;
        }
        
        logInfo(`[FFmpegRecorderService] Stopping recording...`);
        
        // Keep reference to current stream for cleanup
        const currentStream = this.audioStream;
        
        // Set recording state to false first
        this._isRecording = false;
        
        try {
            if (!this.ffmpegProcess) { // Guard against null process
                logWarn('[FFmpegRecorderService] stopRecording called but ffmpegProcess is null.');
                // Ensure state consistency
                this._isRecording = false;
                if (this.audioStream && !this.audioStream.destroyed) {
                    this.audioStream.end();
                }
                this.audioStream = null;
                return;
            }
            // Tell FFmpeg to stop recording - use SIGINT for cleaner shutdown that completes the file
            logInfo('[FFmpegRecorderService] Sending SIGINT to ffmpeg process to finalize recording.');
            this.ffmpegProcess.kill('SIGINT');
            
            // Set a timeout to force kill if it doesn't exit gracefully
            const killTimeout = setTimeout(() => {
                if (this.ffmpegProcess) {
                    logWarn('[FFmpegRecorderService] FFmpeg process did not exit gracefully, sending SIGTERM...');
                    this.ffmpegProcess.kill('SIGTERM');
                    
                    // Final force kill after another delay
                    setTimeout(() => {
                        if (this.ffmpegProcess) {
                            logWarn('[FFmpegRecorderService] FFmpeg process still running, force killing with SIGKILL...');
                            this.ffmpegProcess.kill('SIGKILL');
                        }
                    }, 500);
                }
            }, 1000);
            
            // Add a listener to clear the timeout if process exits
            this.ffmpegProcess.once('exit', () => {
                clearTimeout(killTimeout);
                logInfo('[FFmpegRecorderService] FFmpeg process exited.');
            });
            
        } catch (e: any) {
            logError("[FFmpegRecorderService] Error stopping ffmpeg process:", e);
            eventManager.emit(EventType.ExtensionError, {
                error: e,
                message: 'Error stopping ffmpeg process',
                source: 'FFmpegRecorderService.stopRecording'
            });
            // Continue cleanup even if kill throws
        }

        // Make sure we properly end the stream but with a delay to allow final data
        setTimeout(() => {
            // End the PassThrough stream to signal consumers
            if (currentStream && !currentStream.destroyed) {
                logInfo('[FFmpegRecorderService] Ending output audio stream.');
                try {
                    // Push empty buffer to ensure WAV file is properly terminated
                    const emptyBuffer = Buffer.alloc(44); // Empty WAV header size
                    currentStream.write(emptyBuffer);
                    currentStream.end();
                } catch (streamError) {
                    logError('[FFmpegRecorderService] Error ending audio stream:', streamError);
                }
            }
            
            logInfo('[FFmpegRecorderService] Recording stopped and resources cleaned up.');
        }, 500);
        
        // Clear references
        this.ffmpegProcess = null;
        this.audioStream = null;
    }
} 