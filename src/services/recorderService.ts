import * as vscode from 'vscode';
import { PassThrough, Readable } from 'stream';
import { logInfo, logWarn, logError, showError, showWarn } from '../utils/logger'; 

export interface AudioDeviceInfo {
    id: number;
    name: string;
}

export interface IRecorderService {
    readonly isRecording: boolean;
    listMicrophones(): Promise<AudioDeviceInfo[]>;
    startRecording(deviceId?: number): Readable | null;
    stopRecording(): void;
}

/**
 * Legacy speech-recorder implementation.
 * @deprecated Use FFmpegRecorderService instead.
 */
export class RecorderService implements IRecorderService {
    private recorderInstance: any | null = null;
    private audioStream: PassThrough | null = null;
    private _isRecording: boolean = false;

    constructor() {
        logWarn("[RecorderService] This implementation is deprecated. Use FFmpegRecorderService instead.");
    }

    public get isRecording(): boolean {
        return this._isRecording;
    }

    /** Lists available audio input devices. */
    async listMicrophones(): Promise<AudioDeviceInfo[]> {
        showWarn('Legacy RecorderService is deprecated. Using FFmpegRecorderService is recommended.');
        logError("[RecorderService] Cannot list microphones, implementation deprecated.");
        return [{ id: -1, name: "Error: Legacy implementation" }];
    }

    /**
     * Starts recording audio from the specified device.
     * @param deviceId The ID of the audio device to use (-1 for default).
     * @returns A Readable stream of audio data, or null if recording failed to start.
     */
    startRecording(deviceId: number = -1): Readable | null {
        showWarn('Legacy RecorderService is deprecated. Using FFmpegRecorderService is recommended.');
        logError("[RecorderService] Cannot start recording, implementation deprecated.");
            return null;
    }

    /** Stops the current audio recording. */
    stopRecording(): void {
        logInfo('[RecorderService] Stop recording called, but implementation is deprecated.');
        this._isRecording = false; 
        if (this.audioStream && !this.audioStream.destroyed) {
            this.audioStream.end(); 
        }
        this.audioStream = null;
        this.recorderInstance = null;
    }
} 