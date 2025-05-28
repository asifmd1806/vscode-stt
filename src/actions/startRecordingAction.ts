import * as vscode from 'vscode';
import { IRecorderService } from '../services/ffmpegRecorderService';
import { SttViewProvider } from '../views/sttViewProvider';
import { logInfo, logError, showError } from '../utils/logger';
import { events } from '../events';
import { RecordingState, TranscriptionState } from '../types/states';

interface StartRecordingActionArgs {
    recorderService: IRecorderService;
    stateUpdater: {
        setRecordingState: (state: RecordingState) => void;
        setTranscriptionState: (state: TranscriptionState) => void;
        setIsRecordingActive: (isRecording: boolean) => void;
        ensureMicrophoneSelected: () => Promise<boolean>;
    };
    sttViewProvider: SttViewProvider;
    selectedDeviceId: number | undefined;
    recordingState: RecordingState;
    transcriptionState: TranscriptionState;
}

/**
 * Action to start recording audio.
 * Ensures microphone is selected and updates UI state.
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
        // Check if we're in a valid state to start recording
        if (recordingState !== RecordingState.READY) {
            showError('Cannot start recording. Please wait for the current operation to complete.');
            return;
        }

        // Ensure microphone is selected
        const hasMicrophone = await stateUpdater.ensureMicrophoneSelected();
        if (!hasMicrophone) {
            logInfo('[StartRecordingAction] No microphone selected, aborting.');
            return;
        }

        logInfo(`[StartRecordingAction] Starting recording with device ID: ${selectedDeviceId}`);

        // Update state to recording
        stateUpdater.setRecordingState(RecordingState.RECORDING);
        stateUpdater.setTranscriptionState(TranscriptionState.IDLE);

        // Start recording
        const success = await recorderService.startRecording(selectedDeviceId);
        
        if (success) {
            logInfo('[StartRecordingAction] Recording started successfully.');
            
            // Update recording state
            stateUpdater.setIsRecordingActive(true);
            
            // Update UI
            // Note: recordingStarted event is emitted by the recorder service
        } else {
            logError('[StartRecordingAction] Failed to start recording.');
            showError('Failed to start recording. Check your microphone permissions.');
            
            // Emit error event
            events.emit({
                type: 'extensionError',
                error: new Error('Failed to start recording'),
                timestamp: Date.now()
            });
            
            // Reset state
            stateUpdater.setRecordingState(RecordingState.READY);
            stateUpdater.setIsRecordingActive(false);
            
            // Update UI
        }
    } catch (error) {
        logError('[StartRecordingAction] Error starting recording:', error);
        showError(`Failed to start recording: ${error}`);
        
        // Emit error event
        events.emit({
            type: 'extensionError',
            error: error instanceof Error ? error : new Error(String(error)),
            timestamp: Date.now()
        });
        
        // Reset state on error
        stateUpdater.setRecordingState(RecordingState.READY);
        stateUpdater.setTranscriptionState(TranscriptionState.IDLE);
        stateUpdater.setIsRecordingActive(false);
        
        // Update UI
    }
} 