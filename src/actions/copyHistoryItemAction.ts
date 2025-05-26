import * as vscode from 'vscode';
import { logInfo, logError } from '../utils/logger';
import { events } from '../events';

/**
 * Action to copy a history item to the clipboard.
 * Updates clipboard and emits history item copied event.
 */
export function copyHistoryItemAction(item: { fullText: string } | string): void {
    try {
        const text = typeof item === 'string' ? item : item.fullText;
        
        // Copy to clipboard
        vscode.env.clipboard.writeText(text);
        
        // Emit history item copied event
        events.emit({
            type: 'historyItemCopied',
            text,
            timestamp: Date.now()
        });
        
        logInfo('[CopyHistoryItemAction] Text copied to clipboard.');
    } catch (error) {
        logError(`[CopyHistoryItemAction] Error copying text: ${error}`);
    }
} 