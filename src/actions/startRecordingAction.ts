import * as vscode from 'vscode';
import { IRecorderService } from '../services/ffmpegRecorderService';
import { SttViewProvider } from '../views/sttViewProvider';
import { logInfo, logError, showError } from '../utils/logger';
import { Readable } from 'stream';
import { events } from '../events';

enum RecordingState {
    READY = 'ready',
    RECORDING = 'recording',
    STOPPING = 'stopping'
}

enum TranscriptionState {
    IDLE = 'idle',
    TRANSCRIBING = 'transcribing',
    COMPLETED = 'completed',
    ERROR = 'error'
}

interface StartRecordingActionArgs {
    recorderService: IRecorderService;
    stateUpdater: {
        setCurrentAudioStream: (stream: Readable | null) => void;
        setIsRecordingActive: (isRecording: boolean) => void;
        setRecordingState: (state: RecordingState) => void;
        setTranscriptionState: (state: TranscriptionState) => void;
        ensureMicrophoneSelected: () => Promise<boolean>;
    };
    sttViewProvider: SttViewProvider;
    selectedDeviceId?: number;
    recordingState: RecordingState;
    transcriptionState: TranscriptionState;
}

/**
 * Action to start recording audio.
 * Updates UI state and manages the recording process.
 */
export async function startRecordingAction({
    recorderService,
    stateUpdater,
    sttViewProvider,
    selectedDeviceId,
    recordingState,
    transcriptionState
}: StartRecordingActionArgs): Promise<void> {
    try {
        if (recorderService.isRecording || recordingState === RecordingState.RECORDING) {
            showError('Already recording. Stop the current recording first.');
            return;
        }

        if (transcriptionState === TranscriptionState.TRANSCRIBING) {
            showError('Cannot start recording while transcribing.');
            return;
        }

        // Ensure microphone is selected before recording
        const microphoneSelected = await stateUpdater.ensureMicrophoneSelected();
        if (!microphoneSelected) {
            logInfo('[StartRecordingAction] Recording cancelled - no microphone selected');
            return;
        }

        logInfo(`[StartRecordingAction] Starting recording with device ID: ${selectedDeviceId ?? 'undefined (will use default)'}`);

        // Start recording
        const audioStream = recorderService.startRecording(selectedDeviceId);
        if (!audioStream) {
            showError('Failed to start recording.');
            stateUpdater.setRecordingState(RecordingState.READY);
            stateUpdater.setTranscriptionState(TranscriptionState.IDLE);
            return;
        }

        // Update state
        stateUpdater.setCurrentAudioStream(audioStream);
        stateUpdater.setIsRecordingActive(true);
        stateUpdater.setRecordingState(RecordingState.RECORDING);
        stateUpdater.setTranscriptionState(TranscriptionState.IDLE);

        // Listen for recording failures
        audioStream.on('error', () => {
            logError('[StartRecordingAction] Audio stream error detected');
            stateUpdater.setCurrentAudioStream(null);
            stateUpdater.setIsRecordingActive(false);
            stateUpdater.setRecordingState(RecordingState.READY);
            stateUpdater.setTranscriptionState(TranscriptionState.IDLE);
            sttViewProvider.refresh();
        });

        // Note: recordingStarted event is emitted by the recorder service

        // Update UI
        sttViewProvider.refresh();

    } catch (error) {
        logError('[StartRecordingAction] Error starting recording:', error);
        showError(`Failed to start recording: ${error}`);
        
        // Clean up state on error
        stateUpdater.setCurrentAudioStream(null);
        stateUpdater.setIsRecordingActive(false);
        stateUpdater.setRecordingState(RecordingState.READY);
        stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
        
        // Update UI
        sttViewProvider.refresh();
    }
} 