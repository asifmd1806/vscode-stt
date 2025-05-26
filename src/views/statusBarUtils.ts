import * as vscode from 'vscode';
import { IRecorderService } from '../services/ffmpegRecorderService';
import { TranscriptionProvider } from '../providers/baseProvider';
import { FFmpegRecorderService, AudioDeviceInfo } from '../services/ffmpegRecorderService';
import { logInfo, logError } from '../utils/logger';
import { events } from '../events';
import { SttEvent } from '../events/types';

let statusBarItem: vscode.StatusBarItem;
let statusBarDisposable: vscode.Disposable | null = null;

export function createStatusBarItem(): vscode.StatusBarItem {
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );

    // Set initial state
    statusBarItem.text = '$(mic) STT';
    statusBarItem.tooltip = 'Speech to Text';
    statusBarItem.command = 'speech-to-text-stt.showCommands';

    // Event handler for all status bar updates
    const handleEvent = (event: SttEvent) => {
        switch (event.type) {
            case 'extensionActivated':
                statusBarItem.text = '$(mic) STT';
                statusBarItem.tooltip = 'Speech to Text';
                break;

            case 'extensionDeactivated':
                statusBarItem.text = '$(mic) STT';
                statusBarItem.tooltip = 'Speech to Text';
                break;

            case 'microphoneSelected':
                statusBarItem.text = '$(mic) STT';
                statusBarItem.tooltip = 'Speech to Text';
                break;

            case 'recordingStarted':
                statusBarItem.text = '$(record) Recording...';
                statusBarItem.tooltip = 'Click to stop recording';
                statusBarItem.command = 'speech-to-text-stt.stopRecording';
                break;

            case 'recordingStopped':
                statusBarItem.text = '$(mic) STT';
                statusBarItem.tooltip = 'Speech to Text';
                statusBarItem.command = 'speech-to-text-stt.showCommands';
                break;

            case 'transcriptionStarted':
                statusBarItem.text = '$(sync~spin) Transcribing...';
                statusBarItem.tooltip = 'Transcribing audio...';
                break;

            case 'transcriptionCompleted':
                statusBarItem.text = '$(mic) STT';
                statusBarItem.tooltip = 'Speech to Text';
                statusBarItem.command = 'speech-to-text-stt.showCommands';
                break;

            case 'transcriptionError':
                statusBarItem.text = '$(error) STT Error';
                statusBarItem.tooltip = 'Transcription failed';
                statusBarItem.command = 'speech-to-text-stt.showCommands';
                break;

            case 'extensionError':
                statusBarItem.text = '$(error) STT Error';
                statusBarItem.tooltip = 'Extension error';
                statusBarItem.command = 'speech-to-text-stt.showCommands';
                break;
        }
    };

    // Subscribe to all relevant events
    events.subscribe('extensionActivated', handleEvent);
    events.subscribe('extensionDeactivated', handleEvent);
    events.subscribe('microphoneSelected', handleEvent);
    events.subscribe('recordingStarted', handleEvent);
    events.subscribe('recordingStopped', handleEvent);
    events.subscribe('transcriptionStarted', handleEvent);
    events.subscribe('transcriptionCompleted', handleEvent);
    events.subscribe('transcriptionError', handleEvent);
    events.subscribe('extensionError', handleEvent);

    // Create disposable to clean up subscriptions
    statusBarDisposable = {
        dispose: () => {
            events.unsubscribe('extensionActivated', handleEvent);
            events.unsubscribe('extensionDeactivated', handleEvent);
            events.unsubscribe('microphoneSelected', handleEvent);
            events.unsubscribe('recordingStarted', handleEvent);
            events.unsubscribe('recordingStopped', handleEvent);
            events.unsubscribe('transcriptionStarted', handleEvent);
            events.unsubscribe('transcriptionCompleted', handleEvent);
            events.unsubscribe('transcriptionError', handleEvent);
            events.unsubscribe('extensionError', handleEvent);
        }
    };

    return statusBarItem;
}

