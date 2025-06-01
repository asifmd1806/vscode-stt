import * as vscode from 'vscode';
import { IRecorderService, FFmpegRecorderService } from './services/ffmpegRecorderService';
import { TranscriptionProvider, OpenAIProvider, GroqProvider, ElevenLabsProvider, GoogleProvider } from './providers';
import { SttViewProvider } from './views/sttViewProvider';
import { StatusBarView } from './views/statusBarView';
import { ExtensionStateManager } from './state/extensionState';
import { MicrophoneService } from './services/microphoneService';
import { TranscriptionActionsService } from './services/transcriptionActionsService';
import { ContextService } from './services/contextService';
import { RecordingState, TranscriptionState } from './types/states';
import { getTranscriptionProvider, TranscriptionProvider as ProviderType } from './config/settings';
import { logInfo, logError, showError } from './utils/logger';
import { events } from './events';
import { getRecordingsDir } from './utils/fileUtils';

// Action imports
import { selectMicrophoneAction } from './actions/selectMicrophoneAction';
import { startRecordingAction } from './actions/startRecordingAction';
import { stopRecordingAction } from './actions/stopRecordingAction';
import { clearHistoryAction } from './actions/clearHistoryAction';
import { copyHistoryItemAction } from './actions/copyHistoryItemAction';
import { listSavedRecordings, openRecordingsDirectory } from './utils/fileUtils';
import { checkAndConfigureProvider, configureProviderCommand } from './commands/configureProviderCommand';

export class ExtensionController {
    // Services
    private recorderService: IRecorderService;
    private transcriptionProvider: TranscriptionProvider | null = null;
    private stateManager: ExtensionStateManager;
    private microphoneService: MicrophoneService;
    private transcriptionActionsService: TranscriptionActionsService;
    private contextService: ContextService;

    // Views
    private sttViewProvider: SttViewProvider | null = null;
    private statusBarView: StatusBarView;

