import { Readable } from 'stream';
import * as vscode from 'vscode';
import { RecordingState, TranscriptionState } from '../types/states';
import { ExtensionStateData, TranscriptionHistoryItem, StateChangeListener, StateManager } from './types';
import { logInfo } from '../utils/logger';

export class ExtensionStateManager implements StateManager {
    private state: ExtensionStateData = {
        recordingState: RecordingState.READY,
        transcriptionState: TranscriptionState.IDLE,
        currentAudioStream: null,
        selectedDeviceId: undefined,
        transcriptionHistory: [],
        recordingStartTime: null
    };

    private listeners: StateChangeListener[] = [];
    private context: vscode.ExtensionContext | null = null;

    setContext(context: vscode.ExtensionContext) {
        this.context = context;
    }

    getState(): ExtensionStateData {
        return { ...this.state };
    }

    setRecordingState(state: RecordingState): void {
        this.state.recordingState = state;
        logInfo(`[ExtensionState] Recording state updated to: ${state}`);
        
        // Track recording duration
        if (state === RecordingState.RECORDING) {
            this.state.recordingStartTime = Date.now();
        } else {
            this.state.recordingStartTime = null;
        }
        
        this.notifyListeners();
    }

    setTranscriptionState(state: TranscriptionState): void {
        this.state.transcriptionState = state;
        logInfo(`[ExtensionState] Transcription state updated to: ${state}`);
        this.notifyListeners();
    }

    setSelectedDeviceId(deviceId: number | undefined): void {
        this.state.selectedDeviceId = deviceId;
        if (this.context && deviceId !== undefined) {
            this.context.globalState.update('selectedDeviceId', deviceId);
            this.context.globalState.update('hasSelectedMicrophone', true);
        }
        logInfo(`[ExtensionState] Selected Device ID updated: ${deviceId}`);
        this.notifyListeners();
    }

    setCurrentAudioStream(stream: Readable | null): void {
        this.state.currentAudioStream = stream;
        logInfo(`[ExtensionState] Audio stream ${stream ? 'set' : 'cleared'}`);
        this.notifyListeners();
    }

    addTranscriptionResult(text: string): void {
        const newItem: TranscriptionHistoryItem = { text, timestamp: Date.now() };
        this.state.transcriptionHistory.unshift(newItem);
        logInfo(`[ExtensionState] Added to history. New length: ${this.state.transcriptionHistory.length}`);
        this.notifyListeners();
    }

    clearTranscriptionHistory(): void {
        this.state.transcriptionHistory = [];
        logInfo("[ExtensionState] Transcription history cleared.");
        this.notifyListeners();
    }

    setRecordingStartTime(time: number | null): void {
        this.state.recordingStartTime = time;
        this.notifyListeners();
    }

    onStateChange(listener: StateChangeListener): void {
        this.listeners.push(listener);
    }

    removeStateChangeListener(listener: StateChangeListener): void {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    private notifyListeners(): void {
        const stateCopy = this.getState();
        this.listeners.forEach(listener => listener(stateCopy));
    }

    async restoreSelectedDevice(context: vscode.ExtensionContext): Promise<void> {
        const savedDeviceId = context.globalState.get<number>('selectedDeviceId');
        if (savedDeviceId !== undefined) {
            this.setSelectedDeviceId(savedDeviceId);
            logInfo(`[ExtensionState] Restored selected device ID: ${savedDeviceId}`);
        }
    }
} 