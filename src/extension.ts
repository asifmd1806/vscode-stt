import * as vscode from 'vscode';
import { Readable } from 'stream';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Service Imports
import { FFmpegRecorderService, IRecorderService } from './services/ffmpegRecorderService';

// Provider Imports
import { TranscriptionProvider, OpenAIProvider, GroqProvider, ElevenLabsProvider, GoogleProvider } from './providers';

// View Imports
import { SttViewProvider } from './views/sttViewProvider';

// Action Imports
import { selectMicrophoneAction } from './actions/selectMicrophoneAction';
import { startRecordingAction } from './actions/startRecordingAction';
import { stopRecordingAction } from './actions/stopRecordingAction';
import { clearHistoryAction } from './actions/clearHistoryAction';
import { copyHistoryItemAction } from './actions/copyHistoryItemAction';

// Utility Imports
import { setupStatusBar } from './views/statusBarUtils';
import { getRecordingsDir, saveAudioToFile, listSavedRecordings, openRecordingsDirectory } from './utils/fileUtils';
import { initializeLogger, logInfo, logError, showError } from './utils/logger';
import { events } from './events';

// Import config functions
import { getTranscriptionProvider, getGeneralSetting, TranscriptionProvider as ProviderType } from './config/settings';

// --- Extension State --- 
// Services (initialized in activate)
let recorderService: IRecorderService;
let transcriptionProvider: TranscriptionProvider | null = null;

// UI Components (initialized in activate)
let sttViewProvider: SttViewProvider;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let statusBarDisposable: vscode.Disposable | null = null;

// --- State Management ---
enum RecordingState {
    READY = 'ready',
    RECORDING = 'recording',
    STOPPING = 'stopping'
}

enum TranscriptionState {
    IDLE = 'idle',
    TRANSCRIBING = 'transcribing',
    COMPLETED = 'completed',
    ERROR = 'error'
}

// Centralized State Store
class ExtensionState {
    private _recordingState: RecordingState = RecordingState.READY;
    private _transcriptionState: TranscriptionState = TranscriptionState.IDLE;
    private _currentAudioStream: Readable | null = null;
    private _selectedDeviceId: number | undefined = undefined;
    private _transcriptionHistory: { text: string; timestamp: number }[] = [];
    private _isRecordingDisposable: vscode.Disposable | null = null;
    private _context: vscode.ExtensionContext | null = null;
    private _recordingStartTime: number | null = null;
    private _recordingDurationInterval: NodeJS.Timeout | null = null;

    constructor() {}

    setContext(context: vscode.ExtensionContext) {
        this._context = context;
    }

    get recordingState(): RecordingState {
        return this._recordingState;
    }

    get transcriptionState(): TranscriptionState {
        return this._transcriptionState;
    }

    get currentAudioStream(): Readable | null {
        return this._currentAudioStream;
    }

    get selectedDeviceId(): number | undefined {
        return this._selectedDeviceId;
    }

    get transcriptionHistory(): { text: string; timestamp: number }[] {
        return [...this._transcriptionHistory];
    }

    setSelectedDeviceId(deviceId: number | undefined) {
        this._selectedDeviceId = deviceId;
        if (this._context && deviceId !== undefined) {
            this._context.globalState.update('selectedDeviceId', deviceId);
            this._context.globalState.update('hasSelectedMicrophone', true);
        }
        logInfo(`[Extension] Selected Device ID updated: ${deviceId}`);
        this.notifyStateChange();
    }

    setCurrentAudioStream(stream: Readable | null) {
        this._currentAudioStream = stream;
        logInfo(`[Extension] Audio stream ${stream ? 'set' : 'cleared'}`);
    }

    setRecordingState(state: RecordingState) {
        this._recordingState = state;
        logInfo(`[Extension] Recording state updated to: ${state}`);
        
        // Track recording duration
        if (state === RecordingState.RECORDING) {
            this._recordingStartTime = Date.now();
            this.startRecordingDurationTimer();
        } else {
            this.stopRecordingDurationTimer();
            this._recordingStartTime = null;
        }
        
        updateStatusBar();
        this.notifyStateChange();
    }

    setTranscriptionState(state: TranscriptionState) {
        this._transcriptionState = state;
        logInfo(`[Extension] Transcription state updated to: ${state}`);
        updateStatusBar();
        this.notifyStateChange();
    }

