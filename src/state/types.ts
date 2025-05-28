import { Readable } from 'stream';
import { RecordingState, TranscriptionState } from '../types/states';

export interface ExtensionStateData {
    recordingState: RecordingState;
    transcriptionState: TranscriptionState;
    currentAudioStream: Readable | null;
    selectedDeviceId: number | undefined;
    transcriptionHistory: TranscriptionHistoryItem[];
    recordingStartTime: number | null;
}

export interface TranscriptionHistoryItem {
    text: string;
    timestamp: number;
}

export interface StateChangeListener {
    (state: ExtensionStateData): void;
}

export interface StateManager {
    getState(): ExtensionStateData;
    setRecordingState(state: RecordingState): void;
    setTranscriptionState(state: TranscriptionState): void;
    setSelectedDeviceId(deviceId: number | undefined): void;
    setCurrentAudioStream(stream: Readable | null): void;
    addTranscriptionResult(text: string): void;
    clearTranscriptionHistory(): void;
    setRecordingStartTime(time: number | null): void;
    onStateChange(listener: StateChangeListener): void;
    removeStateChangeListener(listener: StateChangeListener): void;
} 