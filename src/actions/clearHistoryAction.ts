import * as vscode from 'vscode';
import { logInfo, logError } from '../utils/logger';
import { events } from '../events';

// Define the expected structure of the arguments
interface ClearHistoryActionArgs {
    stateUpdater: {
        clearTranscriptionHistory: () => void;
    };
}

/**
 * Action to clear the transcription history.
 */
export async function clearHistoryAction({ stateUpdater }: ClearHistoryActionArgs): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
        'Are you sure you want to clear all transcription history?',
        'Yes', 'No'
    );
    
    if (answer === 'Yes') {
        try {
            logInfo('[ClearHistoryAction] Clearing transcription history...');
            
            // Clear history
            stateUpdater.clearTranscriptionHistory();
            
            // Emit historyCleared event
            events.emit({
                type: 'historyCleared',
                timestamp: Date.now()
            });
            
            logInfo('[ClearHistoryAction] History cleared successfully.');
            vscode.window.showInformationMessage('Transcription history cleared.');
        } catch (error) {
            logError(`[ClearHistoryAction] Error clearing history: ${error}`);
        }
    }
} 