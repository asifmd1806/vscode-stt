import * as vscode from 'vscode';
import { RecorderService, IRecorderService } from '../services/recorderService'; 
import { eventManager } from '../events/eventManager';
import { EventType, MicrophoneSelectedEvent, HistoryItemCopiedEvent } from '../events/events';
import { logInfo, logWarn } from '../utils/logger';

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

    private subscriptions: vscode.Disposable[] = [];

    // Use the shared history array reference from extension.ts
    constructor(
        private recorderService: IRecorderService,
        private transcriptionHistory: ReadonlyArray<HistoryItem>, // Use the shared array (readonly)
        private setSelectedDeviceIdCallback: (deviceId: number | undefined) => void // Callback to update state in extension.ts if needed
    ) { 
        logInfo("[SttViewProvider] Initialized."); 

        // Subscribe to events
        this.subscriptions.push(
            eventManager.subscribe(EventType.RecordingStarted, () => this.refresh()),
            eventManager.subscribe(EventType.RecordingStopped, () => this.refresh()),
            eventManager.subscribe(EventType.TranscriptionCompleted, () => this.refresh()),
            eventManager.subscribe(EventType.HistoryCleared, () => this.refresh()),
            eventManager.subscribe(EventType.MicrophoneSelected, (event: AppEvent) => {
                const micEvent = event as MicrophoneSelectedEvent;
                // Ensure micEvent and deviceId are defined before calling updateSelectedDevice
                if (micEvent && micEvent.deviceId !== undefined) {
                    this.updateSelectedDevice(micEvent.deviceId);
                } else {
                    logWarn("[SttViewProvider] MicrophoneSelectedEvent received without deviceId.");
                    // Optionally, refresh or handle default/error state
                    this.updateSelectedDevice(undefined); // Or some default value
                }
            }),
            eventManager.subscribe(EventType.HistoryItemCopied, (event: AppEvent) => {
                const copiedEvent = event as HistoryItemCopiedEvent;
                logInfo(`[SttViewProvider] History item copied: "${copiedEvent.text.substring(0, 20)}..."`);
                // Optionally, show a brief notification via vscode.window.setStatusBarMessage
                vscode.window.setStatusBarMessage('Copied to clipboard!', 2000);
            })
        );
    }

    dispose(): void {
        logInfo("[SttViewProvider] Disposing subscriptions.");
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
    }

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
    public updateSelectedDevice(deviceId: string | number | undefined): void {
        // Normalize deviceId: The event carries string | number, but internally we might prefer number | undefined
        let normalizedDeviceId: number | undefined;
        if (typeof deviceId === 'string') {
            normalizedDeviceId = parseInt(deviceId, 10);
            if (isNaN(normalizedDeviceId)) { // Handle cases like "default" or if parsing fails
                normalizedDeviceId = undefined; 
            }
        } else {
            normalizedDeviceId = deviceId;
        }
        
        // Map -1 (often used for default) to undefined for internal consistency if desired
        if (normalizedDeviceId === -1) {
            normalizedDeviceId = undefined;
        }

        logInfo(`[SttViewProvider] Received updated device ID: ${deviceId}, normalized to: ${normalizedDeviceId}`);
        if (this.currentSelectedDeviceId !== normalizedDeviceId) {
            this.currentSelectedDeviceId = normalizedDeviceId;
            // The setSelectedDeviceIdCallback call might be redundant if the source of truth 
            // (extension.ts state) is already updated by the action that triggered the event.
            // However, if this view provider needs to inform other parts or if it's a direct
            // update path, it might still be relevant. For now, let's assume it might still be used
            // by the extension to sync if needed, but primarily the view refreshes itself.
            // this.setSelectedDeviceIdCallback(normalizedDeviceId); // This might be removed if state is always updated before event
            this.refresh(); 
        }
    }
    
    // refreshHistory becomes redundant as TranscriptionCompleted and HistoryCleared events now trigger a general refresh.
    // public refreshHistory(): void {
    //      logInfo("[SttViewProvider] Refresh history triggered.");
    //     this._onDidChangeTreeData.fire(); 
    // }
} 