    // Other
    private outputChannel: vscode.OutputChannel;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly context: vscode.ExtensionContext,
        outputChannel: vscode.OutputChannel
    ) {
        this.outputChannel = outputChannel;

        // Initialize state manager
        this.stateManager = new ExtensionStateManager();
        this.stateManager.setContext(context);

        // Initialize services
        this.recorderService = new FFmpegRecorderService(this.stateManager, context); // Pass stateManager here
        this.microphoneService = new MicrophoneService(this.recorderService, this.stateManager);
        this.transcriptionActionsService = new TranscriptionActionsService();
        this.contextService = new ContextService();

        // Initialize views
        this.statusBarView = new StatusBarView(context, this.stateManager);

        // Setup recorder state change listener
        this.setupRecorderStateListener();

        // Initialize transcription provider
        this.initializeTranscriptionProvider();

        // Initialize tree view provider
        this.initializeTreeViewProvider();

        // Setup state change listener for transcription actions
        this.stateManager.onStateChange((state) => {
            // Handle transcription actions when a new result is added
            if (state.transcriptionHistory.length > 0) {
                const latestTranscription = state.transcriptionHistory[0];
                // Only handle if it's a recent addition (within last second)
                if (Date.now() - latestTranscription.timestamp < 1000) {
                    this.transcriptionActionsService.handleTranscriptionActions(latestTranscription.text);
                }
            }
        });
    }

    async initialize(): Promise<void> {
        // Ensure recordings directory exists
        await getRecordingsDir(this.context);

        // Check and configure provider if needed (for first-time users)
        const isProviderConfigured = await checkAndConfigureProvider(this.context);
        if (!isProviderConfigured) {
            logInfo('[ExtensionController] Provider configuration was cancelled or failed');
        }

        // Restore selected device
        await this.stateManager.restoreSelectedDevice(this.context);

        // Register commands
        this.registerCommands();

        // Set initial context
        this.contextService.setIsRecordingActive(false);

        // Listen for configuration changes
        this.setupConfigurationListener();

        // Emit extension activated event
        events.emit({
            type: 'extensionActivated',
            timestamp: Date.now()
        });

        logInfo('[ExtensionController] Initialization complete.');
    }

    private setupRecorderStateListener(): void {
        this.recorderService.onRecordingStateChanged((isRecording) => {
            const state = this.stateManager.getState();
            if (!isRecording && state.recordingState === RecordingState.RECORDING) {
                // Recording stopped unexpectedly
                this.contextService.setIsRecordingActive(false);
                this.stateManager.setRecordingState(RecordingState.READY);
                this.stateManager.setTranscriptionState(TranscriptionState.IDLE);
                
                // Check if device is still available
                this.microphoneService.handleDeviceDisconnection();
            }
        });
    }

    private initializeTranscriptionProvider(): void {
        const providerName = getTranscriptionProvider();
        if (!providerName) {
            logInfo('[ExtensionController] No transcription provider configured yet');
            return;
        }
        
        this.transcriptionProvider = this.createTranscriptionProvider(providerName);

        if (!this.transcriptionProvider) {
            showError("Failed to initialize any transcription provider. Please check logs and configuration.");
            logError("[ExtensionController] Failed to create any transcription provider instance.");
        } else {
            logInfo(`[ExtensionController] Transcription provider initialized for provider: ${providerName}`);
        }
    }

    private createTranscriptionProvider(providerName: ProviderType): TranscriptionProvider | null {
        logInfo(`[ExtensionController] Attempting to create transcription provider: ${providerName}`);
        try {
            switch (providerName) {
                case 'elevenlabs':
                    return new ElevenLabsProvider(this.outputChannel);
                case 'openai':
                    return new OpenAIProvider(this.outputChannel);
                case 'groq':
                    return new GroqProvider(this.outputChannel);
                case 'google':
                    return new GoogleProvider(this.outputChannel);
                default:
                    logError(`[ExtensionController] Unknown provider name: ${providerName}`);
                    return null;
            }
        } catch (error) {
            logError(`[ExtensionController] Error instantiating provider ${providerName}:`, error);
            vscode.window.showErrorMessage(`Failed to initialize transcription provider for ${providerName}. See logs.`);
            return null;
        }
    }

    private initializeTreeViewProvider(): void {
        if (!this.transcriptionProvider) {
            showError("Cannot initialize view provider: No transcription provider available.");
            logError("[ExtensionController] Failed to create SttViewProvider: No transcription provider available.");
        } else {
            this.sttViewProvider = new SttViewProvider(this.recorderService, this.transcriptionProvider);
            this.disposables.push(
                vscode.window.registerTreeDataProvider('sttView', this.sttViewProvider)
            );
            
            // Make the view visible by default
            vscode.commands.executeCommand('sttView.focus');
            
            logInfo("[ExtensionController] TreeView provider registered.");
        }
    }

    private registerCommands(): void {
        logInfo("[ExtensionController] Registering commands...");

        // Create state updater proxy for backward compatibility with actions
        const stateUpdater = {
            setSelectedDeviceId: (deviceId: number | undefined) => this.stateManager.setSelectedDeviceId(deviceId),
            setRecordingState: (state: RecordingState) => this.stateManager.setRecordingState(state),
            setTranscriptionState: (state: TranscriptionState) => this.stateManager.setTranscriptionState(state),
            addTranscriptionResult: (text: string) => this.stateManager.addTranscriptionResult(text),
            clearTranscriptionHistory: () => this.stateManager.clearTranscriptionHistory(),
            setIsRecordingActive: (isRecording: boolean) => this.contextService.setIsRecordingActive(isRecording),
            ensureMicrophoneSelected: () => this.microphoneService.ensureMicrophoneSelected()
        };

        this.disposables.push(
            vscode.commands.registerCommand(
                'speech-to-text-stt.configureProvider',
                () => configureProviderCommand(this.context, getTranscriptionProvider())
            ),

            vscode.commands.registerCommand(
                'speech-to-text-stt.selectMicrophone',
                () => selectMicrophoneAction({ 
                    recorderService: this.recorderService, 
                    stateUpdater, 
                    context: this.context 
                })
            ),

            vscode.commands.registerCommand(
                'speech-to-text-stt.startRecording',
                () => {
                    const state = this.stateManager.getState();
                    return startRecordingAction({
                        recorderService: this.recorderService,
                        stateUpdater,
                        sttViewProvider: this.sttViewProvider!,
                        selectedDeviceId: state.selectedDeviceId,
                        recordingState: state.recordingState,
                        transcriptionState: state.transcriptionState
                    });
                }
            ),

            vscode.commands.registerCommand(
                'speech-to-text-stt.stopRecording',
                () => {
                    const state = this.stateManager.getState();
                    return stopRecordingAction({
                        recorderService: this.recorderService,
                        transcriptionProvider: this.transcriptionProvider,
                        stateUpdater,
                        sttViewProvider: this.sttViewProvider!,
                        selectedDeviceId: state.selectedDeviceId,
                        recordingState: state.recordingState,
                        transcriptionState: state.transcriptionState,
                        context: this.context,
                        outputChannel: this.outputChannel
                    });
                }
            ),

            vscode.commands.registerCommand(
                'speech-to-text-stt.stopRecordingAndTranscribe',
                () => {
                    const state = this.stateManager.getState();
                    return stopRecordingAction({
                        recorderService: this.recorderService,
                        transcriptionProvider: this.transcriptionProvider,
                        stateUpdater,
                        sttViewProvider: this.sttViewProvider!,
                        selectedDeviceId: state.selectedDeviceId,
                        recordingState: state.recordingState,
                        transcriptionState: state.transcriptionState,
                        context: this.context,
                        outputChannel: this.outputChannel
                    });
                }
            ),

            vscode.commands.registerCommand(
                'speech-to-text-stt.clearHistory',
                () => clearHistoryAction({ stateUpdater })
            ),

            vscode.commands.registerCommand(
                'speech-to-text-stt.copyHistoryItem',
                (item: { fullText: string } | string) => copyHistoryItemAction(item)
            ),

            vscode.commands.registerCommand(
                'speech-to-text-stt.viewSavedRecordings',
                () => this.viewSavedRecordingsCommand()
            )
        );
    }

    private async viewSavedRecordingsCommand(): Promise<void> {
        try {
            const recordings = await listSavedRecordings(this.context);
            
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
                await openRecordingsDirectory(this.context);
            } else if (selected.recording) {
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(selected.recording.path));
            }
        } catch (error) {
            logError('[ExtensionController] Error viewing saved recordings:', error);
            showError(`Failed to view recordings: ${error}`);
        }
    }

    private setupConfigurationListener(): void {
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('speech-to-text-stt.transcriptionProvider')) {
                    const newProvider = getTranscriptionProvider();
                    if (newProvider) {
                    this.transcriptionProvider = this.createTranscriptionProvider(newProvider);
                    if (this.transcriptionProvider && this.sttViewProvider) {
                        // Update the provider in the view
                        this.sttViewProvider = new SttViewProvider(this.recorderService, this.transcriptionProvider);
                        vscode.window.registerTreeDataProvider('sttView', this.sttViewProvider);
                    }
                    logInfo(`[ExtensionController] Transcription provider changed to: ${newProvider}`);
                    }
                }
            })
        );
    }

    dispose(): void {
        logInfo('[ExtensionController] Disposing...');

        // Stop recording if active
        if (this.recorderService?.isRecording) {
            try {
                this.recorderService.stopRecording();
                logInfo('[ExtensionController] Stopped recording during disposal.');
            } catch (error) {
                logError('[ExtensionController] Error stopping recording during disposal:', error);
            }
        }

        // Dispose views
        this.statusBarView?.dispose();
        this.sttViewProvider?.dispose();

        // Dispose services
        this.contextService?.dispose();

        // Dispose all registered disposables
        this.disposables.forEach(d => d.dispose());

        // Clear context
        this.contextService?.clearContext();

        // Emit extension deactivated event
        events.emit({
            type: 'extensionDeactivated',
            timestamp: Date.now()
        });

        logInfo('[ExtensionController] Disposal complete.');
    }
} 