export function disposeStatusBarItem(): void {
    if (statusBarDisposable) {
        statusBarDisposable.dispose();
        statusBarDisposable = null;
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

// Define the arguments needed for updating the status bar
interface StatusBarUpdateArgs {
    statusBarItem: vscode.StatusBarItem;
    recorderService: IRecorderService;
    selectedDeviceId?: number;
    isTranscribing?: boolean;
}

/**
 * Updates the status bar item based on the current recording state and selected device.
 */
export async function updateStatusBar({ 
    statusBarItem, 
    recorderService, 
    selectedDeviceId,
    isTranscribing = false 
}: StatusBarUpdateArgs): Promise<void> {
    try {
        if (recorderService.isRecording) {
            statusBarItem.text = "$(mic-filled) Recording...";
            statusBarItem.tooltip = "Click to stop recording";
            statusBarItem.command = 'speech-to-text-stt.stopRecording';
        } else if (isTranscribing) {
            statusBarItem.text = "$(sync~spin) Transcribing...";
            statusBarItem.tooltip = "Transcribing audio...";
            statusBarItem.command = undefined;
        } else {
            const devices = await recorderService.getAudioDevices();
            const currentDevice = devices.find((d: AudioDeviceInfo) => d.id === selectedDeviceId);
            const deviceName = currentDevice ? currentDevice.label || currentDevice.name : "Default Microphone";
            
            statusBarItem.text = "$(mic) Ready";
            statusBarItem.tooltip = `Current device: ${deviceName}\nClick to start recording`;
            statusBarItem.command = 'speech-to-text-stt.startRecording';
        }
        
        statusBarItem.show();
    } catch (error) {
        logError('[StatusBar] Error updating status:', error);
        // Fallback to a basic state if there's an error
        statusBarItem.text = "$(mic) Speech-to-Text";
        statusBarItem.tooltip = "Click to start recording";
        statusBarItem.command = 'speech-to-text-stt.startRecording';
        statusBarItem.show();
    }
}

export function setupStatusBar(statusBarItem: vscode.StatusBarItem): vscode.Disposable {
    // Create a disposable to clean up event listeners
    const disposables: vscode.Disposable[] = [];

    // Helper to safely update status bar
    const updateStatusBar = (text: string, tooltip: string, command?: string) => {
        try {
            statusBarItem.text = text;
            statusBarItem.tooltip = tooltip;
            statusBarItem.command = command;
            statusBarItem.show();
        } catch (error) {
            logError('[StatusBar] Error updating status:', error);
        }
    };

    // Event handler for all status bar updates
    const eventHandler = (event: SttEvent) => {
        switch (event.type) {
            case 'recordingStarted':
                updateStatusBar(
                    `$(mic) Recording...`,
                    `Recording from ${event.deviceName}`,
                    'speech-to-text-stt.stopRecording'
                );
                break;

            case 'recordingStopped':
                updateStatusBar(
                    `$(mic) Ready`,
                    `Last recording: ${event.duration}ms`,
                    'speech-to-text-stt.startRecording'
                );
                break;

            case 'transcriptionStarted':
                updateStatusBar(
                    `$(sync~spin) Transcribing...`,
                    'Transcribing audio...'
                );
                break;

            case 'transcriptionCompleted':
                updateStatusBar(
                    `$(check) Transcribed`,
                    `Transcription took ${event.duration}ms`,
                    'speech-to-text-stt.startRecording'
                );
                break;

            case 'extensionError':
                updateStatusBar(
                    `$(error) Error`,
                    event.error.message,
                    'speech-to-text-stt.startRecording'
                );
                break;

            case 'microphoneSelected':
                updateStatusBar(
                    `$(mic) Ready`,
                    `Selected: ${event.deviceName}`,
                    'speech-to-text-stt.startRecording'
                );
                break;
        }
    };

    // Subscribe to all relevant events
    events.subscribe('recordingStarted', eventHandler);
    events.subscribe('recordingStopped', eventHandler);
    events.subscribe('transcriptionStarted', eventHandler);
    events.subscribe('transcriptionCompleted', eventHandler);
    events.subscribe('extensionError', eventHandler);
    events.subscribe('microphoneSelected', eventHandler);

    // Create disposable to clean up subscriptions
    const eventDisposable = {
        dispose: () => {
            events.unsubscribe('recordingStarted', eventHandler);
            events.unsubscribe('recordingStopped', eventHandler);
            events.unsubscribe('transcriptionStarted', eventHandler);
            events.unsubscribe('transcriptionCompleted', eventHandler);
            events.unsubscribe('extensionError', eventHandler);
            events.unsubscribe('microphoneSelected', eventHandler);
        }
    };

    // Add event handler to disposables
    disposables.push(eventDisposable);

    // Return a disposable that cleans up all event listeners
    return vscode.Disposable.from(...disposables);
} 