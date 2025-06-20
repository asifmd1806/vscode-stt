import * as vscode from 'vscode';
import { IRecorderService, AudioDeviceInfo } from '../services/ffmpegRecorderService';
import { TranscriptionProvider } from '../providers/baseProvider';
import { events } from '../events';
import { SttEvent } from '../events/types';
import { getTranscriptionProvider } from '../config/settings';
import * as path from 'path';

interface TranscriptionHistoryItem {
    text: string;
    timestamp: number;
    audioFilePath?: string;
    status?: 'success' | 'failed';
}

export class SttViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private transcriptionHistory: TranscriptionHistoryItem[] = [];
    private selectedDeviceId: number = -1;
    private disposables: vscode.Disposable[] = [];
    private isTranscribing: boolean = false;
    private isFfmpegAvailable: boolean = false;

    constructor(
        private readonly recorderService: IRecorderService,
        private readonly transcriptionProvider: TranscriptionProvider
    ) {
        // Subscribe to events
        this.subscribeToEvents();
        // Check FFmpeg availability
        this.checkFfmpegAvailability();
    }

    private async checkFfmpegAvailability(): Promise<void> {
        // Check if FFmpeg is available by trying to list devices
        const devices = await this.recorderService.getAudioDevices();
        this.isFfmpegAvailable = devices.length > 0 && devices[0].id !== -1;
        this.refresh();
    }

    private subscribeToEvents(): void {
        // Subscribe to relevant events
        const eventHandler = (event: SttEvent) => {
            switch (event.type) {
                case 'microphoneSelected':
                    this.selectedDeviceId = event.deviceId;
                    this.refresh();
                    break;
                
                case 'historyItemAdded':
                    this.transcriptionHistory.unshift({ 
                        text: event.text, 
                        timestamp: event.timestamp,
                        audioFilePath: event.audioFilePath,
                        status: 'success'
                    });
                    this.refresh();
                    break;
                
                case 'historyCleared':
                    this.transcriptionHistory = [];
                    this.refresh();
                    break;
                
                case 'recordingStarted':
                case 'recordingStopped':
                    this.refresh();
                    break;
                
                case 'transcriptionStarted':
                    this.isTranscribing = true;
                    this.refresh();
                    break;
                
                case 'transcriptionCompleted':
                    this.isTranscribing = false;
                    this.refresh();
                    break;
                
                case 'transcriptionError':
                    this.isTranscribing = false;
                    // Add failed transcription to history if we have the file path
                    const errorEvent = event as any; // Type assertion for now
                    if (errorEvent.audioFilePath) {
                        this.transcriptionHistory.unshift({
                            text: 'Transcription failed',
                            timestamp: event.timestamp,
                            audioFilePath: errorEvent.audioFilePath,
                            status: 'failed'
                        });
                    }
                    this.refresh();
                    break;
            }
        };

        // Subscribe to all relevant event types
        events.subscribe('microphoneSelected', eventHandler);
        events.subscribe('historyItemAdded', eventHandler);
        events.subscribe('historyCleared', eventHandler);
        events.subscribe('recordingStarted', eventHandler);
        events.subscribe('recordingStopped', eventHandler);
        events.subscribe('transcriptionStarted', eventHandler);
        events.subscribe('transcriptionCompleted', eventHandler);
        events.subscribe('transcriptionError', eventHandler);

        // Store the handler for cleanup
        this.disposables.push({
            dispose: () => {
                events.unsubscribe('microphoneSelected', eventHandler);
                events.unsubscribe('historyItemAdded', eventHandler);
                events.unsubscribe('historyCleared', eventHandler);
                events.unsubscribe('recordingStarted', eventHandler);
                events.unsubscribe('recordingStopped', eventHandler);
                events.unsubscribe('transcriptionStarted', eventHandler);
                events.unsubscribe('transcriptionCompleted', eventHandler);
                events.unsubscribe('transcriptionError', eventHandler);
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // Keep these methods for backward compatibility but they're no longer the primary update mechanism
    updateSelectedDevice(deviceId: number | undefined): void {
        this.selectedDeviceId = deviceId || -1;
        this.refresh();
    }

    updateTranscriptionHistory(history: TranscriptionHistoryItem[]): void {
        this.transcriptionHistory = [...history];
        this.refresh();
    }

    addTranscriptionItem(text: string, timestamp: number): void {
        // This is now handled by the historyItemAdded event
        this.transcriptionHistory.unshift({ text, timestamp });
        this.refresh();
    }

    clearTranscriptionHistory(): void {
        // This is now handled by the historyCleared event
        this.transcriptionHistory = [];
        this.refresh();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        // If a header element is expanded, show its children
        if (element) {
            if (element.contextValue === 'transcriptionHistoryHeader') {
                const children: vscode.TreeItem[] = [];
                // History entries
                this.transcriptionHistory.forEach(item => {
                    const date = new Date(item.timestamp);
                    const formattedDate = date.toLocaleString();
                    const fileName = item.audioFilePath ? path.basename(item.audioFilePath) : '';
                    const truncatedText = item.text.length > 50 ? item.text.substring(0, 50) + '...' : item.text;
                    
                    // Create label with file name and text
                    const label = fileName ? `${fileName}: ${truncatedText}` : truncatedText;
                    const historyItem = new vscode.TreeItem(
                        label,
                        vscode.TreeItemCollapsibleState.None
                    );
                    
                    // Set description to show date
                    historyItem.description = formattedDate;
                    
                    // Set appropriate icon based on status
                    if (item.status === 'failed') {
                        historyItem.iconPath = new vscode.ThemeIcon('error');
                        historyItem.contextValue = 'failedHistoryItem';
                        historyItem.tooltip = `Failed transcription at ${formattedDate}\nFile: ${fileName}\nClick to retry`;
                        // Add command to retry transcription
                        if (item.audioFilePath) {
                            historyItem.command = {
                                command: 'speech-to-text-stt.retryTranscription',
                                title: 'Retry Transcription',
                                arguments: [item.audioFilePath]
                            };
                        }
                    } else {
                        historyItem.iconPath = new vscode.ThemeIcon('check');
                        historyItem.command = {
                            command: 'speech-to-text-stt.copyHistoryItem',
                            title: 'Copy Transcription',
                            arguments: [item.text]
                        };
                        historyItem.tooltip = `${formattedDate}\nFile: ${fileName}\nText: ${item.text}\nClick to copy`;
                        historyItem.contextValue = 'historyItem';
                    }
                    
                    children.push(historyItem);
                });
                return children;
            }
            return [];
        }

        const items: vscode.TreeItem[] = [];

        // Add FFmpeg status item first
        const ffmpegStatusItem = new vscode.TreeItem(
            this.isFfmpegAvailable ? '✅ FFmpeg: Installed' : '❌ FFmpeg: Not Installed',
            vscode.TreeItemCollapsibleState.None
        );
        if (!this.isFfmpegAvailable) {
            ffmpegStatusItem.command = {
                command: 'vscode.open',
                title: 'Open FFmpeg Documentation',
                arguments: [vscode.Uri.parse('https://ffmpeg.org/download.html')]
            };
            ffmpegStatusItem.tooltip = 'Click to learn how to install FFmpeg';
            ffmpegStatusItem.iconPath = new vscode.ThemeIcon('warning');
        } else {
            ffmpegStatusItem.iconPath = new vscode.ThemeIcon('check');
        }
        items.push(ffmpegStatusItem);

        // Add the general settings item
        const generalSettingsItem = new vscode.TreeItem(
            '⚙️ Settings',
            vscode.TreeItemCollapsibleState.None
        );
        generalSettingsItem.command = {
            command: 'workbench.action.openSettings',
            title: 'Open Extension Settings',
            arguments: ['@ext:asifmohammed.speech-to-text-stt']
        };
        generalSettingsItem.tooltip = 'Configure Speech To Text STT extension';
        items.push(generalSettingsItem);

        // Add provider information item
        const currentProvider = getTranscriptionProvider();
        const providerDisplayNames: Record<string, string> = {
            'elevenlabs': 'ElevenLabs',
            'openai': 'OpenAI',
            'groq': 'Groq',
            'google': 'Google Cloud'
        };
        
        const providerItem = new vscode.TreeItem(
            currentProvider 
                ? `🔧 Provider: ${providerDisplayNames[currentProvider] || currentProvider}`
                : '🔧 Provider: Not Configured',
            vscode.TreeItemCollapsibleState.None
        );
        providerItem.command = {
            command: 'speech-to-text-stt.configureProvider',
            title: 'Configure Provider'
        };
        providerItem.tooltip = currentProvider 
            ? 'Click to configure or change transcription provider'
            : 'Click to configure a transcription provider';
        providerItem.contextValue = 'providerConfig';
        items.push(providerItem);

        // Add device selection item
        const devices = await this.recorderService.getAudioDevices();
        const currentDevice = devices.find((d: AudioDeviceInfo) => d.id === this.selectedDeviceId);
        const deviceName = currentDevice ? currentDevice.label || currentDevice.name : 
                          (this.selectedDeviceId === -1 && devices.length > 0 ? "Default Microphone" : "Not Selected");
        
        const deviceItem = new vscode.TreeItem(
            `🎤 ${deviceName}`,
            vscode.TreeItemCollapsibleState.None
        );
        deviceItem.command = {
            command: 'speech-to-text-stt.selectMicrophone',
            title: 'Select Microphone'
        };
        deviceItem.tooltip = 'Click to select a different microphone';
        items.push(deviceItem);

        // Add recording control item
        if (this.recorderService.isRecording) {
            const stopItem = new vscode.TreeItem(
                '⏹️ Stop Recording',
                vscode.TreeItemCollapsibleState.None
            );
            stopItem.command = {
                command: 'speech-to-text-stt.stopRecording',
                title: 'Stop Recording'
            };
            stopItem.tooltip = 'Click to stop recording and transcribe';
            items.push(stopItem);
        } else {
            const startItem = new vscode.TreeItem(
                '▶️ Start Recording',
                vscode.TreeItemCollapsibleState.None
            );
            startItem.command = {
                command: 'speech-to-text-stt.startRecording',
                title: 'Start Recording'
            };
            startItem.tooltip = 'Click to start recording';
            items.push(startItem);
        }

        // Add separator
        const separatorItem = new vscode.TreeItem('', vscode.TreeItemCollapsibleState.None);
        separatorItem.description = '─────────────────────';
        items.push(separatorItem);
        
        // Show transcription status if in progress
        if (this.isTranscribing) {
            const transcribingItem = new vscode.TreeItem(
                'Transcribing...',
                vscode.TreeItemCollapsibleState.None
            );
            transcribingItem.iconPath = new vscode.ThemeIcon('sync~spin');
            transcribingItem.tooltip = 'Transcription in progress...';
            items.push(transcribingItem);
        }

        // Add history header or empty state
        if (this.transcriptionHistory.length > 0) {
            const historyHeader = new vscode.TreeItem(
                `📝 Transcription History (${this.transcriptionHistory.length})`,
                vscode.TreeItemCollapsibleState.Expanded
            );
            historyHeader.contextValue = 'transcriptionHistoryHeader';
            items.push(historyHeader);
        } else {
            // Show a helpful message when no history exists
            const emptyItem = new vscode.TreeItem(
                '💭 No transcriptions yet',
                vscode.TreeItemCollapsibleState.None
            );
            emptyItem.tooltip = 'Start recording to see transcriptions here';
            items.push(emptyItem);
            
            // Add getting started tips
            const tipItem = new vscode.TreeItem(
                '💡 Press Cmd+Shift+R to start recording',
                vscode.TreeItemCollapsibleState.None
            );
            tipItem.tooltip = 'Use keyboard shortcuts for quick access';
            items.push(tipItem);
        }

        return items;
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}

class SttViewItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
} 