import * as vscode from 'vscode';
import { eventManager } from '../events/eventManager';
import { EventType, MicrophoneSelectedEvent, AppEvent } from '../events/events';
import { logInfo, logError } from './logger'; // Assuming logger is available

// --- Module State ---
let currentStatusBarItem: vscode.StatusBarItem | null = null;
let currentSelectedDeviceId: number | string | undefined = undefined; // Store last known device ID
let currentRecordingState: boolean = false; // Store last known recording state

// --- Private Utility to Update Status Bar ---
function _updateStatusBarDisplay(): void {
    if (!currentStatusBarItem) {
        logError("[StatusBar] Status bar item not initialized.");
        return;
    }

    const deviceDisplay = currentSelectedDeviceId === undefined || currentSelectedDeviceId === -1 ? 
                          'Default' : 
                          `Device ${currentSelectedDeviceId}`;

    if (currentRecordingState) {
        currentStatusBarItem.text = `$(debug-pause) STT: Recording...`;
        currentStatusBarItem.tooltip = `Speech-to-Text is recording (${deviceDisplay}). Click to stop.`;
        currentStatusBarItem.command = 'speech-to-text-stt.stopRecordingAndTranscribe';
        currentStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else {
        currentStatusBarItem.text = `$(record) STT: Idle`;
        currentStatusBarItem.tooltip = `Speech-to-Text is idle (${deviceDisplay}). Click to start recording.`;
        currentStatusBarItem.command = 'speech-to-text-stt.startRecording';
        currentStatusBarItem.backgroundColor = undefined;
    }
    currentStatusBarItem.show();
    logInfo(`[StatusBar] Updated: Recording=${currentRecordingState}, Device=${deviceDisplay}, Text='${currentStatusBarItem.text}'`);
}

// --- Event Handlers ---
function handleRecordingStarted(): void {
    logInfo("[StatusBar] Event: RecordingStarted received.");
    currentRecordingState = true;
    _updateStatusBarDisplay();
}

function handleRecordingStopped(): void {
    logInfo("[StatusBar] Event: RecordingStopped received.");
    currentRecordingState = false;
    _updateStatusBarDisplay();
}

function handleMicrophoneSelected(event: AppEvent): void {
    const micEvent = event as MicrophoneSelectedEvent;
    logInfo(`[StatusBar] Event: MicrophoneSelected received. Device ID: ${micEvent.deviceId}`);
    currentSelectedDeviceId = micEvent.deviceId;
    // Recording state doesn't change here, but tooltip (device) does.
    _updateStatusBarDisplay(); 
}

// --- Public Initialization and Control ---
/**
 * Initializes the status bar utility. 
 * Must be called once during extension activation.
 */
export function initializeStatusBar(statusBarItem: vscode.StatusBarItem): vscode.Disposable[] {
    if (!statusBarItem) {
        logError("[StatusBar] Initialization failed: StatusBarItem is null.");
        throw new Error("StatusBarItem cannot be null for initialization.");
    }
    currentStatusBarItem = statusBarItem;
    logInfo("[StatusBar] Initialized and subscriptions set up.");

    // Set initial state (assuming not recording and default device)
    currentRecordingState = false; 
    currentSelectedDeviceId = undefined; // Start with default
    _updateStatusBarDisplay();

    // Subscribe to events
    const subscriptions: vscode.Disposable[] = [
        eventManager.subscribe(EventType.RecordingStarted, handleRecordingStarted),
        eventManager.subscribe(EventType.RecordingStopped, handleRecordingStopped),
        eventManager.subscribe(EventType.MicrophoneSelected, handleMicrophoneSelected)
    ];
    
    return subscriptions;
}

/**
 * Updates the status bar based on explicit state.
 * This function can be used for initial setup or forceful updates if needed,
 * but event-driven updates are preferred.
 */
export function updateStatusBar(
    statusBarItem: vscode.StatusBarItem, 
    isRecording: boolean, 
    selectedDeviceId?: number | string | undefined
): void {
    currentStatusBarItem = statusBarItem; // Ensure currentStatusBarItem is set
    currentRecordingState = isRecording;
    currentSelectedDeviceId = selectedDeviceId;
    _updateStatusBarDisplay();
}