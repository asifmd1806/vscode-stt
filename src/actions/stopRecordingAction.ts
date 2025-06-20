import * as vscode from 'vscode';
import { IRecorderService } from '../services/ffmpegRecorderService';
import { TranscriptionProvider } from '../providers/baseProvider';
import { SttViewProvider } from '../views/sttViewProvider';
import { logInfo, logError, showError } from '../utils/logger';
import { events } from '../events';
import { RecordingState, TranscriptionState } from '../types/states';
import { transcriptionStartedAction } from './transcriptionStartedAction';
import { transcriptionCompletedAction, transcriptionErrorAction } from './transcriptionCompletedAction';

interface StopRecordingActionArgs {
    recorderService: IRecorderService;
    transcriptionProvider: TranscriptionProvider | null;
    stateUpdater: {
        setIsRecordingActive: (isRecording: boolean) => void;
        setRecordingState: (state: RecordingState) => void;
        setTranscriptionState: (state: TranscriptionState) => void;
        addTranscriptionResult: (text: string) => void;
    };
    sttViewProvider: SttViewProvider;
    selectedDeviceId?: number;
    recordingState: RecordingState;
    transcriptionState: TranscriptionState;
    context: vscode.ExtensionContext;
    outputChannel: vscode.OutputChannel;
}

/**
 * Action to stop the current recording and initiate transcription.
 * Delegates transcription handling to specialized actions.
 */
export async function stopRecordingAction({
    recorderService,
    transcriptionProvider,
    stateUpdater,
    sttViewProvider,
    selectedDeviceId,
    recordingState,
    transcriptionState,
    context,
    outputChannel
}: StopRecordingActionArgs): Promise<void> {
    try {
        // Validate recording state
        if (!recorderService.isRecording && recordingState !== RecordingState.RECORDING) {
            showError('No active recording to stop.');
            return;
        }

        logInfo('[StopRecordingAction] Stopping recording...');

        // Set stopping state
        stateUpdater.setRecordingState(RecordingState.STOPPING);

        // Get the actual recording duration before stopping
        const recordingDuration = recorderService.getRecordingDuration();

        // Stop the recording and get the file path
        const savedFilePath = await recorderService.stopRecording();
        
        // Update recording state
        stateUpdater.setIsRecordingActive(false);
        stateUpdater.setRecordingState(RecordingState.READY);

        if (!savedFilePath) {
            showError('No recording file was created.');
            stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
            return;
        }

        logInfo(`[StopRecordingAction] Recording saved to: ${savedFilePath}`);

        // Get device info for the event
        const devices = await recorderService.getAudioDevices();
        const currentDevice = devices.find(d => d.id === selectedDeviceId);
        const deviceName = currentDevice?.name || 'Unknown Device';

        // Emit recordingStopped event
        events.emit({
            type: 'recordingStopped',
            deviceId: selectedDeviceId ?? -1,
            deviceName: deviceName,
            timestamp: Date.now(),
            duration: recordingDuration,
            filePath: savedFilePath
        });

        // Handle transcription if provider is available
        if (transcriptionProvider) {
            await handleTranscription({
                savedFilePath,
                transcriptionProvider,
                stateUpdater,
                context
            });
        } else {
            logError('[StopRecordingAction] No transcription provider available - cannot transcribe audio.');
            stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
            showError('No transcription provider available.');
        }

    } catch (error) {
        logError('[StopRecordingAction] Error stopping recording:', error);
        showError(`Failed to stop recording: ${error}`);
        
        // Clean up state on error
        stateUpdater.setIsRecordingActive(false);
        stateUpdater.setRecordingState(RecordingState.READY);
        stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
    }
}

/**
 * Handles the transcription process using specialized actions
 */
async function handleTranscription({
    savedFilePath,
    transcriptionProvider,
    stateUpdater,
    context
}: {
    savedFilePath: string;
    transcriptionProvider: TranscriptionProvider;
    stateUpdater: {
        setTranscriptionState: (state: TranscriptionState) => void;
        addTranscriptionResult: (text: string) => void;
    };
    context: vscode.ExtensionContext;
}): Promise<void> {
    const startTime = Date.now();
    
    // Start transcription
    const result = await transcriptionStartedAction({
        audioFilePath: savedFilePath,
        transcriptionProvider,
        stateUpdater
    });
    
    const transcriptionDuration = Date.now() - startTime;
    
    if (result.success && result.transcription) {
        // Handle successful transcription
        await transcriptionCompletedAction({
            audioFilePath: savedFilePath,
            transcription: result.transcription,
            transcriptionDuration,
            stateUpdater,
            context
        });
    } else if (result.error) {
        // Handle transcription error
        await transcriptionErrorAction({
            error: result.error,
            stateUpdater,
            audioFilePath: savedFilePath
        });
    }
} 