import * as vscode from 'vscode';
import { PassThrough, Readable } from 'stream';
import { spawn, ChildProcess, exec } from 'child_process';
import { logInfo, logWarn, logError, showError, showWarn } from '../utils/logger';
import * as path from 'path';
import * as os from 'os';
import { events } from '../events';

export interface AudioDeviceInfo {
    id: number;
    name: string;
    label?: string;
}

export interface IRecorderService {
    isRecording: boolean;
    getAudioDevices(): Promise<AudioDeviceInfo[]>;
    startRecording(deviceId?: number): Readable | null;
    stopRecording(): void;
    selectAudioDevice(deviceId: number): Promise<void>;
    onRecordingStateChanged(callback: (isRecording: boolean) => void): void;
    getCurrentAudioStream(): Readable | null;
    getRecordingDuration(): number; // Duration in milliseconds
}

export class FFmpegRecorderService implements IRecorderService {
    private ffmpegProcess: ChildProcess | null = null;
    private audioStream: PassThrough | null = null;
    private _isRecording: boolean = false;
    private isFfmpegAvailable: boolean = false;
    private ffmpegPath: string = 'ffmpeg'; // Default to just the command name
    private recordingStateChangeListeners: ((isRecording: boolean) => void)[] = [];
    private recordingStartTime: number = 0;
    private currentDeviceId: number = -1;
    private currentDeviceName: string = '';

    constructor() {
        this.detectFfmpeg();
    }

