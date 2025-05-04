import * as vscode from 'vscode';

import { logInfo, showInfo } from '../utils/logger';

// Define the expected structure of the arguments
interface ClearHistoryActionArgs {
    stateUpdater: {
        clearTranscriptionHistory: () => void;
    };
}

/**
 * Action to clear the transcription history.
 */
export function clearHistoryAction({ stateUpdater }: ClearHistoryActionArgs): void {
    logInfo("[Action] clearHistoryAction triggered.");
    
    // Ask for confirmation before clearing
    vscode.window.showWarningMessage(
        "Are you sure you want to clear the transcription history?",
        { modal: true }, // Make it a modal dialog
        "Clear History" // Confirmation button text
    ).then(selection => {
        if (selection === "Clear History") {
            stateUpdater.clearTranscriptionHistory();
            showInfo("Transcription history cleared.");
            logInfo("[Action] History cleared by user confirmation.");
        } else {
            logInfo("[Action] Clear history cancelled by user.");
        }
    });
} 