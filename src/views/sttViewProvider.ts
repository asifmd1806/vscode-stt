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

    private transcriptionHistory: TranscriptionHistoryItem[] = [];
    private selectedDeviceId: number = -1;
    private isRecording: boolean = false;

    constructor(
        private readonly recorderService: IRecorderService,
        private readonly transcriptionProvider: TranscriptionProvider
    ) {
        // ... rest of the file ...
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
        
        items.push(new vscode.TreeItem(
            `Current Device: ${deviceName}`,
            vscode.TreeItemCollapsibleState.None
        ));

        // Add recording control item
        if (this.recorderService.isRecording) {
            items.push(new vscode.TreeItem(
                'Stop Recording',
                vscode.TreeItemCollapsibleState.None
            ));
        } else {
            items.push(new vscode.TreeItem(
                'Start Recording',
                vscode.TreeItemCollapsibleState.None
            ));
        }

        // Add history items
        if (this.transcriptionHistory.length > 0) {
            items.push(new vscode.TreeItem(
                'Transcription History',
                vscode.TreeItemCollapsibleState.Expanded
            ));

            this.transcriptionHistory.forEach((item) => {
                const date = new Date(item.timestamp);
                const formattedDate = date.toLocaleString();
                items.push(new vscode.TreeItem(
                    `${formattedDate}: ${item.text}`,
                    vscode.TreeItemCollapsibleState.None
                ));
            });
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