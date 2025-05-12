import * as vscode from 'vscode';
import { IRecorderService } from '../services/recorderService';
import { TranscriptionService } from '../services/transcriptionService';
import { SttViewProvider } from '../views/sttViewProvider';
import { saveAudioToFile, getRecordingsDir } from '../utils/fileUtils'; // Utility to save the stream
import { Readable } from 'stream';
import { getGeneralSetting } from '../config/settings'; // Import config getter
import * as fs from 'fs';

import { logInfo, logWarn, logError, showInfo, showWarn, showError } from '../utils/logger';

// Define the expected structure of the arguments
interface StopRecordingActionArgs {
    recorderService: IRecorderService;
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
    audioChunks: Buffer[]; // Added property to store audio chunks
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
    audioChunks, // Added parameter
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
            
            // First, properly stop the recorder
            recorderService.stopRecording(); 
            stateUpdater.setIsRecordingActive(false);
            updateStatusBar(); 
            sttViewProvider.refresh();
            logInfo("[Action] Recorder stopped.");

            // Give audio stream a moment to complete any pending writes
            await new Promise(resolve => setTimeout(resolve, 500));

            progress.report({ message: "Saving audio..." });
            outputChannel.appendLine("Saving audio to temporary file...");
            
            // Concatenate the buffered audio chunks
            const audioBuffer = Buffer.concat(audioChunks);
            
            // Save the buffer to a file
            const dirUri = await getRecordingsDir(context);
            if (!dirUri) {
                logError("[Action] Cannot get recordings directory path.");
                showError("Error: Cannot get recordings directory path.");
                return;
            }
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `recording-${timestamp}.wav`;
            const filePathUri = vscode.Uri.joinPath(dirUri, filename);
            const filePath = filePathUri.fsPath;
            
            try {
                await fs.promises.writeFile(filePath, audioBuffer);
                logInfo(`[Action] Audio saved to ${filePath}`);
                outputChannel.appendLine(`Audio saved to: ${filePath}`);
            } catch (writeError) {
                logError(`[Action] Error writing audio file: ${writeError}`);
                showError(`Failed to save audio recording: ${writeError}`);
                return;
            }
            
            // Check the file size to ensure it's not empty
            try {
                const stats = await fs.promises.stat(filePath);
                if (stats.size === 0 || stats.size < 44) { // WAV header is 44 bytes
                    logError(`[Action] Audio file is empty or too small (${stats.size} bytes)`);
                    showError("Recording produced an empty or invalid audio file. Please try again.");
                    return;
                }
                logInfo(`[Action] Audio file size: ${stats.size} bytes`);
            } catch (statError) {
                logError("[Action] Error checking audio file:", statError);
            }

            progress.report({ message: "Transcribing..." });
            outputChannel.appendLine("Starting transcription...");
            
            if (!transcriptionService.isClientAvailable()) {
                 if (!transcriptionService.ensureProviderConfiguration()) {
                    outputChannel.appendLine("Transcription aborted: Provider configuration required.");
                    return;
                 }
            }

            const transcriptionResult = await transcriptionService.transcribeFile(filePath);

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

            // Keep the audio file for troubleshooting instead of deleting it
            logInfo(`[Action] Keeping audio file for troubleshooting: ${filePath}`);
            outputChannel.appendLine(`Audio file retained for troubleshooting at: ${filePath}`);
            
            // Display a message about the retained file
            showInfo(`Recorded audio saved at: ${filePath}`);
            // Clear audioChunks for the next recording
            audioChunks.length = 0;
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