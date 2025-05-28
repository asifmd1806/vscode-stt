import * as vscode from 'vscode';
import { TranscriptionProvider } from '../providers/baseProvider';
import { logInfo, logError } from '../utils/logger';
import { events } from '../events';
import { TranscriptionState } from '../types/states';

interface TranscriptionStartedActionArgs {
    audioFilePath: string;
    transcriptionProvider: TranscriptionProvider;
    stateUpdater: {
        setTranscriptionState: (state: TranscriptionState) => void;
    };
}

/**
 * Action to start transcription process
 * Emits transcriptionStarted event and updates UI state
 */
export async function transcriptionStartedAction({
    audioFilePath,
    transcriptionProvider,
    stateUpdater
}: TranscriptionStartedActionArgs): Promise<{ success: boolean; transcription?: string; error?: Error }> {
    try {
        logInfo(`[TranscriptionStartedAction] Starting transcription for file: ${audioFilePath}`);
        
        // Update UI state
        stateUpdater.setTranscriptionState(TranscriptionState.TRANSCRIBING);
        
        // Emit transcriptionStarted event
        events.emit({
            type: 'transcriptionStarted',
            audioFilePath: audioFilePath,
            timestamp: Date.now()
        });
        
        // Start transcription
        const startTime = Date.now();
        logInfo('[TranscriptionStartedAction] Calling transcription provider...');
        const transcription = await transcriptionProvider.transcribeFile(audioFilePath);
        const transcriptionDuration = Date.now() - startTime;
        
        logInfo(`[TranscriptionStartedAction] Transcription completed in ${transcriptionDuration}ms`);
        
        if (transcription) {
            return { 
                success: true, 
                transcription 
            };
        } else {
            const error = new Error('No transcription result returned from provider');
            logError('[TranscriptionStartedAction] Transcription failed:', error);
            return { 
                success: false, 
                error 
            };
        }
    } catch (error) {
        logError('[TranscriptionStartedAction] Transcription error:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error : new Error(String(error))
        };
    }
} 