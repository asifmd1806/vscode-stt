import * as vscode from 'vscode';
import { IRecorderService } from '../services/recorderService';
import { SttViewProvider } from '../views/sttViewProvider';
import { Readable } from 'stream';
import { logInfo, logWarn, logError, showInfo, showWarn, showError } from '../utils/logger';

// Define the expected structure of the arguments
interface StartRecordingActionArgs {
    recorderService: IRecorderService;
    stateUpdater: {
        setCurrentAudioStream: (stream: Readable | null) => void;
        setSelectedDeviceId: (deviceId: number | undefined) => void;
        setIsRecordingActive: (isRecording: boolean) => void;
    };
    sttViewProvider: SttViewProvider;
    selectedDeviceId: number | undefined;
    updateStatusBar: () => void;
    audioChunks: Buffer[]; // Added property to store audio chunks
}

/**
 * Action to start the audio recording process.
 * It updates the UI (status bar, tree view), sets the recording context,
 * and starts the recorder service.
 * Returns a disposable to manage the recording state context.
 */
export function startRecordingAction({
    recorderService,
    stateUpdater,
    sttViewProvider,
    selectedDeviceId,
    updateStatusBar,
    audioChunks, // Added parameter
}: StartRecordingActionArgs): vscode.Disposable | null {
    logInfo("[Action] startRecordingAction triggered.");

    if (recorderService.isRecording) {
        showInfo('Recording is already active.');
        return null;
    }

    // Determine the device ID to use (get from state, default is handled by service)
    const deviceIdToUse = selectedDeviceId ?? vscode.workspace.getConfiguration('speech-to-text-stt').get<number>('selectedDeviceId');

    logInfo(`[Action] Attempting to start recording with device ID: ${deviceIdToUse ?? 'Default'}`);

    try {
        const audioStream = recorderService.startRecording(deviceIdToUse); // Pass explicitly

        if (audioStream) {
            stateUpdater.setCurrentAudioStream(audioStream);
            stateUpdater.setIsRecordingActive(true); // Set context for 'when' clauses
            updateStatusBar(); // Update status bar text/icon
            sttViewProvider.refresh(); // Refresh the tree view to show stop button etc.
            showInfo('Recording started...');

            // Handle stream events (optional: logging, etc.)
            audioStream.on('data', (chunk) => {
                // logInfo(`[Action] Received ${chunk.length} bytes of audio data.`); // Optional: Verbose
                audioChunks.push(chunk); // Buffer the audio data
            });
            audioStream.on('end', () => {
                logInfo('[Action] Audio stream ended.');
                // This might be called when stopRecording is called, 
                // or if the stream ends unexpectedly.
                // Ensure state is consistent if it ends unexpectedly.
                if (recorderService.isRecording) {
                    logWarn('[Action] Stream ended unexpectedly while recording state was true.');
                    stateUpdater.setIsRecordingActive(false);
                    updateStatusBar();
                    sttViewProvider.refresh();
                }
            });
            audioStream.on('error', (err) => {
                logError('[Action] Audio stream error:', err);
                showError(`Audio stream error: ${err.message}`);
                // Ensure recording stops on stream error
                if (recorderService.isRecording) {
                    recorderService.stopRecording(); // Trigger the stop sequence
                    stateUpdater.setIsRecordingActive(false);
                    updateStatusBar();
                    sttViewProvider.refresh();
                }
            });

            // Return a disposable that will clear the context when disposed
            // This helps manage the 'when' clause correctly
            return new vscode.Disposable(() => {
                // To avoid recursion, don't call setIsRecordingActive directly
                // Just log the disposal
                logInfo("[Action] Recording state context disposed.");
                
                // Instead of calling stateUpdater.setIsRecordingActive(false) here,
                // we let the stopRecordingAction or deactivate handle this
                
                // Also ensure that if recording is still active, we stop it
                if (recorderService.isRecording) {
                    try {
                        recorderService.stopRecording();
                        logInfo("[Action] Stopped recording during disposal.");
                    } catch (error) {
                        logError("[Action] Error stopping recording during disposal:", error);
                    }
                }
            });

        } else {
            // startRecording returned null, likely an error was shown by the service
            logError("[Action] recorderService.startRecording failed to return a stream.");
            // Ensure context is false if start failed
             stateUpdater.setIsRecordingActive(false);
             updateStatusBar();
             sttViewProvider.refresh();
             return null;
        }
    } catch (error) {
        logError("[Action] Error starting recording:", error);
        showError(`Failed to start recording: ${error}`);
         stateUpdater.setIsRecordingActive(false);
         updateStatusBar();
         sttViewProvider.refresh();
         return null;
    }
} 