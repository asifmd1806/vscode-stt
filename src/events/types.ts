import { Readable } from 'stream';
import { AudioDeviceInfo } from '../services/ffmpegRecorderService';

// Recording Events
export interface RecordingStartedEvent {
    type: 'recordingStarted';
    deviceId: number;
    deviceName: string;
    timestamp: number;
}

export interface RecordingStoppedEvent {
    type: 'recordingStopped';
    deviceId: number;
    deviceName: string;
    timestamp: number;
    duration: number; // Duration of the recording in ms
    filePath: string; // Path where the audio file was saved
    audioBuffer?: Buffer; // Optional: raw audio data
}

export interface RecordingErrorEvent {
    type: 'recordingError';
    error: Error;
    deviceId: number;
    deviceName: string;
    timestamp: number;
}

// Device Events
export interface MicrophoneSelectedEvent {
    type: 'microphoneSelected';
    deviceId: number;
    deviceName: string;
    timestamp: number;
}

export interface MicrophoneListUpdatedEvent {
    type: 'microphoneListUpdated';
    devices: AudioDeviceInfo[];
    timestamp: number;
}

export interface MicrophoneErrorEvent {
    type: 'microphoneError';
    error: Error;
    timestamp: number;
}

// Transcription Events
export interface TranscriptionStartedEvent {
    type: 'transcriptionStarted';
    audioFilePath: string;
    timestamp: number;
}

export interface TranscriptionCompletedEvent {
    type: 'transcriptionCompleted';
    audioFilePath: string;
    text: string;
    timestamp: number;
    duration: number;
}

export interface TranscriptionErrorEvent {
    type: 'transcriptionError';
    error: Error;
    timestamp: number;
}

export interface TranscriptionProgressEvent {
    type: 'transcriptionProgress';
    audioFilePath: string;
    progress: number; // 0-100
    timestamp: number;
}

// Provider Events
export interface ProviderInitializedEvent {
    type: 'providerInitialized';
    providerName: string;
    timestamp: number;
}

export interface ProviderErrorEvent {
    type: 'providerError';
    providerName: string;
    error: Error;
    timestamp: number;
}

export interface ProviderConfigChangedEvent {
    type: 'providerConfigChanged';
    providerName: string;
    timestamp: number;
}

// Audio File Events
export interface AudioFileSavedEvent {
    type: 'audioFileSaved';
    filePath: string;
    size: number;
    timestamp: number;
}

export interface AudioFileErrorEvent {
    type: 'audioFileError';
    error: Error;
    timestamp: number;
}

// History Events
export interface HistoryItemAddedEvent {
    type: 'historyItemAdded';
    text: string;
    timestamp: number;
}

export interface HistoryClearedEvent {
    type: 'historyCleared';
    timestamp: number;
}

export interface HistoryItemCopiedEvent {
    type: 'historyItemCopied';
    text: string;
    timestamp: number;
}

// Extension State Events
export interface ExtensionActivatedEvent {
    type: 'extensionActivated';
    timestamp: number;
}

export interface ExtensionDeactivatedEvent {
    type: 'extensionDeactivated';
    timestamp: number;
}

export interface ExtensionErrorEvent {
    type: 'extensionError';
    error: Error;
    timestamp: number;
}

export type SttEvent = 
    | ExtensionActivatedEvent
    | ExtensionDeactivatedEvent
    | ExtensionErrorEvent
    | MicrophoneSelectedEvent
    | MicrophoneListUpdatedEvent
    | MicrophoneErrorEvent
    | RecordingStartedEvent
    | RecordingStoppedEvent
    | RecordingErrorEvent
    | TranscriptionStartedEvent
    | TranscriptionCompletedEvent
    | TranscriptionErrorEvent
    | TranscriptionProgressEvent
    | ProviderInitializedEvent
    | ProviderErrorEvent
    | ProviderConfigChangedEvent
    | AudioFileSavedEvent
    | AudioFileErrorEvent
    | HistoryItemAddedEvent
    | HistoryClearedEvent
    | HistoryItemCopiedEvent; 