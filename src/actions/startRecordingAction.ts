import * as vscode from 'vscode';
import { IRecorderService } from '../services/ffmpegRecorderService';
import { SttViewProvider } from '../views/sttViewProvider';
import { logInfo, logError, showError } from '../utils/logger';
import { Readable } from 'stream';
import { events } from '../events';

interface StartRecordingActionArgs {
    recorderService: IRecorderService;
    stateUpdater: {
        setCurrentAudioStream: (stream: Readable | null) => void;
        setIsRecordingActive: (isRecording: boolean) => void;
    };
    sttViewProvider: SttViewProvider;
    selectedDeviceId?: number;
    isTranscribing?: boolean;
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
    isTranscribing = false
}: StartRecordingActionArgs): Promise<void> {
    try {
        if (recorderService.isRecording) {
            showError('Already recording. Stop the current recording first.');
            return;
        }

        if (isTranscribing) {
            showError('Cannot start recording while transcribing.');
            return;
        }

        logInfo('[StartRecordingAction] Starting recording...');

        // Start recording
        const audioStream = recorderService.startRecording(selectedDeviceId);
        if (!audioStream) {
            showError('Failed to start recording.');
            return;
        }

        // Update state
        stateUpdater.setCurrentAudioStream(audioStream);
        stateUpdater.setIsRecordingActive(true);

        // Note: recordingStarted event is emitted by the recorder service

        // Update UI
        sttViewProvider.refresh();

    } catch (error) {
        logError('[StartRecordingAction] Error starting recording:', error);
        showError(`Failed to start recording: ${error}`);
        
        // Clean up state on error
        stateUpdater.setCurrentAudioStream(null);
        stateUpdater.setIsRecordingActive(false);
        
        // Update UI
        sttViewProvider.refresh();
    }
} 