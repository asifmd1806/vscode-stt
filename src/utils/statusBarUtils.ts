import * as vscode from 'vscode';
import { RecorderService } from '../services/recorderService';

// Define the arguments needed for updating the status bar
interface StatusBarUpdateArgs {
    statusBarItem: vscode.StatusBarItem;
    recorderService: RecorderService;
    selectedDeviceId: number | undefined; // To potentially show device info
}

/**
 * Updates the status bar item based on the current recording state and selected device.
 */
export function updateStatusBar({ 
    statusBarItem, 
    recorderService, 
    selectedDeviceId 
}: StatusBarUpdateArgs): void {
    
    const isRecording = recorderService.isRecording;
    
    if (isRecording) {
        statusBarItem.text = `$(debug-pause) STT: Recording...`; // Icon for recording
        statusBarItem.tooltip = `Speech-to-Text is recording (Device ID: ${selectedDeviceId ?? 'Default'}). Click to stop.`;
        statusBarItem.command = 'speech-to-text-stt.stopRecordingAndTranscribe'; // Command to run on click
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground'); // Use error color to indicate recording
    } else {
        statusBarItem.text = `$(record) STT: Idle`; // Icon for idle/ready
        statusBarItem.tooltip = `Speech-to-Text is idle (Device ID: ${selectedDeviceId ?? 'Default'}). Click to start recording.`;
        statusBarItem.command = 'speech-to-text-stt.startRecording'; // Command to run on click
        // Reset background color
        statusBarItem.backgroundColor = undefined; 
    }
    
    // Ensure the item is visible
    statusBarItem.show();
    // console.log(`[StatusBar] Updated: Recording=${isRecording}, Text='${statusBarItem.text}'`);
} 