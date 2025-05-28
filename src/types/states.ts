/**
 * Recording state enum - represents the current state of audio recording
 */
export enum RecordingState {
    READY = 'ready',
    INITIALIZING = 'initializing',
    RECORDING = 'recording',
    STOPPING = 'stopping'
}

/**
 * Transcription state enum - represents the current state of transcription process
 */
export enum TranscriptionState {
    IDLE = 'idle',
    TRANSCRIBING = 'transcribing',
    COMPLETED = 'completed',
    ERROR = 'error'
} 