    addTranscriptionResult(text: string) {
        const newItem = { text, timestamp: Date.now() };
        this._transcriptionHistory.unshift(newItem);
        logInfo(`[Extension] Added to history. New length: ${this._transcriptionHistory.length}`);
        sttViewProvider?.addTranscriptionItem(text, newItem.timestamp);
        
        // Handle auto-copy and auto-insert
        this.handleTranscriptionActions(text);
        this.notifyStateChange();
    }

    clearTranscriptionHistory() {
        this._transcriptionHistory = [];
        logInfo("[Extension] Transcription history cleared.");
        sttViewProvider?.clearTranscriptionHistory();
        this.notifyStateChange();
    }

    setIsRecordingActive(isRecording: boolean) {
        try {
            const tempDisposable = this._isRecordingDisposable;
            this._isRecordingDisposable = null;
            
            vscode.commands.executeCommand('setContext', 'speechToTextStt.isRecordingActive', isRecording);
            logInfo(`[Extension] Recording context set to: ${isRecording}`);
            
            if (!isRecording && tempDisposable) {
                try {
                    tempDisposable.dispose();
                } catch (error) {
                    logError("[Extension] Error disposing recording context:", error);
                }
            }
        } catch (error) {
            logError("[Extension] Error in setIsRecordingActive:", error);
        }
    }

    async ensureMicrophoneSelected(): Promise<boolean> {
        if (!this._context) {
            logError('[Extension] Context not initialized');
            return false;
        }

        // Check if we have a valid selected device
        if (this._selectedDeviceId !== undefined) {
            // Verify the device still exists
            const devices = await recorderService.getAudioDevices();
            const deviceExists = devices.some(d => d.id === this._selectedDeviceId);
            if (deviceExists) {
                return true;
            }
            // Device no longer exists, clear selection
            this._selectedDeviceId = undefined;
            this._context.globalState.update('selectedDeviceId', undefined);
            this._context.globalState.update('hasSelectedMicrophone', false);
        }

        // Prompt for device selection
        return await this.promptMicrophoneSelection();
    }

    private async promptMicrophoneSelection(): Promise<boolean> {
        try {
            logInfo('[Extension] Prompting user to select microphone...');
            
            const devices = await recorderService.getAudioDevices();
            if (!devices || devices.length === 0 || devices[0].id === -1) {
                showError('No audio devices found. Please check your microphone connection.');
                return false;
            }

            // Show device selection dialog
            const items = devices.map(device => ({
                label: device.name,
                description: device.label,
                deviceId: device.id
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a microphone for Speech to Text',
                ignoreFocusOut: true
            });

            if (!selected) {
                logInfo('[Extension] User cancelled microphone selection');
                return false;
            }

            // Save the selected device
            this.setSelectedDeviceId(selected.deviceId);
            await recorderService.selectAudioDevice(selected.deviceId);
            
            logInfo(`[Extension] User selected microphone: ${selected.label} (ID: ${selected.deviceId})`);
            return true;

        } catch (error) {
            logError('[Extension] Error during microphone selection:', error);
            showError(`Failed to select microphone: ${error}`);
            return false;
        }
    }

    private handleTranscriptionActions(text: string) {
        // Auto-copy to clipboard
        if (getGeneralSetting('copyToClipboardAfterTranscription')) {
            vscode.env.clipboard.writeText(text);
            vscode.window.showInformationMessage('Transcription copied to clipboard');
        }

        // Auto-insert into editor
        if (getGeneralSetting('insertIntoEditorAfterTranscription')) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, text);
                });
            }
        }
    }

    async showTranscriptionProgress<T>(
        title: string,
        task: () => Promise<T>
    ): Promise<T | undefined> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: title,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Processing audio...' });
            
            try {
                const result = await task();
                progress.report({ increment: 100, message: 'Complete!' });
                return result;
            } catch (error) {
                logError('[Extension] Error during transcription:', error);
                throw error;
            }
        });
    }

    private notifyStateChange() {
        // Update view provider with current state
        if (sttViewProvider) {
            sttViewProvider.updateSelectedDevice(this._selectedDeviceId);
            sttViewProvider.updateTranscriptionHistory(this._transcriptionHistory);
        }
    }

    private startRecordingDurationTimer() {
        this.stopRecordingDurationTimer(); // Clear any existing timer
        
        this._recordingDurationInterval = setInterval(() => {
            if (this._recordingStartTime && statusBarItem) {
                const duration = Math.floor((Date.now() - this._recordingStartTime) / 1000);
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                statusBarItem.text = `$(record) Recording... ${timeStr}`;
            }
        }, 1000);
    }
    
    private stopRecordingDurationTimer() {
        if (this._recordingDurationInterval) {
            clearInterval(this._recordingDurationInterval);
            this._recordingDurationInterval = null;
        }
    }

    dispose() {
        if (this._isRecordingDisposable) {
            this._isRecordingDisposable.dispose();
        }
        this.stopRecordingDurationTimer();
    }
}

