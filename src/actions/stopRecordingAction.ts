import * as vscode from 'vscode';
import { IRecorderService } from '../services/ffmpegRecorderService';
import { TranscriptionProvider } from '../providers/baseProvider';
import { SttViewProvider } from '../views/sttViewProvider';
import { logInfo, logError, showError } from '../utils/logger';
import { saveAudioToFile } from '../utils/fileUtils';
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

interface StopRecordingActionArgs {
    recorderService: IRecorderService;
    transcriptionProvider: TranscriptionProvider | null;
    stateUpdater: {
        setCurrentAudioStream: (stream: Readable | null) => void;
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
 * Action to stop the current recording and handle transcription.
 * Updates UI state and manages the transcription process.
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
        if (!recorderService.isRecording && recordingState !== RecordingState.RECORDING) {
            showError('No active recording to stop.');
            return;
        }

        logInfo('[StopRecordingAction] Stopping recording...');

        // Set stopping state
        stateUpdater.setRecordingState(RecordingState.STOPPING);

        // Get the audio stream BEFORE stopping (it becomes null after stopping)
        const audioStream = recorderService.getCurrentAudioStream();
        if (!audioStream) {
            showError('No audio stream available to save.');
            stateUpdater.setRecordingState(RecordingState.READY);
            stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
            return;
        }

        // Get the actual recording duration before stopping
        const recordingDuration = recorderService.getRecordingDuration();

        // Stop the recording
        recorderService.stopRecording();
        stateUpdater.setCurrentAudioStream(null);
        stateUpdater.setIsRecordingActive(false);
        stateUpdater.setRecordingState(RecordingState.READY);

        // Update UI to show we're processing
        stateUpdater.setTranscriptionState(TranscriptionState.TRANSCRIBING);
        sttViewProvider.refresh();

        // Save the recording
        const savedFilePath = await saveAudioToFile(audioStream, outputChannel, context);
        if (!savedFilePath) {
            showError('Failed to save recording.');
            return;
        }

        logInfo(`[StopRecordingAction] Recording saved to: ${savedFilePath}`);

        // Get device info for the event
        const devices = await recorderService.getAudioDevices();
        const currentDevice = devices.find(d => d.id === selectedDeviceId);
        const deviceName = currentDevice?.name || 'Unknown Device';

        // Emit recordingStopped event with file info
        events.emit({
            type: 'recordingStopped',
            deviceId: selectedDeviceId ?? -1,
            deviceName: deviceName,
            timestamp: Date.now(),
            duration: recordingDuration,
            filePath: savedFilePath
        });

        // Also emit audioFileSaved event
        events.emit({
            type: 'audioFileSaved',
            filePath: savedFilePath,
            size: 0, // TODO: Get actual file size if needed
            timestamp: Date.now()
        });

        // Start transcription if provider is available
        if (transcriptionProvider) {
            try {
                logInfo(`[StopRecordingAction] Starting transcription using provider: ${transcriptionProvider.constructor.name}`);
                
                // Emit transcriptionStarted event
                events.emit({
                    type: 'transcriptionStarted',
                    audioFilePath: savedFilePath,
                    timestamp: Date.now()
                });

                const startTime = Date.now();
                logInfo('[StopRecordingAction] Calling transcription provider...');
                const transcription = await transcriptionProvider.transcribeFile(savedFilePath);
                const transcriptionDuration = Date.now() - startTime;
                logInfo(`[StopRecordingAction] Transcription completed in ${transcriptionDuration}ms`);

                if (transcription) {
                    logInfo(`[StopRecordingAction] Transcription result: "${transcription}"`);
                    
                    // Emit transcriptionCompleted event
                    events.emit({
                        type: 'transcriptionCompleted',
                        audioFilePath: savedFilePath,
                        text: transcription,
                        timestamp: Date.now(),
                        duration: transcriptionDuration
                    });

                    // Add to history and emit history event
                    stateUpdater.addTranscriptionResult(transcription);
                    events.emit({
                        type: 'historyItemAdded',
                        text: transcription,
                        timestamp: Date.now()
                    });

                    logInfo('[StopRecordingAction] Transcription completed successfully and added to history.');
                    stateUpdater.setTranscriptionState(TranscriptionState.COMPLETED);
                } else {
                    logError('[StopRecordingAction] Transcription failed: No result returned from provider.');
                    showError('Transcription failed: No result returned.');
                    stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
                }
            } catch (error) {
                logError('[StopRecordingAction] Transcription error:', error);
                showError(`Transcription failed: ${error}`);
                stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
                // Emit transcriptionError event
                events.emit({
                    type: 'transcriptionError',
                    error: error instanceof Error ? error : new Error(String(error)),
                    timestamp: Date.now()
                });
            } finally {
                // Reset to idle after completion or error
                setTimeout(() => {
                    stateUpdater.setTranscriptionState(TranscriptionState.IDLE);
                }, 2000); // Show completed/error state for 2 seconds
            }
        } else {
            logError('[StopRecordingAction] No transcription provider available - cannot transcribe audio.');
            stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
            showError('No transcription provider available.');
        }

        // Final UI update
        sttViewProvider.refresh();

    } catch (error) {
        logError('[StopRecordingAction] Error stopping recording:', error);
        showError(`Failed to stop recording: ${error}`);
        
        // Clean up state on error
        stateUpdater.setCurrentAudioStream(null);
        stateUpdater.setIsRecordingActive(false);
        stateUpdater.setRecordingState(RecordingState.READY);
        stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
        
        // Update UI
        sttViewProvider.refresh();
    }
} 