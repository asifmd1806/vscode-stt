import * as vscode from 'vscode';
import { logInfo, logError } from '../utils/logger';

export class ContextService {
    private isRecordingDisposable: vscode.Disposable | null = null;

    setIsRecordingActive(isRecording: boolean): void {
        try {
            const tempDisposable = this.isRecordingDisposable;
            this.isRecordingDisposable = null;
            
            vscode.commands.executeCommand('setContext', 'speechToTextStt.isRecordingActive', isRecording);
            logInfo(`[ContextService] Recording context set to: ${isRecording}`);
            
            if (!isRecording && tempDisposable) {
                try {
                    tempDisposable.dispose();
                } catch (error) {
                    logError("[ContextService] Error disposing recording context:", error);
                }
            }
        } catch (error) {
            logError("[ContextService] Error in setIsRecordingActive:", error);
        }
    }

    clearContext(): void {
        try {
            vscode.commands.executeCommand('setContext', 'speechToTextStt.isRecordingActive', undefined);
            logInfo('[ContextService] Recording context key cleared.');
        } catch (error) {
            logError('[ContextService] Error clearing context key:', error);
        }
    }

    dispose(): void {
        if (this.isRecordingDisposable) {
            this.isRecordingDisposable.dispose();
        }
    }
} 