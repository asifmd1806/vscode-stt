export interface AppEvent {
  timestamp?: Date;
}

export interface ExtensionActivatedEvent extends AppEvent {}

export interface ExtensionDeactivatedEvent extends AppEvent {}

export interface MicrophoneSelectedEvent extends AppEvent {
  deviceId: string | number;
}

export interface RecordingStartedEvent extends AppEvent {}

export interface RecordingStoppedEvent extends AppEvent {
  filePath: string;
}

export interface TranscriptionStartedEvent extends AppEvent {
  filePath: string;
}

export interface TranscriptionCompletedEvent extends AppEvent {
  text: string;
}

export interface TranscriptionErrorEvent extends AppEvent {
  error: Error | any;
  message?: string;
}

export interface ExtensionErrorEvent extends AppEvent {
  error: Error | any;
  message?: string;
  source?: string;
}

export interface HistoryClearedEvent extends AppEvent {}

export interface HistoryItemCopiedEvent extends AppEvent {
  text: string;
}

export enum EventType {
  ExtensionActivated = 'extensionActivated',
  ExtensionDeactivated = 'extensionDeactivated',
  MicrophoneSelected = 'microphoneSelected',
  RecordingStarted = 'recordingStarted',
  RecordingStopped = 'recordingStopped',
  TranscriptionStarted = 'transcriptionStarted',
  TranscriptionCompleted = 'transcriptionCompleted',
  TranscriptionError = 'transcriptionError',
  ExtensionError = 'extensionError',
  HistoryCleared = 'historyCleared',
  HistoryItemCopied = 'historyItemCopied',
}
