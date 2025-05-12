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
 * Lists all saved recordings in the recordings directory.
 * @param context The extension context
 * @returns Promise with an array of recording file information 
 */
export async function listSavedRecordings(context: vscode.ExtensionContext): Promise<{name: string, path: string, size: number, date: Date}[]> {
    const dirUri = await getRecordingsDir(context);
    if (!dirUri) {
        logError("[FileUtils] Cannot list recordings: Directory path is null");
        return [];
    }
    
    try {
        const entries = await vscode.workspace.fs.readDirectory(dirUri);
        const wavFiles = entries.filter(entry => 
            entry[1] === vscode.FileType.File && 
            entry[0].toLowerCase().endsWith('.wav')
        );
        
        const recordings = await Promise.all(wavFiles.map(async ([fileName, _]) => {
            const filePath = path.join(dirUri.fsPath, fileName);
            
            try {
                const stats = await fs.promises.stat(filePath);
                return {
                    name: fileName,
                    path: filePath,
                    size: stats.size,
                    date: stats.mtime
                };
            } catch (error) {
                logError(`[FileUtils] Error getting file stats for ${filePath}:`, error);
                return {
                    name: fileName,
                    path: filePath,
                    size: 0,
                    date: new Date()
                };
            }
        }));
        
        // Sort by date (newest first)
        return recordings.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
        logError("[FileUtils] Error listing recordings:", error);
        return [];
    }
}

/**
 * Opens the recordings directory in the system file explorer.
 * @param context The extension context
 */
export async function openRecordingsDirectory(context: vscode.ExtensionContext): Promise<void> {
    const dirUri = await getRecordingsDir(context);
    if (!dirUri) {
        showError("Cannot access recordings directory");
        return;
    }
    
    try {
        await vscode.commands.executeCommand('revealFileInOS', dirUri);
        logInfo(`[FileUtils] Opened recordings directory: ${dirUri.fsPath}`);
    } catch (error) {
        logError("[FileUtils] Error opening recordings directory:", error);
        showError(`Failed to open recordings directory: ${error}`);
    }
}

/**
 * Verifies that an audio file is valid.
 * @param filePath Path to the audio file to verify
 * @returns {Promise<{valid: boolean, size: number, error?: string}>} Object with validation results
 */
export async function verifyAudioFile(filePath: string): Promise<{valid: boolean, size: number, error?: string}> {
    try {
        // Get file stats to check size
        const stats = await fs.promises.stat(filePath);
        
        // Check if file exists
        if (!stats.isFile()) {
            return { valid: false, size: 0, error: "Not a valid file" };
        }
        
        // Check if file is empty
        if (stats.size === 0) {
            return { valid: false, size: 0, error: "File is empty (0 bytes)" };
        }
        
        // Check if file has minimal WAV header (44 bytes)
        if (stats.size < 44) {
            return { valid: false, size: stats.size, error: `File too small for valid WAV (${stats.size} bytes)` };
        }
        
        // Read first 12 bytes to check WAV header signature
        const fd = await fs.promises.open(filePath, 'r');
        const headerBuffer = Buffer.alloc(12);
        await fd.read(headerBuffer, 0, 12, 0);
        await fd.close();
        
        // Check WAV header
        const riffHeader = headerBuffer.slice(0, 4).toString();
        const waveHeader = headerBuffer.slice(8, 12).toString();
        
        if (riffHeader !== 'RIFF' || waveHeader !== 'WAVE') {
            return { 
                valid: false, 
                size: stats.size, 
                error: `Invalid WAV header: ${riffHeader}...${waveHeader}` 
            };
        }
        
        // If all checks pass, return valid
        return { valid: true, size: stats.size };
        
    } catch (error: any) {
        return { valid: false, size: 0, error: `Validation error: ${error.message}` };
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

        // Verify the audio file
        const verificationResult = await verifyAudioFile(filePath);
        
        if (!verificationResult.valid) {
            logError(`[FileUtils] Audio file verification failed: ${verificationResult.error}, size: ${verificationResult.size} bytes`);
            outputChannel.appendLine(`Warning: Audio file verification failed - ${verificationResult.error}`);
            
            if (verificationResult.size === 0) {
                // If file is empty, don't even attempt transcription
                return null;
            }
        } else {
            logInfo(`[FileUtils] Audio file verified: ${verificationResult.size} bytes`);
            outputChannel.appendLine(`Audio file verified (${verificationResult.size} bytes)`);
        }
        
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