// Global state instance
const extensionState = new ExtensionState();

// --- State Update Proxy (for backward compatibility) ---
const stateUpdater = {
    setSelectedDeviceId: (deviceId: number | undefined) => extensionState.setSelectedDeviceId(deviceId),
    setCurrentAudioStream: (stream: Readable | null) => extensionState.setCurrentAudioStream(stream),
    setRecordingState: (state: RecordingState) => extensionState.setRecordingState(state),
    setTranscriptionState: (state: TranscriptionState) => extensionState.setTranscriptionState(state),
    addTranscriptionResult: (text: string) => extensionState.addTranscriptionResult(text),
    clearTranscriptionHistory: () => extensionState.clearTranscriptionHistory(),
    setIsRecordingActive: (isRecording: boolean) => extensionState.setIsRecordingActive(isRecording),
    ensureMicrophoneSelected: () => extensionState.ensureMicrophoneSelected()
};

// --- Status Bar Update Function ---
function updateStatusBar() {
    if (!statusBarItem) return;
    
    try {
        const recordingState = extensionState.recordingState;
        const transcriptionState = extensionState.transcriptionState;

        if (recordingState === RecordingState.RECORDING) {
            statusBarItem.text = '$(record) Recording...';
            statusBarItem.tooltip = 'Click to stop recording';
            statusBarItem.command = 'speech-to-text-stt.stopRecording';
        } else if (recordingState === RecordingState.STOPPING) {
            statusBarItem.text = '$(loading~spin) Stopping...';
            statusBarItem.tooltip = 'Stopping recording...';
            statusBarItem.command = undefined;
        } else if (transcriptionState === TranscriptionState.TRANSCRIBING) {
            statusBarItem.text = '$(sync~spin) Transcribing...';
            statusBarItem.tooltip = 'Transcribing audio...';
            statusBarItem.command = undefined;
        } else if (transcriptionState === TranscriptionState.ERROR) {
            statusBarItem.text = '$(error) STT Error';
            statusBarItem.tooltip = 'Error occurred - Click to try again';
            statusBarItem.command = 'speech-to-text-stt.startRecording';
        } else {
            // Ready state
            statusBarItem.text = '$(mic) STT';
            statusBarItem.tooltip = 'Speech to Text - Click to start recording';
            statusBarItem.command = 'speech-to-text-stt.startRecording';
        }
        
        statusBarItem.show();
    } catch (error) {
        logError('[Extension] Error updating status bar:', error);
    }
}

// --- Factory Function for Transcription Provider ---
function createTranscriptionProvider(providerName: ProviderType): TranscriptionProvider | null {
    logInfo(`[Extension] Attempting to create transcription provider: ${providerName}`);
    try {
        switch (providerName) {
            case 'elevenlabs':
                return new ElevenLabsProvider(outputChannel);
            case 'openai':
                return new OpenAIProvider(outputChannel);
            case 'groq':
                return new GroqProvider(outputChannel);
            case 'google':
                return new GoogleProvider(outputChannel);
            default:
                logError(`[Extension] Unknown provider name: ${providerName}`);
                return null;
        }
    } catch (error) {
        logError(`[Extension] Error instantiating provider ${providerName}:`, error);
        vscode.window.showErrorMessage(`Failed to initialize transcription provider for ${providerName}. See logs.`);
        return null;
    }
}

