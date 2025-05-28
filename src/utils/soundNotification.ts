import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logInfo, logError } from './logger';

// Use require for play-sound module
const playSound = require('play-sound');

/**
 * Plays a notification sound when transcription is completed
 */
export async function playNotificationSound(context: vscode.ExtensionContext): Promise<void> {
    try {
        // Check if sound notification is enabled
        const config = vscode.workspace.getConfiguration('speech-to-text-stt');
        const isEnabled = config.get<boolean>('enableSoundNotification', true);
        
        if (!isEnabled) {
            logInfo('[SoundNotification] Sound notifications are disabled');
            return;
        }

        // Get the path to the notification sound file
        // We'll use a simple beep sound that should be included in the media folder
        const soundPath = path.join(context.extensionPath, 'media', 'notification.wav');
        
        // Check if the sound file exists
        if (!fs.existsSync(soundPath)) {
            logInfo('[SoundNotification] Notification sound file not found at:', soundPath);
            // Could fall back to system beep here if available
            return;
        }
        
        // Create player instance
        const player = playSound();
        
        // Play the sound
        player.play(soundPath, (err: any) => {
            if (err) {
                logError('[SoundNotification] Failed to play notification sound:', err);
                // Don't show error to user as this is a non-critical feature
            } else {
                logInfo('[SoundNotification] Notification sound played successfully');
            }
        });
    } catch (error) {
        logError('[SoundNotification] Error in playNotificationSound:', error);
        // Don't throw or show error to user as this is a non-critical feature
    }
} 