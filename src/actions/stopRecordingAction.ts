import * as vscode from 'vscode';
import { RecorderService } from '../services/recorderService';
import { TranscriptionService } from '../services/transcriptionService';
import { SttViewProvider } from '../views/sttViewProvider';
import { saveAudioToFile } from '../utils/fileUtils'; // Utility to save the stream
import { Readable } from 'stream';
import { getGeneralSetting } from '../config/settings'; // Import config getter

import { logInfo, logWarn, logError, showInfo, showWarn, showError } from '../utils/logger';

// Define the expected structure of the arguments
interface StopRecordingActionArgs {
    recorderService: RecorderService;
    transcriptionService: TranscriptionService;
    stateUpdater: {
        getCurrentAudioStream?: () => Readable | null; // Optional: Get stream from state
        setCurrentAudioStream: (stream: Readable | null) => void;
        addTranscriptionResult: (text: string) => void;
        setIsRecordingActive: (isRecording: boolean) => void;
    };
    outputChannel: vscode.OutputChannel;
    sttViewProvider: SttViewProvider; // To refresh the view
    context: vscode.ExtensionContext; // Add context here
    updateStatusBar: () => void; // Function to update the status bar
}

/**
 * Action to stop the recording, save the audio, transcribe it, 
 * and update the UI/state.
 */
export async function stopRecordingAction({
    recorderService,
    transcriptionService,
    stateUpdater,
    outputChannel,
    sttViewProvider,
    context,
    updateStatusBar,
}: StopRecordingActionArgs): Promise<void> {
    logInfo("[Action] stopRecordingAction triggered.");

    if (!recorderService.isRecording) {
        showInfo('No active recording to stop.');
        stateUpdater.setIsRecordingActive(false);
        return;
    }

    const audioStream = stateUpdater.getCurrentAudioStream ? stateUpdater.getCurrentAudioStream() : null; 
    if (!audioStream) {
        logError("[Action] Cannot stop recording: Audio stream not found in state.");
        showError("Error stopping recording: audio stream missing.");
        recorderService.stopRecording(); 
        stateUpdater.setIsRecordingActive(false);
        updateStatusBar();
        sttViewProvider.refresh();
        return;
    }

    try {
        outputChannel.appendLine("Stopping recording...");
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Processing Audio",
            cancellable: false 
        }, async (progress) => {
            progress.report({ message: "Stopping recorder..." });
            
            recorderService.stopRecording(); 
            stateUpdater.setIsRecordingActive(false);
            updateStatusBar(); 
            sttViewProvider.refresh();
            logInfo("[Action] Recorder stopped.");

            progress.report({ message: "Saving audio..." });
            outputChannel.appendLine("Saving audio to temporary file...");
            const audioFilePath = await saveAudioToFile(audioStream, outputChannel, context);
            
            if (!audioFilePath) {
                logError("[Action] Failed to save audio file.");
                return; 
            }
            outputChannel.appendLine(`Audio saved to: ${audioFilePath}`);
            logInfo(`[Action] Audio saved to ${audioFilePath}`);

            progress.report({ message: "Transcribing..." });
            outputChannel.appendLine("Starting transcription...");
            
            if (!transcriptionService.isClientAvailable()) {
                 if (!transcriptionService.ensureProviderConfiguration()) {
                    outputChannel.appendLine("Transcription aborted: Provider configuration required.");
                    return;
                 }
            }

            const transcriptionResult = await transcriptionService.transcribeFile(audioFilePath);

            if (transcriptionResult !== null) {
                outputChannel.appendLine(`Transcription successful: "${transcriptionResult}"`);
                logInfo("[Action] Transcription successful.");
                stateUpdater.addTranscriptionResult(transcriptionResult);
                
                if (getGeneralSetting('copyToClipboardAfterTranscription')) {
                    await vscode.env.clipboard.writeText(transcriptionResult);
                    outputChannel.appendLine("Result copied to clipboard.");
                }
                 if (getGeneralSetting('insertIntoEditorAfterTranscription')) {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        editor.edit(editBuilder => {
                            editBuilder.insert(editor.selection.active, transcriptionResult);
                        });
                         outputChannel.appendLine("Result inserted into active editor.");
                    } else {
                         outputChannel.appendLine("No active editor to insert transcription into.");
                         logInfo("No active editor to insert transcription into.");
                    }
                }
                
                showInfo('Transcription complete!');
            } else {
                outputChannel.appendLine("Transcription failed. See logs for details.");
                logError("[Action] Transcription failed.");
            }

            try {
                 logInfo(`[Action] Deleting temporary file: ${audioFilePath}`);
                 await vscode.workspace.fs.delete(vscode.Uri.file(audioFilePath));
                 outputChannel.appendLine("Temporary audio file deleted.");
             } catch (deleteError) {
                 logError(`[Action] Failed to delete temporary file ${audioFilePath}:`, deleteError);
                 outputChannel.appendLine(`Warning: Failed to delete temporary file: ${audioFilePath}`);
             }
        });

    } catch (error) {
        logError("[Action] Error during stop/transcribe process:", error);
        showError(`An error occurred: ${error}`);
        outputChannel.appendLine(`ERROR: ${error}`);
        if (recorderService.isRecording) {
             recorderService.stopRecording();
        }
        stateUpdater.setIsRecordingActive(false);
        updateStatusBar();
        sttViewProvider.refresh();
    } finally {
        stateUpdater.setCurrentAudioStream(null);
    }
} 