    /**
     * Attempts to find FFmpeg in the system by checking:
     * 1. Default PATH
     * 2. Common installation locations based on OS
     */
    private async detectFfmpeg(): Promise<void> {
        try {
            // First check if FFmpeg is available in PATH
            const checkFfmpegInPath = new Promise<string | null>((resolve) => {
                exec('which ffmpeg || where ffmpeg', (error, stdout) => {
                    if (error || !stdout) {
                        resolve(null);
                    } else {
                        resolve(stdout.trim());
                    }
                });
            });

            const ffmpegPathResult = await checkFfmpegInPath;
            
            if (ffmpegPathResult) {
                this.ffmpegPath = ffmpegPathResult;
                logInfo(`[FFmpegRecorderService] Found FFmpeg in PATH at: ${ffmpegPathResult}`);
                this.isFfmpegAvailable = true;
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
                    const ffmpegCheckResult = await new Promise<boolean>((resolve) => {
                        exec(`"${location}" -version`, (error) => {
                            resolve(!error);
                        });
                    });

                    if (ffmpegCheckResult) {
                        this.ffmpegPath = location;
                        this.isFfmpegAvailable = true;
                        logInfo(`[FFmpegRecorderService] Found FFmpeg at: ${location}`);
                        return;
                    }
                } catch {
                    // Continue to next location
                }
            }

            // If we got here, FFmpeg wasn't found
            this.isFfmpegAvailable = false;
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
            
        } catch (error) {
            this.isFfmpegAvailable = false;
            logError("[FFmpegRecorderService] Error detecting FFmpeg:", error);
            showError(`Failed to check FFmpeg availability: ${error}`);
        }
    }

    public get isRecording(): boolean {
        return this._isRecording;
    }

    /** Lists available audio input devices using ffmpeg. */
    async getAudioDevices(): Promise<AudioDeviceInfo[]> {
        if (!this.isFfmpegAvailable) {
            showWarn('FFmpeg not available. Cannot list audio devices.');
            logError("[FFmpegRecorderService] Cannot list microphones, ffmpeg not available.");
            return [{ id: -1, name: "Error: FFmpeg not installed" }];
        }

        logInfo("[FFmpegRecorderService] Listing audio devices...");
        
        try {
            // Choose the right device listing approach based on platform
            let deviceListArgs: string[] = [];
            
            if (os.platform() === 'darwin') {
                // macOS uses AVFoundation
                deviceListArgs = ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''];
            } else if (os.platform() === 'win32') {
                // Windows uses DirectShow
                deviceListArgs = ['-f', 'dshow', '-list_devices', 'true', '-i', 'dummy'];
            } else {
                // Linux platforms - try ALSA first
                deviceListArgs = ['-f', 'alsa', '-list_devices', 'true', '-i', 'dummy'];
            }
            
            const ffmpegProcess = spawn(this.ffmpegPath, deviceListArgs);
            
            let ffmpegDeviceOutput = '';
            
            ffmpegProcess.stderr.on('data', (data) => {
                ffmpegDeviceOutput += data.toString();
            });
            
            return new Promise<AudioDeviceInfo[]>((resolve) => {
                ffmpegProcess.on('close', () => {
                    const devices: AudioDeviceInfo[] = [];
                    const outputLines = ffmpegDeviceOutput.split('\n');
                    
                    // The parsing logic depends on the platform
                    if (os.platform() === 'darwin') {
                        // Parse macOS AVFoundation devices
                        let isCapturingAudioInputs = false;
                        
                        for (const line of outputLines) {
                            // Check if we're in the audio input section
                            if (line.includes('AVFoundation audio devices')) {
                                isCapturingAudioInputs = true;
                                continue;
                            }
                            
                            // Stop when we hit video devices or end of device listing
                            if (isCapturingAudioInputs && (line.includes('AVFoundation video devices') || line.includes('AVFoundation input device'))) {
                                break;
                            }
                            
                            // Parse audio input device line
                            if (isCapturingAudioInputs) {
                                // Example line: "[0] Built-in Microphone"
                                const deviceMatch = line.match(/\[(\d+)\]\s+(.+)/);
                                if (deviceMatch) {
                                    const deviceId = parseInt(deviceMatch[1], 10);
                                    const deviceName = deviceMatch[2].trim();
                                    devices.push({ id: deviceId, name: deviceName, label: deviceName });
                                }
                            }
                        }
                    } else if (os.platform() === 'win32') {
                        // Parse Windows DirectShow devices
                        let isCapturingAudioInputs = false;
                        
                        for (const line of outputLines) {
                            if (line.includes('DirectShow audio devices')) {
                                isCapturingAudioInputs = true;
                                continue;
                            }
                            
                            if (isCapturingAudioInputs && line.includes('DirectShow video devices')) {
                                break;
                            }
                            
                            if (isCapturingAudioInputs && line.includes('"')) {
                                // Example: "Microphone (HD Webcam)" (audio)
                                const deviceMatch = line.match(/"([^"]+)"/);
                                if (deviceMatch) {
                                    // In DirectShow, we use the name as the ID as well
                                    const deviceName = deviceMatch[1].trim();
                                    devices.push({ id: devices.length, name: deviceName, label: deviceName });
                                }
                            }
                        }
                    } else {
                        // Parse Linux devices (ALSA or PulseAudio)
                        // Simple parsing - add any line that might be a device
                        for (const line of outputLines) {
                            if (line.includes('audio') && !line.includes('devices')) {
                                const cleanedDeviceName = line.trim();
                                devices.push({ id: devices.length, name: cleanedDeviceName, label: cleanedDeviceName });
                            }
                        }
                    }
                    
                    if (devices.length === 0) {
                        logWarn("[FFmpegRecorderService] No audio devices found or failed to parse ffmpeg output");
                        // Provide a default device as fallback
                        resolve([{ id: 0, name: "Default Device", label: "Default Device" }]);
                    } else {
                        logInfo(`[FFmpegRecorderService] Found ${devices.length} devices.`);
                        resolve(devices);
                    }
                });
                
                ffmpegProcess.on('error', (error) => {
                    logError("[FFmpegRecorderService] Error listing audio devices:", error);
                    resolve([{ id: -1, name: "Error: Failed to list devices", label: "Error: Failed to list devices" }]);
                });
            });
        } catch (error) {
            logError("[FFmpegRecorderService] Error executing ffmpeg for device listing:", error);
            showError(`Failed to list audio devices: ${error}`);
            return [{ id: -1, name: "Default/Error", label: "Default/Error" }];
        }
    }

    /**
     * Starts recording audio from the specified device using ffmpeg.
     * @param deviceId The ID of the audio device to use (-1 for default).
     * @returns A Readable stream of audio data, or null if recording failed to start.
     */
    startRecording(deviceId: number = -1): Readable | null {
        if (!this.isFfmpegAvailable) {
            showWarn('FFmpeg not available. Cannot start recording.');
            logError("[FFmpegRecorderService] Cannot start recording, ffmpeg not available.");
            return null;
        }

        if (this._isRecording) {
            showWarn('Already recording. Stop the current recording first.');
            return null;
        }

        try {
            this.audioStream = new PassThrough();
            this.recordingStartTime = Date.now();
            this.currentDeviceId = deviceId;
            
            // Get device name for the event
            this.getAudioDevices().then(devices => {
                const device = devices.find(d => d.id === deviceId);
                this.currentDeviceName = device?.name || 'Unknown Device';
            });

            // Choose the right input format based on platform
            let inputFormat: string;
            let inputArgs: string[];
            
            if (os.platform() === 'darwin') {
                inputFormat = 'avfoundation';
                // For macOS, use :0 for default device or the specific device ID
                const macDeviceId = deviceId === -1 ? 0 : deviceId;
                inputArgs = ['-f', inputFormat, '-i', `:${macDeviceId}`];
            } else if (os.platform() === 'win32') {
                inputFormat = 'dshow';
                // For Windows, we need to handle device selection differently
                if (deviceId === -1) {
                    inputArgs = ['-f', inputFormat, '-i', 'audio='];
                } else {
                    inputArgs = ['-f', inputFormat, '-i', `audio=${deviceId}`];
                }
            } else {
                inputFormat = 'alsa';
                // For Linux, use default or specific device
                const linuxDevice = deviceId === -1 ? 'default' : `hw:${deviceId}`;
                inputArgs = ['-f', inputFormat, '-i', linuxDevice];
            }

            // FFmpeg arguments for audio recording
            const ffmpegArgs = [
                ...inputArgs,
                '-acodec', 'pcm_s16le',  // 16-bit PCM
                '-ar', '44100',          // 44.1kHz sample rate
                '-ac', '2',              // Stereo
                '-f', 'wav',             // WAV format
                '-'                      // Output to stdout
            ];

            // Spawn FFmpeg process
            this.ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs);
            
            // Handle FFmpeg process events
            if (this.ffmpegProcess.stderr) {
                this.ffmpegProcess.stderr.on('data', (data) => {
                    logInfo(`[FFmpegRecorderService] FFmpeg: ${data.toString()}`);
                });
            }

            if (this.ffmpegProcess.stdout) {
                this.ffmpegProcess.stdout.pipe(this.audioStream);
            }

            this.ffmpegProcess.on('error', (error) => {
                logError("[FFmpegRecorderService] FFmpeg process error:", error);
                this.stopRecording();
            });

            this.ffmpegProcess.on('close', (code) => {
                if (code !== 0) {
                    logError(`[FFmpegRecorderService] FFmpeg process exited with code ${code}`);
                }
                this.stopRecording();
            });

            this._isRecording = true;
            this.notifyRecordingStateChange(true);

            // Emit recording started event
            this.emitRecordingStartedEvent();

            logInfo("[FFmpegRecorderService] Recording started successfully.");
            return this.audioStream;
        } catch (error) {
            logError("[FFmpegRecorderService] Error starting recording:", error);
            showError(`Failed to start recording: ${error}`);
            this.stopRecording();
            return null;
        }
    }

    /**
     * Stops the current recording and cleans up resources.
     */
    stopRecording(): void {
        if (this.ffmpegProcess) {
            try {
                this.ffmpegProcess.kill();
            } catch (error) {
                logError("[FFmpegRecorderService] Error killing FFmpeg process:", error);
            }
            this.ffmpegProcess = null;
        }

        if (this.audioStream) {
            try {
                this.audioStream.end();
            } catch (error) {
                logError("[FFmpegRecorderService] Error ending audio stream:", error);
            }
            this.audioStream = null;
        }

        if (this._isRecording) {
            const duration = Date.now() - this.recordingStartTime;
            
            // Emit recording stopped event
            this.emitRecordingStoppedEvent();

            this._isRecording = false;
            this.notifyRecordingStateChange(false);
            logInfo("[FFmpegRecorderService] Recording stopped.");
        }
    }

    /**
     * Selects an audio device for recording.
     * @param deviceId The ID of the device to select.
     */
    async selectAudioDevice(deviceId: number): Promise<void> {
        const devices = await this.getAudioDevices();
        const device = devices.find(d => d.id === deviceId);
        
        if (device) {
            this.currentDeviceId = deviceId;
            this.currentDeviceName = device.name;

            // Emit microphone selected event
            events.emit({
                type: 'microphoneSelected',
                deviceId: device.id,
                deviceName: device.name,
                timestamp: Date.now()
            });

            logInfo(`[FFmpegRecorderService] Device selected: ${device.name}`);
        }
    }

    /**
     * Registers a callback for recording state changes.
     * @param callback The function to call when recording state changes.
     */
    onRecordingStateChanged(callback: (isRecording: boolean) => void): void {
        this.recordingStateChangeListeners.push(callback);
    }

    /**
     * Notifies all listeners of a recording state change.
     * @param isRecording The new recording state.
     */
    private notifyRecordingStateChange(isRecording: boolean): void {
        for (const listener of this.recordingStateChangeListeners) {
            try {
                listener(isRecording);
            } catch (error) {
                logError("[FFmpegRecorderService] Error in recording state change listener:", error);
            }
        }
    }

    public getCurrentAudioStream(): Readable | null {
        return this.audioStream;
    }

    private emitRecordingStartedEvent(): void {
        events.emit({
            type: 'recordingStarted',
            deviceId: this.currentDeviceId || 0,
            deviceName: this.currentDeviceName || 'Default',
            timestamp: Date.now()
        });
    }

    private emitRecordingStoppedEvent(): void {
        // Note: This only indicates the recording stream stopped
        // File saving and final recordingStopped event with filePath 
        // is handled by the stopRecordingAction
    }

    private emitRecordingErrorEvent(error: Error): void {
        events.emit({
            type: 'extensionError',
            error,
            timestamp: Date.now()
        });
    }

    getRecordingDuration(): number {
        if (this._isRecording) {
            return Date.now() - this.recordingStartTime;
        }
        return 0;
    }
} 