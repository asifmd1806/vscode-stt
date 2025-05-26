import * as vscode from 'vscode';
import { IRecorderService } from '../services/ffmpegRecorderService';
import { logInfo, logError, showError } from '../utils/logger';
import { events } from '../events';

// Define the expected structure of the arguments passed from extension.ts
interface SelectMicrophoneActionArgs {
    recorderService: IRecorderService;
    stateUpdater: {
        setSelectedDeviceId: (deviceId: number | undefined) => void;
    };
}

/**
 * Action to select a microphone device.
 * Updates UI state and manages device selection.
 */
export async function selectMicrophoneAction({
    recorderService,
    stateUpdater
}: SelectMicrophoneActionArgs): Promise<void> {
    try {
        if (recorderService.isRecording) {
            showError('Cannot change microphone while recording.');
            return;
        }

        logInfo('[SelectMicrophoneAction] Listing audio devices...');

        // Get available devices
        const devices = await recorderService.getAudioDevices();
        if (!devices || devices.length === 0) {
            showError('No audio devices found.');
            return;
        }

        // Create quick pick items
        const items = devices.map(device => ({
            label: device.name,
            description: device.label,
            deviceId: device.id
        }));

        // Show device picker
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a microphone',
            matchOnDescription: true
        });

        if (selected) {
            // Update selected device
            await recorderService.selectAudioDevice(selected.deviceId);
            stateUpdater.setSelectedDeviceId(selected.deviceId);
            logInfo(`[SelectMicrophoneAction] Selected device: ${selected.label}`);
        }

    } catch (error) {
        logError('[SelectMicrophoneAction] Error selecting microphone:', error);
        showError(`Failed to select microphone: ${error}`);
    }
} 