// --- Extension Activation --- 
export async function activate(context: vscode.ExtensionContext) {
    logInfo('Speech-to-Text extension is now active!');

    // Initialize state with context
    extensionState.setContext(context);

    // 1. Create Output Channel
    outputChannel = vscode.window.createOutputChannel("Speech To Text STT");
    context.subscriptions.push(outputChannel);
    
    // Initialize the logger
    initializeLogger(outputChannel);
    
    logInfo('Activating "speech-to-text-stt" extension...');

    // 2. Initialize Services
    recorderService = new FFmpegRecorderService();
    
    // Listen for recording state changes to handle failures
    recorderService.onRecordingStateChanged((isRecording) => {
        if (!isRecording && extensionState.recordingState === RecordingState.RECORDING) {
            // Recording stopped unexpectedly (could be due to failure)
            extensionState.setCurrentAudioStream(null);
            extensionState.setIsRecordingActive(false);
            extensionState.setRecordingState(RecordingState.READY);
            extensionState.setTranscriptionState(TranscriptionState.IDLE);
            
            // Check if device is still available
            if (extensionState.selectedDeviceId !== undefined) {
                recorderService.getAudioDevices().then(devices => {
                    const deviceExists = devices.some(d => d.id === extensionState.selectedDeviceId);
                    if (!deviceExists) {
                        // Device was disconnected, clear selection
                        extensionState.setSelectedDeviceId(undefined);
                        vscode.window.showWarningMessage('Microphone disconnected. Please select a new device.');
                    }
                });
            }
        }
    });
    
    logInfo("[Extension] Recorder service initialized.");

    // 3. Initialize Transcription Provider based on Configuration
    const providerName = getTranscriptionProvider();
    transcriptionProvider = createTranscriptionProvider(providerName);

    if (!transcriptionProvider) {
        showError("Failed to initialize any transcription provider. Please check logs and configuration.");
        logError("[Extension] Failed to create any transcription provider instance.");
    }
    logInfo(`[Extension] Transcription provider initialized for provider: ${providerName}`);

    // 4. Initialize Tree View Provider
    if (!transcriptionProvider) {
        showError("Cannot initialize view provider: No transcription provider available.");
        logError("[Extension] Failed to create SttViewProvider: No transcription provider available.");
    } else {
        sttViewProvider = new SttViewProvider(recorderService, transcriptionProvider);
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('sttView', sttViewProvider)
        );
        
        // Make the view visible by default
        vscode.commands.executeCommand('sttView.focus');
        
        logInfo("[Extension] TreeView provider registered.");
    }

    // 5. Setup Status Bar Item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);
    
    // Set initial status bar state
    updateStatusBar();
    
    // Setup status bar event handlers and store disposable
    statusBarDisposable = setupStatusBar(statusBarItem);
    if (statusBarDisposable) {
        context.subscriptions.push(statusBarDisposable);
    }
    
    logInfo("[Extension] Status bar item created.");

    // 6. Ensure Recordings Directory Exists
    getRecordingsDir(context);

    // 7. Restore selected device ID from global state
    const savedDeviceId = context.globalState.get<number>('selectedDeviceId');
    if (savedDeviceId !== undefined) {
        extensionState.setSelectedDeviceId(savedDeviceId);
        logInfo(`[Extension] Restored selected device ID: ${savedDeviceId}`);
    }

    // 8. Register Commands
    logInfo("[Extension] Registering commands...");

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.selectMicrophone', 
        () => selectMicrophoneAction({ recorderService, stateUpdater, context })
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.startRecording',
        () => startRecordingAction({ 
            recorderService, 
            stateUpdater,
            sttViewProvider,
            selectedDeviceId: extensionState.selectedDeviceId,
            recordingState: extensionState.recordingState,
            transcriptionState: extensionState.transcriptionState
        })
    ));

    // Register both stopRecording and stopRecordingAndTranscribe for compatibility
    const stopRecordingHandler = () => stopRecordingAction({ 
        recorderService, 
        transcriptionProvider,
        stateUpdater,
        sttViewProvider,
        selectedDeviceId: extensionState.selectedDeviceId,
        recordingState: extensionState.recordingState,
        transcriptionState: extensionState.transcriptionState,
        context,
        outputChannel
    });

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.stopRecording',
        stopRecordingHandler
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.stopRecordingAndTranscribe',
        stopRecordingHandler
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.clearHistory', 
        () => clearHistoryAction({ stateUpdater })
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.copyHistoryItem', 
        (item: { fullText: string } | string) => copyHistoryItemAction(item)
    ));

    // Register command to view saved recordings
    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.viewSavedRecordings',
        async () => {
            try {
                const recordings = await listSavedRecordings(context);
                
                if (recordings.length === 0) {
                    vscode.window.showInformationMessage('No saved recordings found.');
                    return;
                }
                
                interface RecordingQuickPickItem extends vscode.QuickPickItem {
                    recording?: {name: string, path: string, size: number, date: Date};
                    isDirectory?: boolean;
                }
                
                const items: RecordingQuickPickItem[] = recordings.map(rec => {
                    const sizeInMB = (rec.size / (1024 * 1024)).toFixed(2);
                    const date = rec.date.toLocaleString();
                    return {
                        label: rec.name,
                        description: `${date} (${sizeInMB} MB)`,
                        detail: rec.path,
                        recording: rec
                    };
                });
                
                items.push({
                    label: '$(folder) Open Recordings Directory',
                    description: 'Open the directory containing all recordings',
                    detail: 'Opens the file explorer to the recordings location',
                    isDirectory: true
                });
                
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select a recording to open',
                    matchOnDescription: true,
                    matchOnDetail: true
                });
                
                if (!selected) {
                    return;
                }
                
                if (selected.isDirectory) {
                    await openRecordingsDirectory(context);
                } else if (selected.recording) {
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(selected.recording.path));
                }
            } catch (error) {
                logError('[Extension] Error viewing saved recordings:', error);
                showError(`Failed to view recordings: ${error}`);
            }
        }
    ));

    // Set initial context for when clause
    extensionState.setIsRecordingActive(false);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('speech-to-text-stt.transcriptionProvider')) {
                const newProvider = getTranscriptionProvider();
                transcriptionProvider = createTranscriptionProvider(newProvider);
                if (transcriptionProvider && sttViewProvider) {
                    // Update the provider in the view
                    sttViewProvider = new SttViewProvider(recorderService, transcriptionProvider);
                    vscode.window.registerTreeDataProvider('sttView', sttViewProvider);
                }
                logInfo(`[Extension] Transcription provider changed to: ${newProvider}`);
            }
        })
    );

    // Emit extension activated event
    events.emit({
        type: 'extensionActivated',
        timestamp: Date.now()
    });

    logInfo('[Extension] Activation complete.');
}

