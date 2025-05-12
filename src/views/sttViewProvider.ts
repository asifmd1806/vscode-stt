import * as vscode from 'vscode';
import { RecorderService, IRecorderService } from '../services/recorderService'; 

import { logInfo } from '../utils/logger';

// Define the structure for history items internally
interface HistoryItem {
    text: string;
    timestamp: number;
}

// --- Tree Item Classes (Representing different types of items in the view) ---

class ActionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly commandId: string,
        public readonly icon: string,
        public readonly tooltip?: string,
        public readonly contextValue?: string // For enabling/disabling menu items
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.command = { command: commandId, title: label, arguments: [] };
        this.iconPath = new vscode.ThemeIcon(icon);
        this.tooltip = tooltip || label;
        this.contextValue = contextValue; // e.g., 'recordingActions' or 'idleActions'
    }
}

class StatusTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string, // Text displayed to the right
        public readonly icon: string,
        public readonly tooltip?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.tooltip = tooltip || `${label}: ${description}`;
    }
}

class SeparatorTreeItem extends vscode.TreeItem {
    constructor() {
        super('', vscode.TreeItemCollapsibleState.None);
        this.label = '─────────────────────────────'; 
        this.tooltip = 'Separator';
    }
}

class HistoryDisplayItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,        // Truncated text preview
        public readonly fullText: string,     // Full transcription text
        public readonly timestamp: number
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = new Date(timestamp).toLocaleString(); // Timestamp on the right
        this.tooltip = `[${this.description}] ${fullText}`; // Tooltip shows full text and time
        this.contextValue = 'historyItem'; // Context for menu contributions (e.g., copy)
        // Command to execute when clicked (e.g., copy)
        this.command = {
            command: 'speech-to-text-stt.copyHistoryItem',
            title: "Copy Transcription",
            arguments: [{ fullText: this.fullText }] // Pass the full text to the command
        };
        this.iconPath = new vscode.ThemeIcon('note'); // Icon for history item
    }
}

// --- Tree Data Provider Implementation ---

export class SttViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentSelectedDeviceId: number | undefined = undefined;

    // Use the shared history array reference from extension.ts
    constructor(
        private recorderService: IRecorderService,
        private transcriptionHistory: ReadonlyArray<HistoryItem>, // Use the shared array (readonly)
        private setSelectedDeviceIdCallback: (deviceId: number | undefined) => void // Callback to update state
    ) { logInfo("[SttViewProvider] Initialized."); }

    // Method required by TreeDataProvider
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    // Method required by TreeDataProvider
    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        // If no element is passed, we are at the root
        if (!element) {
            const items: vscode.TreeItem[] = [];

            // 1. Status Section
            items.push(...this.buildStatusItems());
            items.push(new SeparatorTreeItem());

            // 2. Actions Section
            items.push(...this.buildActionItems());
            items.push(new SeparatorTreeItem());

            // 3. History Section (if not empty)
            if (this.transcriptionHistory.length > 0) {
                 items.push(...this.buildHistoryItems());
            }

            return Promise.resolve(items);
        }

        // No child elements for any items in this view
        return Promise.resolve([]);
    }

    // --- Helper methods to build sections of the TreeView ---

    private buildStatusItems(): StatusTreeItem[] {
        const items: StatusTreeItem[] = [];
        
        // Microphone Status
        let micName = "Default Microphone"; 
        // TODO: Enhance this - ideally fetch and store device names when selected
        if (this.currentSelectedDeviceId !== undefined) {
            micName = `Device ID: ${this.currentSelectedDeviceId}`;
        }
        items.push(new StatusTreeItem("🎙️ Input Device", micName, 'zap', "Currently selected microphone"));

        // Recording Status
        const stateText = this.recorderService.isRecording ? "Recording Active" : "Idle";
        const stateIcon = this.recorderService.isRecording ? 'debug-pause' : 'debug-continue'; // Or 'record' / 'primitive-square'
        items.push(new StatusTreeItem("📊 Status", stateText, stateIcon, "Current recording state"));

        return items;
    }

    private buildActionItems(): ActionTreeItem[] {
        const items: ActionTreeItem[] = [];

        if (this.recorderService.isRecording) {
            items.push(new ActionTreeItem(
                "⏹️ Stop Recording & Transcribe", 
                'speech-to-text-stt.stopRecordingAndTranscribe', 
                'debug-stop', 
                "Stop recording and process the audio",
                "recordingActions" // Context for when recording
            ));
        } else {
            items.push(new ActionTreeItem(
                "▶️ Start Recording", 
                'speech-to-text-stt.startRecording', 
                'record', 
                "Start capturing audio from the selected device",
                "idleActions" // Context for when idle
            ));
            items.push(new ActionTreeItem(
                "⚙️ Select Microphone...", 
                'speech-to-text-stt.selectMicrophone', 
                'settings-gear', 
                "Choose the input device to record from",
                "idleActions" // Context for when idle
            ));
        }
        return items;
    }

    private buildHistoryItems(): vscode.TreeItem[] {
        const items: vscode.TreeItem[] = [];

        // History Header
        const historyHeader = new vscode.TreeItem("📜 Transcription History", vscode.TreeItemCollapsibleState.None);
        historyHeader.iconPath = new vscode.ThemeIcon('history');
        items.push(historyHeader);

        // Add each history item (sorted newest first by default due to unshift in extension.ts)
        items.push(...this.transcriptionHistory.map(item => {
            const preview = item.text.substring(0, 30) + (item.text.length > 30 ? '...' : '');
            return new HistoryDisplayItem(preview, item.text, item.timestamp);
        }));

        // Clear History Action (associated with the history section)
        items.push(new ActionTreeItem(
            "🗑️ Clear History", 
            'speech-to-text-stt.clearHistory', 
            'trashcan', 
            "Remove all items from the transcription history",
            "historyActions" 
        ));

        return items;
    }

    // --- Public methods to trigger updates ---

    /** Refreshes the entire tree view. */
    public refresh(): void {
        logInfo("[SttViewProvider] Refresh triggered.");
        this._onDidChangeTreeData.fire();
    }

    /** Updates the view when the selected device changes externally. */
    public updateSelectedDevice(deviceId: number | undefined): void {
        logInfo(`[SttViewProvider] Received updated device ID: ${deviceId}`);
        if (this.currentSelectedDeviceId !== deviceId) {
            this.currentSelectedDeviceId = deviceId;
            this.refresh(); 
        }
    }
    
    /** Called from extension when history array is modified. */
    public refreshHistory(): void {
         logInfo("[SttViewProvider] Refresh history triggered.");
        this._onDidChangeTreeData.fire(); 
    }
} 