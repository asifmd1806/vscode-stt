import * as vscode from 'vscode';
import { TranscriptionProvider } from '../providers/baseProvider';
import { logInfo, logError, showError } from '../utils/logger';
import { transcriptionStartedAction } from './transcriptionStartedAction';
import { transcriptionCompletedAction, transcriptionErrorAction } from './transcriptionCompletedAction';
import { TranscriptionState } from '../types/states';
import * as fs from 'fs';

interface RetryTranscriptionActionArgs {
    audioFilePath: string;
    transcriptionProvider: TranscriptionProvider | null;
    stateUpdater: {
        setTranscriptionState: (state: TranscriptionState) => void;
        addTranscriptionResult: (text: string) => void;
    };
    context: vscode.ExtensionContext;
}

/**
 * Action to retry a failed transcription
 */
export async function retryTranscriptionAction({
    audioFilePath,
    transcriptionProvider,
    stateUpdater,
    context
}: RetryTranscriptionActionArgs): Promise<void> {
    try {
        // Check if file exists
        if (!fs.existsSync(audioFilePath)) {
            showError('Audio file no longer exists');
            return;
        }

        // Check if provider is available
        if (!transcriptionProvider) {
            showError('No transcription provider configured');
            return;
        }

        logInfo(`[RetryTranscriptionAction] Retrying transcription for: ${audioFilePath}`);

        const startTime = Date.now();
        
        // Start transcription
        const result = await transcriptionStartedAction({
            audioFilePath,
            transcriptionProvider,
            stateUpdater
        });
        
        const transcriptionDuration = Date.now() - startTime;
        
        if (result.success && result.transcription) {
            // Handle successful transcription
            await transcriptionCompletedAction({
                audioFilePath,
                transcription: result.transcription,
                transcriptionDuration,
                stateUpdater,
                context
            });
        } else if (result.error) {
            // Handle transcription error
            await transcriptionErrorAction({
                error: result.error,
                stateUpdater,
                audioFilePath
            });
        }
    } catch (error) {
        logError('[RetryTranscriptionAction] Error retrying transcription:', error);
        showError(`Failed to retry transcription: ${error}`);
        stateUpdater.setTranscriptionState(TranscriptionState.ERROR);
    }
} 