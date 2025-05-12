import * as vscode from 'vscode';
import { RecorderService, AudioDeviceInfo, IRecorderService } from '../services/recorderService';

import { logInfo, logWarn, logError, showWarn, showError, showInfo } from '../utils/logger'; 

// Define the expected structure of the arguments passed from extension.ts
export interface SelectMicrophoneActionArgs {
    recorderService: IRecorderService;
    stateUpdater: {
        setSelectedDeviceId: (deviceId: number | undefined) => void;
    };
}

/**
 * Action to allow the user to select an audio input device.
 * Fetches available devices, presents a Quick Pick menu, and updates the selected device state.
 */
export async function selectMicrophoneAction({ recorderService, stateUpdater }: SelectMicrophoneActionArgs): Promise<void> {
    logInfo("[Action] selectMicrophoneAction triggered.");

    if (recorderService.isRecording) {
        showWarn('Cannot change microphone while recording is active.');
        return;
    }

    try {
        const devices = await recorderService.listMicrophones();
        if (!devices || devices.length === 0 || (devices.length === 1 && devices[0].id === -1)) {
            showError('No audio input devices found or failed to list devices.');
            logError("[Action] No valid devices returned by recorderService.listMicrophones");
            return;
        }

        // Format devices for Quick Pick
        const quickPickItems: vscode.QuickPickItem[] = devices.map(device => ({
            label: device.name,
            description: `ID: ${device.id}`,
            // Store the actual device ID for later retrieval
            detail: String(device.id) // Using detail to store the ID as a string
        }));

        // Add an option for the default device
        quickPickItems.unshift({
            label: "Default System Microphone",
            description: "Let the system choose",
            detail: "-1" // Use -1 or undefined to represent default
        });

        const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select the microphone to use for recording',
            title: 'Select Input Device'
        });

        if (selectedItem) {
            // Retrieve the stored device ID (converting back to number)
            const selectedId = parseInt(selectedItem.detail || '-1', 10);
            const finalId = selectedId === -1 ? undefined : selectedId;
            
            logInfo(`[Action] User selected device: ${selectedItem.label} (ID: ${finalId})`);
            // Update the state via the stateUpdater passed from extension.ts
            stateUpdater.setSelectedDeviceId(finalId); 
            showInfo(`Input device set to: ${selectedItem.label}`);
        } else {
            logInfo("[Action] Microphone selection cancelled by user.");
        }

    } catch (error) {
        logError("[Action] Error selecting microphone:", error);
        showError(`Failed to select microphone: ${error}`);
    }
} 