import * as vscode from 'vscode';
import { RecordingState, TranscriptionState } from '../types/states';
import { ExtensionStateData, StateManager } from '../state/types';
import { logError } from '../utils/logger';

export class StatusBarView implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private recordingTimer?: NodeJS.Timeout;
    private stateListener: (state: ExtensionStateData) => void;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly stateManager: StateManager
    ) {
        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.context.subscriptions.push(this.statusBarItem);

        // Create state listener
        this.stateListener = this.handleStateChange.bind(this);
        this.stateManager.onStateChange(this.stateListener);

        // Initial update
        this.update(this.stateManager.getState());
    }

    private handleStateChange(state: ExtensionStateData): void {
        this.update(state);
    }

    private update(state: ExtensionStateData): void {
        try {
            const { recordingState, transcriptionState, recordingStartTime } = state;

            // Handle recording timer
            if (recordingState === RecordingState.RECORDING && recordingStartTime) {
                this.startRecordingTimer(recordingStartTime);
            } else {
                this.stopRecordingTimer();
            }

            // Update status bar based on state
            if (recordingState === RecordingState.RECORDING) {
                this.statusBarItem.text = '$(record) Recording...';
                this.statusBarItem.tooltip = 'Click to stop recording';
                this.statusBarItem.command = 'speech-to-text-stt.stopRecording';
            } else if (recordingState === RecordingState.STOPPING) {
                this.statusBarItem.text = '$(loading~spin) Stopping...';
                this.statusBarItem.tooltip = 'Stopping recording...';
                this.statusBarItem.command = undefined;
            } else if (transcriptionState === TranscriptionState.TRANSCRIBING) {
                this.statusBarItem.text = '$(sync~spin) Transcribing...';
                this.statusBarItem.tooltip = 'Transcribing audio...';
                this.statusBarItem.command = undefined;
            } else if (transcriptionState === TranscriptionState.ERROR) {
                this.statusBarItem.text = '$(error) STT Error';
                this.statusBarItem.tooltip = 'Error occurred - Click to try again';
                this.statusBarItem.command = 'speech-to-text-stt.startRecording';
            } else if (transcriptionState === TranscriptionState.COMPLETED) {
                this.statusBarItem.text = '$(check) STT Ready';
                this.statusBarItem.tooltip = 'Transcription completed - Click to start recording';
                this.statusBarItem.command = 'speech-to-text-stt.startRecording';
                // Reset to idle after 2 seconds
                setTimeout(() => {
                    if (this.stateManager.getState().transcriptionState === TranscriptionState.COMPLETED) {
                        this.update(this.stateManager.getState());
                    }
                }, 2000);
            } else {
                // Ready/Idle state
                this.statusBarItem.text = '$(mic) STT';
                this.statusBarItem.tooltip = 'Speech to Text - Click to start recording';
                this.statusBarItem.command = 'speech-to-text-stt.startRecording';
            }

            this.statusBarItem.show();
        } catch (error) {
            logError('[StatusBarView] Error updating status bar:', error);
        }
    }

    private startRecordingTimer(startTime: number): void {
        // Clear existing timer if any
        this.stopRecordingTimer();

        // Update immediately
        this.updateRecordingDuration(startTime);

        // Then update every second
        this.recordingTimer = setInterval(() => {
            this.updateRecordingDuration(startTime);
        }, 1000);
    }

    private updateRecordingDuration(startTime: number): void {
        const duration = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        this.statusBarItem.text = `$(record) Recording... ${timeStr}`;
    }

    private stopRecordingTimer(): void {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = undefined;
        }
    }

    dispose(): void {
        this.stopRecordingTimer();
        this.stateManager.removeStateChangeListener(this.stateListener);
        this.statusBarItem.dispose();
    }
} 