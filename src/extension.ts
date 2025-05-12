import * as vscode from 'vscode';
import { Readable } from 'stream';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Service Imports
import { RecorderService, AudioDeviceInfo, IRecorderService } from './services/recorderService';
import { TranscriptionService } from './services/transcriptionService';
import { ElevenLabsTranscriptionService } from './services/elevenLabsTranscriptionService';
import { OpenAIWhisperTranscriptionService } from './services/openaiWhisperTranscriptionService';
import { GroqWhisperTranscriptionService } from './services/groqWhisperTranscriptionService';
import { FFmpegRecorderService } from './services/ffmpegRecorderService';

// View Imports (Placeholder - To be created)
import { SttViewProvider } from './views/sttViewProvider'; 

// Action Imports (Placeholders - To be created)
import { selectMicrophoneAction } from './actions/selectMicrophoneAction';
import { startRecordingAction } from './actions/startRecordingAction';
import { stopRecordingAction } from './actions/stopRecordingAction';
import { clearHistoryAction } from './actions/clearHistoryAction';
import { copyHistoryItemAction } from './actions/copyHistoryItemAction';

// Utility Imports (Placeholders - To be created)
import { updateStatusBar } from './utils/statusBarUtils';
import { getRecordingsDir, saveAudioToFile, listSavedRecordings, openRecordingsDirectory } from './utils/fileUtils';
import { initializeLogger, logInfo, logError, showError } from './utils/logger';

// Import config functions
import { getTranscriptionProvider, getGeneralSetting, TranscriptionProvider } from './config/settings';

// --- Extension State --- 
// Services (initialized in activate)
let recorderService: IRecorderService;
let transcriptionService: TranscriptionService | null = null;

// UI Components (initialized in activate)
let sttViewProvider: SttViewProvider;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

// Runtime State
let currentAudioStream: Readable | null = null;
let selectedDeviceId: number | undefined = undefined; // Undefined means default
let transcriptionHistory: { text: string; timestamp: number }[] = [];
let isRecordingDisposable: vscode.Disposable | null = null; // To manage recording context
let audioChunks: Buffer[] = [];

