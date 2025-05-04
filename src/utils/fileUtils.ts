import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises'; // Use pipeline for robust stream handling

import { logInfo, logWarn, logError, showError } from '../utils/logger';

let recordingsDirUri: vscode.Uri | null = null;

/**
 * Gets the URI for the recordings directory, creating it if it doesn't exist.
 * @param context The extension context providing storage paths.
 * @returns The Uri of the recordings directory, or null if storage path is unavailable.
 */
export async function getRecordingsDir(context: vscode.ExtensionContext): Promise<vscode.Uri | null> {
    if (recordingsDirUri) {
        return recordingsDirUri;
    }

    try {
        // Use extension storage path from context
        const storageUri = context.storageUri; 
        if (!storageUri) {
            logError("[FileUtils] Extension storageUri is unavailable.");
            showError("Cannot determine extension storage path for recordings.");
            return null;
        }
        
        const dirUri = vscode.Uri.joinPath(storageUri, 'recordings');

        // Check if directory exists, create if not
        try {
            await vscode.workspace.fs.stat(dirUri);
            logInfo(`[FileUtils] Recordings directory already exists: ${dirUri.fsPath}`);
        } catch (error: any) {
            if (error.code === 'FileNotFound') {
                logInfo(`[FileUtils] Creating recordings directory: ${dirUri.fsPath}`);
                await vscode.workspace.fs.createDirectory(dirUri);
                logInfo(`[FileUtils] Recordings directory created successfully.`);
            } else {
                // Rethrow unexpected errors
                throw error;
            }
        }
        
        recordingsDirUri = dirUri;
        return recordingsDirUri;

    } catch (error) {
        logError("[FileUtils] Error ensuring recordings directory exists:", error);
        showError(`Failed to create recordings directory: ${error}`);
        return null;
    }
}

/**
 * Saves the audio stream content to a temporary WAV file.
 * @param audioStream The readable audio stream.
 * @param outputChannel Channel for logging progress/errors.
 * @param context The extension context to get storage path.
 * @returns The full path to the saved WAV file, or null on failure.
 */
export async function saveAudioToFile(
    audioStream: Readable, 
    outputChannel: vscode.OutputChannel,
    context: vscode.ExtensionContext // Add context parameter
): Promise<string | null> {
    const dirUri = await getRecordingsDir(context); // Pass context here
    if (!dirUri) {
        outputChannel.appendLine("Error: Cannot get recordings directory path.");
        logError("[FileUtils] Cannot save audio: recordings directory path is null.");
        return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording-${timestamp}.wav`;
    const filePathUri = vscode.Uri.joinPath(dirUri, filename);
    const filePath = filePathUri.fsPath;

    logInfo(`[FileUtils] Attempting to save audio to: ${filePath}`);
    outputChannel.appendLine(`Saving recording to ${filename}...`);

    try {
        // Create a write stream using Node.js fs module (vscode.workspace.fs doesn't directly support streams yet)
        const writeStream = fs.createWriteStream(filePath);

        // Use pipeline to handle stream piping, error handling, and backpressure
        await pipeline(audioStream, writeStream);

        logInfo(`[FileUtils] Audio successfully saved to ${filePath}`);
        outputChannel.appendLine(`Recording saved successfully.`);
        return filePath;

    } catch (error: any) {
        logError(`[FileUtils] Error saving audio stream to ${filePath}:`, error);
        outputChannel.appendLine(`Error saving audio file: ${error.message}`);
        showError(`Failed to save audio recording: ${error.message}`);
        
        // Attempt to clean up partially written file on error
        try {
            if (fs.existsSync(filePath)) { 
                await fs.promises.unlink(filePath);
                logInfo(`[FileUtils] Cleaned up partially written file: ${filePath}`);
            }
        } catch (cleanupError) {
            logError(`[FileUtils] Error cleaning up failed audio file ${filePath}:`, cleanupError);
            outputChannel.appendLine(`Warning: Could not clean up failed recording file: ${filePath}`);
        }
        
        return null;
    }
} 