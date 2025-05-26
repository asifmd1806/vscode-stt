import * as vscode from 'vscode';
import { Readable } from 'stream';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Service Imports
import { FFmpegRecorderService, IRecorderService } from './services/ffmpegRecorderService';

// Provider Imports
import { TranscriptionProvider, OpenAIProvider, GroqProvider, ElevenLabsProvider } from './providers';

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

// Runtime State
let currentAudioStream: Readable | null = null;
let selectedDeviceId: number | undefined = undefined;
let transcriptionHistory: { text: string; timestamp: number }[] = [];
let isRecordingDisposable: vscode.Disposable | null = null;
let audioChunks: Buffer[] = [];
let isTranscribing: boolean = false;

// --- State Update Proxy (Centralized updates and UI triggers) ---
const stateUpdater = {
    setSelectedDeviceId: (deviceId: number | undefined) => {
        selectedDeviceId = deviceId;
        console.log(`[Extension] Selected Device ID updated: ${deviceId}`);
    },
    setCurrentAudioStream: (stream: Readable | null) => {
        currentAudioStream = stream;
        console.log(`[Extension] Audio stream ${stream ? 'set' : 'cleared'}`);
    },
    setIsTranscribing: (transcribing: boolean) => {
        isTranscribing = transcribing;
    },
    addTranscriptionResult: (text: string) => {
        const newItem = { text, timestamp: Date.now() };
        transcriptionHistory.unshift(newItem);
        console.log(`[Extension] Added to history. New length: ${transcriptionHistory.length}`);
        sttViewProvider?.refreshHistory();
    },
    clearTranscriptionHistory: () => {
        transcriptionHistory = [];
        console.log("[Extension] Transcription history cleared.");
        sttViewProvider?.refreshHistory();
    },
    setIsRecordingActive: (isRecording: boolean) => {
        try {
            const tempDisposable = isRecordingDisposable;
            isRecordingDisposable = null;
            
            vscode.commands.executeCommand('setContext', 'speechToTextStt.isRecordingActive', isRecording);
            console.log(`[Extension] Recording context set to: ${isRecording}`);
            
            if (!isRecording && tempDisposable) {
                try {
                    tempDisposable.dispose();
                } catch (error) {
                    console.error("[Extension] Error disposing recording context:", error);
                }
            }
        } catch (error) {
            console.error("[Extension] Error in setIsRecordingActive:", error);
        }
    }
};

// --- Factory Function for Transcription Provider ---
function createTranscriptionProvider(providerName: ProviderType): TranscriptionProvider | null {
    console.log(`[Extension] Attempting to create transcription provider: ${providerName}`);
    try {
        switch (providerName) {
            case 'elevenlabs':
                return new ElevenLabsProvider(outputChannel);
            case 'openai':
                return new OpenAIProvider(outputChannel);
            case 'groq':
                return new GroqProvider(outputChannel);
            default:
                console.warn(`[Extension] Unknown provider name encountered in factory: ${providerName}`);
                return null;
        }
    } catch (error) {
        console.error(`[Extension] Error instantiating provider ${providerName}:`, error);
        vscode.window.showErrorMessage(`Failed to initialize transcription provider for ${providerName}. See logs.`);
        return null;
    }
}

// --- Extension Activation --- 
export async function activate(context: vscode.ExtensionContext) {
    logInfo('Speech-to-Text extension is now active!');

    // 1. Create Output Channel
    outputChannel = vscode.window.createOutputChannel("Speech To Text STT");
    context.subscriptions.push(outputChannel);
    
    // Initialize the logger
    initializeLogger(outputChannel);
    
    logInfo('Activating "speech-to-text-stt" extension...');

    // 2. Initialize Services
    recorderService = new FFmpegRecorderService();
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
        logInfo("[Extension] TreeView provider registered.");
    }

    // 5. Setup Status Bar Item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);
    
    // Setup status bar event handlers and store disposable
    statusBarDisposable = setupStatusBar(statusBarItem);
    if (statusBarDisposable) {
        context.subscriptions.push(statusBarDisposable);
    }
    
    // Add hover menu for status bar
    context.subscriptions.push(
        vscode.commands.registerCommand('speech-to-text-stt.statusBarHover', async () => {
            if (!recorderService.isRecording) {
                const items = [
                    {
                        label: 'Select Microphone',
                        command: 'speech-to-text-stt.selectMicrophone'
                    }
                ];
                
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select an action'
                });
                
                if (selected) {
                    vscode.commands.executeCommand(selected.command);
                }
            }
        })
    );
    
    statusBarItem.show();
    logInfo("[Extension] Status bar item created.");

    // 6. Ensure Recordings Directory Exists
    getRecordingsDir(context);

    // 7. Register Commands
    logInfo("[Extension] Registering commands...");

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.selectMicrophone', 
        () => selectMicrophoneAction({ recorderService, stateUpdater })
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.startRecording',
        () => startRecordingAction({ 
            recorderService, 
            stateUpdater,
            sttViewProvider,
            selectedDeviceId,
            isTranscribing
        })
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.stopRecording',
        () => stopRecordingAction({ 
            recorderService, 
            transcriptionProvider,
            stateUpdater,
            sttViewProvider,
            selectedDeviceId,
            isTranscribing,
            context,
            outputChannel
        })
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
    stateUpdater.setIsRecordingActive(false);

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
        
        // Store and nullify isRecordingDisposable reference to prevent recursion
        const tempDisposable = isRecordingDisposable;
        isRecordingDisposable = null;
        
        // Dispose context setter if exists
        if (tempDisposable) {
            try {
                tempDisposable.dispose();
                logInfo('[Extension] Recording disposable cleaned up.');
            } catch (error) {
                logError('[Extension] Error disposing recording disposable:', error);
            }
        }
        
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
        console.error('[Extension] Error during deactivation:', error);
        events.emit({
            type: 'extensionError',
            error: error instanceof Error ? error : new Error(String(error)),
            timestamp: Date.now()
        });
    }
} 