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
 * Updates UI state and emits history cleared event.
 */
export function clearHistoryAction({ stateUpdater }: ClearHistoryActionArgs): void {
    try {
        logInfo('[ClearHistoryAction] Clearing transcription history...');
        
        // Clear history
        stateUpdater.clearTranscriptionHistory();
        
        // Emit history cleared event
        events.emit({
            type: 'historyCleared',
            timestamp: Date.now()
        });
        
        logInfo('[ClearHistoryAction] History cleared successfully.');
    } catch (error) {
        logError(`[ClearHistoryAction] Error clearing history: ${error}`);
    }
} 