// --- State Update Proxy (Centralized updates and UI triggers) ---
const stateUpdater = {
    setSelectedDeviceId: (deviceId: number | undefined) => {
        selectedDeviceId = deviceId;
        console.log(`[Extension] Selected Device ID updated: ${deviceId}`);
        // Wrap call to pass required arguments
        updateStatusBar({ statusBarItem, recorderService, selectedDeviceId }); 
        sttViewProvider?.updateSelectedDevice(deviceId);
    },
    setCurrentAudioStream: (stream: Readable | null) => {
        currentAudioStream = stream;
        console.log(`[Extension] Audio stream ${stream ? 'set' : 'cleared'}`);
    },
    addTranscriptionResult: (text: string) => {
        const newItem = { text, timestamp: Date.now() };
        // Add to the beginning of the array (newest first)
        transcriptionHistory.unshift(newItem); 
        console.log(`[Extension] Added to history. New length: ${transcriptionHistory.length}`);
        // Limit history size if needed (e.g., keep last 50)
        // if (transcriptionHistory.length > 50) { transcriptionHistory.pop(); }
        sttViewProvider?.refreshHistory(); // Refresh TreeView
    },
    clearTranscriptionHistory: () => {
        transcriptionHistory = [];
        console.log("[Extension] Transcription history cleared.");
        sttViewProvider?.refreshHistory(); // Refresh TreeView
    },
    // This manages the 'when' clause context for keybindings/menus
    setIsRecordingActive: (isRecording: boolean) => {
        try {
            // Store the disposable reference temporarily to prevent recursive self-disposal
            const tempDisposable = isRecordingDisposable;
            isRecordingDisposable = null; // Clear before calling setContext to avoid recursion
            
            // Set the VS Code context for when-clause
            vscode.commands.executeCommand('setContext', 'speechToTextStt.isRecordingActive', isRecording);
            console.log(`[Extension] Recording context set to: ${isRecording}`);
            
            // Only dispose the previous disposable if setting to false and there was one
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

// --- Factory Function for Transcription Service ---
function createTranscriptionService(providerName: TranscriptionProvider): TranscriptionService | null {
    console.log(`[Extension] Attempting to create transcription service for provider: ${providerName}`);
    try {
        switch (providerName) {
            case 'elevenlabs':
                return new ElevenLabsTranscriptionService();
            case 'openai':
                return new OpenAIWhisperTranscriptionService();
            case 'groq':
                return new GroqWhisperTranscriptionService();
            default:
                // Should not happen due to type checking, but handle defensively
                 console.warn(`[Extension] Unknown provider name encountered in factory: ${providerName}`);
                 return null;
        }
    } catch (error) {
         console.error(`[Extension] Error instantiating service for provider ${providerName}:`, error);
         vscode.window.showErrorMessage(`Failed to initialize transcription service for ${providerName}. See logs.`);
        return null;
    }
}

// --- Extension Activation --- 
export function activate(context: vscode.ExtensionContext) {
    // 1. Create Output Channel
    outputChannel = vscode.window.createOutputChannel("Speech To Text STT");
    context.subscriptions.push(outputChannel);
    // Initialize the logger HERE
    initializeLogger(outputChannel);
    
    logInfo('Activating "speech-to-text-stt" extension...');

    // 2. Initialize Services
    recorderService = new FFmpegRecorderService();
    logInfo("[Extension] Recorder service initialized.");

    // 2. Initialize Transcription Service based on Configuration
    const providerName = getTranscriptionProvider(); // Use function from config/settings
    transcriptionService = createTranscriptionService(providerName);

    if (!transcriptionService) {
        // Use showError to log AND notify user
        showError("Failed to initialize any transcription service. Please check logs and configuration.");
        logError("[Extension] Failed to create any transcription service instance.");
    }
    logInfo(`[Extension] Transcription service initialized for provider: ${providerName}`);

    // 3. Initialize Tree View Provider
    // Pass state and update functions to the view provider
    sttViewProvider = new SttViewProvider(recorderService, transcriptionHistory, stateUpdater.setSelectedDeviceId);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('sttView', sttViewProvider)
    );
    logInfo("[Extension] TreeView provider registered.");

    // 4. Setup Status Bar Item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);
    // Initial status bar update (will show default/loading state)
    updateStatusBar({ statusBarItem, recorderService, selectedDeviceId }); 
    statusBarItem.show();
    logInfo("[Extension] Status bar item created.");

    // 5. Ensure Recordings Directory Exists
    getRecordingsDir(context); // Call utility to create if needed

    // 6. Register Commands (linking actions to UI)
    logInfo("[Extension] Registering commands...");

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.selectMicrophone', 
        () => selectMicrophoneAction({ recorderService, stateUpdater })
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.startRecording', 
        () => {
            isRecordingDisposable = startRecordingAction({ 
                recorderService, 
                stateUpdater,
                selectedDeviceId: selectedDeviceId,
                sttViewProvider, 
                updateStatusBar: () => updateStatusBar({ statusBarItem, recorderService, selectedDeviceId }),
                audioChunks
            });
            if (isRecordingDisposable) {
                context.subscriptions.push(isRecordingDisposable);
            }
        }
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        'speech-to-text-stt.stopRecordingAndTranscribe', 
        () => {
             if (!transcriptionService) {
                vscode.window.showErrorMessage("Transcription service is not available. Please check configuration and logs.");
                return;
             }
            stopRecordingAction({ 
                recorderService, 
                transcriptionService, 
                stateUpdater: {
                    ...stateUpdater,
                    getCurrentAudioStream: () => currentAudioStream 
                },
                outputChannel, 
                sttViewProvider, 
                context, 
                updateStatusBar: () => updateStatusBar({ statusBarItem, recorderService, selectedDeviceId }),
                audioChunks
            });
        }
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
                
                // Define an interface for our quick pick items
                interface RecordingQuickPickItem extends vscode.QuickPickItem {
                    recording?: {name: string, path: string, size: number, date: Date};
                    isDirectory?: boolean;
                }
                
                // Format recording items for the quick pick
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
                
                // Add an option to open recordings directory
                items.push({
                    label: '$(folder) Open Recordings Directory',
                    description: 'Open the directory containing all recordings',
                    detail: 'Opens the file explorer to the recordings location',
                    isDirectory: true
                });
                
                // Show quick pick
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
                    // Open the file in the system's default application
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
        
        // Dispose UI components
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
        
        logInfo('[Extension] Deactivation complete.');
    } catch (error) {
        console.error('[Extension] Error during deactivation:', error);
    }
} 