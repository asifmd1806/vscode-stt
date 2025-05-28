import * as vscode from 'vscode';
import { FFmpegRecorderService, IRecorderService, AudioDeviceInfo } from '../services/ffmpegRecorderService';
import { TranscriptionProvider } from '../providers/baseProvider';
import { logInfo, logError } from '../utils/logger';

interface TranscriptionHistoryItem {
    text: string;
    timestamp: number;
}

export class SttViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // State will be passed from extension instead of maintained internally
    private transcriptionHistory: TranscriptionHistoryItem[] = [];
    private selectedDeviceId: number = -1;

    constructor(
        private readonly recorderService: IRecorderService,
        private readonly transcriptionProvider: TranscriptionProvider
    ) {
        // Initialize with empty state
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    refreshHistory(): void {
        this.refresh();
    }

    updateSelectedDevice(deviceId: number | undefined): void {
        this.selectedDeviceId = deviceId || -1;
        this.refresh();
    }

    updateTranscriptionHistory(history: TranscriptionHistoryItem[]): void {
        this.transcriptionHistory = [...history];
        this.refresh();
    }

    addTranscriptionItem(text: string, timestamp: number): void {
        this.transcriptionHistory.unshift({ text, timestamp });
        this.refresh();
    }

    clearTranscriptionHistory(): void {
        this.transcriptionHistory = [];
        this.refresh();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            return [];
        }

        const items: vscode.TreeItem[] = [];

        // Add device selection item
        const devices = await this.recorderService.getAudioDevices();
        const currentDevice = devices.find((d: AudioDeviceInfo) => d.id === this.selectedDeviceId);
        const deviceName = currentDevice ? currentDevice.label || currentDevice.name : "Default Microphone";
        
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

        // Add history items
        if (this.transcriptionHistory.length > 0) {
            const historyHeader = new vscode.TreeItem(
                `📝 Transcription History (${this.transcriptionHistory.length})`,
                vscode.TreeItemCollapsibleState.Expanded
            );
            historyHeader.contextValue = 'transcriptionHistoryHeader';
            items.push(historyHeader);

            this.transcriptionHistory.forEach((item, index) => {
                const date = new Date(item.timestamp);
                const formattedDate = date.toLocaleString();
                const truncatedText = item.text.length > 50 ? item.text.substring(0, 50) + '...' : item.text;
                
                const historyItem = new vscode.TreeItem(
                    `${formattedDate}: ${truncatedText}`,
                    vscode.TreeItemCollapsibleState.None
                );
                historyItem.command = {
                    command: 'speech-to-text-stt.copyHistoryItem',
                    title: 'Copy Transcription',
                    arguments: [item.text]
                };
                historyItem.tooltip = `Click to copy: ${item.text}`;
                historyItem.contextValue = 'historyItem';
                items.push(historyItem);
            });
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