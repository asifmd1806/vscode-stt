import * as vscode from 'vscode';
import { logInfo, logError, showError } from '../utils/logger';
import { events } from '../events';
import { playNotificationSound } from '../utils/soundNotification';
import { TranscriptionState } from '../types/states';

interface TranscriptionCompletedActionArgs {
    audioFilePath: string;
    transcription: string;
    transcriptionDuration: number;
    stateUpdater: {
        setTranscriptionState: (state: TranscriptionState) => void;
        addTranscriptionResult: (text: string) => void;
    };
    context: vscode.ExtensionContext;
}

/**
 * Action to handle successful transcription completion
 * Emits events, updates history, and plays notification sound
 */
export async function transcriptionCompletedAction({
    audioFilePath,
    transcription,
    transcriptionDuration,
    stateUpdater,
    context
}: TranscriptionCompletedActionArgs): Promise<void> {
    try {
        logInfo(`[TranscriptionCompletedAction] Processing transcription result: "${transcription}"`);
        
        // Emit transcriptionCompleted event
        events.emit({
            type: 'transcriptionCompleted',
            audioFilePath: audioFilePath,
            text: transcription,
            timestamp: Date.now(),
            duration: transcriptionDuration
        });

        // Add to history and emit history event
        stateUpdater.addTranscriptionResult(transcription);
        events.emit({
            type: 'historyItemAdded',
            text: transcription,
            timestamp: Date.now(),
            audioFilePath: audioFilePath
        });

        // Play notification sound
        await playNotificationSound(context);

        logInfo('[TranscriptionCompletedAction] Transcription completed successfully and added to history.');
        stateUpdater.setTranscriptionState(TranscriptionState.COMPLETED);
        
        // Reset to idle after showing completed state
        setTimeout(() => {
            stateUpdater.setTranscriptionState(TranscriptionState.IDLE);
        }, 2000); // Show completed state for 2 seconds
        
    } catch (error) {
        logError('[TranscriptionCompletedAction] Error processing transcription completion:', error);
        // Don't throw - this is a post-processing step
    }
}

/**
 * Action to handle transcription errors
 * Emits error event and updates UI state
 */
export async function transcriptionErrorAction({
    error,
    stateUpdater,
    audioFilePath
}: {
    error: Error;
    stateUpdater: {
        setTranscriptionState: (state: TranscriptionState) => void;
    };
    audioFilePath?: string;
}): Promise<void> {
    logError('[TranscriptionErrorAction] Handling transcription error:', error);
    
    // Show error to user
    showError(`Transcription failed: ${error.message}`);
    
    // Update state
    stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
    
    // Emit transcriptionError event
    events.emit({
        type: 'transcriptionError',
        error: error,
        timestamp: Date.now(),
        audioFilePath: audioFilePath
    });
    
    // Reset to idle after showing error state
    setTimeout(() => {
        stateUpdater.setTranscriptionState(TranscriptionState.IDLE);
    }, 2000); // Show error state for 2 seconds
} 