// --- Extension Deactivation --- 
export function deactivate() {
    logInfo('Deactivating "speech-to-text-stt" extension.');
    
    try {
        // Stop recording if active
        if (recorderService?.isRecording) {
            try {
                recorderService.stopRecording();
                logInfo('[Extension] Stopped recording during deactivation.');
            } catch (error) {
                logError('[Extension] Error stopping recording during deactivation:', error);
            }
        }
        
        // Dispose extension state
        extensionState.dispose();
        
        // Dispose status bar and its event listeners
        if (statusBarDisposable) {
            try {
                statusBarDisposable.dispose();
                logInfo('[Extension] Status bar event listeners cleaned up.');
            } catch (error) {
                logError('[Extension] Error disposing status bar event listeners:', error);
            }
        }
        
        if (statusBarItem) {
            try {
                statusBarItem.dispose();
                logInfo('[Extension] Status bar disposed.');
            } catch (error) {
                logError('[Extension] Error disposing status bar:', error);
            }
        }
        
        if (outputChannel) {
            try {
                outputChannel.dispose();
                logInfo('[Extension] Output channel disposed.');
            } catch (error) {
                logError('[Extension] Error disposing output channel:', error);
            }
        }
        
        // Clear context key - do this last
        try {
            vscode.commands.executeCommand('setContext', 'speechToTextStt.isRecordingActive', undefined);
            logInfo('[Extension] Recording context key cleared.');
        } catch (error) {
            logError('[Extension] Error clearing context key:', error);
        }

        // Emit extension deactivated event
        events.emit({
            type: 'extensionDeactivated',
            timestamp: Date.now()
        });
        
        logInfo('[Extension] Deactivation complete.');
    } catch (error) {
        logError('[Extension] Error during deactivation:', error);
        events.emit({
            type: 'extensionError',
            error: error instanceof Error ? error : new Error(String(error)),
            timestamp: Date.now()
        });
    }
} 