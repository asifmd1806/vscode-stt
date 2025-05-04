import * as vscode from 'vscode';
import { Readable } from 'stream';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Service Imports
import { RecorderService, AudioDeviceInfo } from './services/recorderService';
import { TranscriptionService } from './services/transcriptionService';
import { ElevenLabsTranscriptionService } from './services/elevenLabsTranscriptionService';
import { OpenAIWhisperTranscriptionService } from './services/openaiWhisperTranscriptionService';
import { GroqWhisperTranscriptionService } from './services/groqWhisperTranscriptionService';

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
import { getRecordingsDir, saveAudioToFile } from './utils/fileUtils';
import { initializeLogger, logInfo, logError, showError } from './utils/logger';

// Import config functions
import { getTranscriptionProvider, getGeneralSetting, TranscriptionProvider } from './config/settings';

// --- Extension State --- 
// Services (initialized in activate)
let recorderService: RecorderService;
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
        vscode.commands.executeCommand('setContext', 'speechToTextStt.isRecordingActive', isRecording);
        console.log(`[Extension] Recording context set to: ${isRecording}`);
        // Clean up previous disposable if setting to false
        if (!isRecording && isRecordingDisposable) {
            isRecordingDisposable.dispose();
            isRecordingDisposable = null;
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
    recorderService = new RecorderService();
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
                // Wrap updateStatusBar call
                updateStatusBar: () => updateStatusBar({ statusBarItem, recorderService, selectedDeviceId }) 
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
                // Pass context for file saving
                context, 
                 // Wrap updateStatusBar call
                updateStatusBar: () => updateStatusBar({ statusBarItem, recorderService, selectedDeviceId })
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

    // Set initial context for when clause
    stateUpdater.setIsRecordingActive(false); 

    logInfo('[Extension] Activation complete.');
}

// --- Extension Deactivation --- 
export function deactivate() {
    logInfo('Deactivating "speech-to-text-stt" extension.');
    // Stop recording if active
    if (recorderService?.isRecording) {
        recorderService.stopRecording();
    }
    // Dispose UI components
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
    // Dispose context setter
    if (isRecordingDisposable) {
        isRecordingDisposable.dispose();
    }
    // Clear context key
    vscode.commands.executeCommand('setContext', 'speechToTextStt.isRecordingActive', undefined);

    // Note: Other disposables (commands, tree view) are handled by context.subscriptions
    logInfo('[Extension] Deactivation complete.');
} 