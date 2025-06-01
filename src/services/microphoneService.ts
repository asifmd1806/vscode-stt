import * as vscode from 'vscode';
import { IRecorderService } from './ffmpegRecorderService';
import { StateManager } from '../state/types';
import { logInfo, logError, showError } from '../utils/logger';

export class MicrophoneService {
    constructor(
        private readonly recorderService: IRecorderService,
        private readonly stateManager: StateManager
    ) {}

    async ensureMicrophoneSelected(): Promise<boolean> {
        const state = this.stateManager.getState();
        
        // Check if we have a valid selected device
        if (state.selectedDeviceId !== undefined) {
            // Verify the device still exists
            const devices = await this.recorderService.getAudioDevices();
            const deviceExists = devices.some(d => d.id === state.selectedDeviceId);
            if (deviceExists) {
                // If device ID is set but name is not, try to populate the name
                if (state.selectedDeviceId !== undefined && !state.selectedDeviceName) {
                    const currentDevice = devices.find(d => d.id === state.selectedDeviceId);
                    if (currentDevice) {
                        this.stateManager.setSelectedDeviceName(currentDevice.name);
                        logInfo(`[MicrophoneService] Populated missing device name for ID ${state.selectedDeviceId}: ${currentDevice.name}`);
                    }
                }
                return true;
            }
            // Device no longer exists, clear selection
            this.stateManager.setSelectedDeviceId(undefined); // This will also clear the name via ExtensionStateManager
        }

        // Prompt for device selection
        return await this.promptMicrophoneSelection();
    }

    async promptMicrophoneSelection(): Promise<boolean> {
        try {
            logInfo('[MicrophoneService] Prompting user to select microphone...');
            
            const devices = await this.recorderService.getAudioDevices();
            if (!devices || devices.length === 0 || devices[0].id === -1) {
                showError('No audio devices found. Please check your microphone connection.');
                return false;
            }

            // Show device selection dialog
            const items = devices.map(device => ({
                label: device.name,
                description: device.label,
                deviceId: device.id
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a microphone for Speech to Text',
                ignoreFocusOut: true
            });

            if (!selected) {
                logInfo('[MicrophoneService] User cancelled microphone selection');
                return false;
            }

            // Save the selected device
            this.stateManager.setSelectedDeviceId(selected.deviceId);
            this.stateManager.setSelectedDeviceName(selected.label); // Add this line
            await this.recorderService.selectAudioDevice(selected.deviceId);
            
            logInfo(`[MicrophoneService] User selected microphone: ${selected.label} (ID: ${selected.deviceId})`);
            return true;

        } catch (error) {
            logError('[MicrophoneService] Error during microphone selection:', error);
            showError(`Failed to select microphone: ${error}`);
            return false;
        }
    }

    async handleDeviceDisconnection(): Promise<void> {
        const state = this.stateManager.getState();
        if (state.selectedDeviceId !== undefined) {
            const devices = await this.recorderService.getAudioDevices();
            const deviceExists = devices.some(d => d.id === state.selectedDeviceId);
            if (!deviceExists) {
                // Device was disconnected, clear selection
                this.stateManager.setSelectedDeviceId(undefined);
                vscode.window.showWarningMessage('Microphone disconnected. Please select a new device.');
            }
        }
    }
} 