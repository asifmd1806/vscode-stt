import * as vscode from 'vscode';

import { logInfo, logWarn, logError, showInfo, showError } from '../utils/logger';

// Define the expected argument structure (passed from the TreeItem command)
interface HistoryItemArg {
    fullText: string;
}

/**
 * Action to copy the full text of a history item to the clipboard.
 * Takes the item data passed as an argument from the TreeView command.
 */
export async function copyHistoryItemAction(itemArg: HistoryItemArg | string): Promise<void> {
    logInfo("[Action] copyHistoryItemAction triggered.");
    
    let textToCopy: string | undefined;

    // Handle argument type flexibility (might be object or just string)
    if (typeof itemArg === 'string') {
        textToCopy = itemArg;
    } else if (itemArg && typeof itemArg.fullText === 'string') {
        textToCopy = itemArg.fullText;
    } else {
        logError("[Action] Invalid argument passed to copyHistoryItemAction:", itemArg);
        showError("Could not copy history item: Invalid data.");
        return;
    }

    if (textToCopy) {
        try {
            await vscode.env.clipboard.writeText(textToCopy);
            logInfo("[Action] Copied text to clipboard:", textToCopy.substring(0, 50) + "...");
            showInfo("Transcription copied to clipboard.");
        } catch (error) {
            logError("[Action] Failed to copy text to clipboard:", error);
            showError(`Failed to copy to clipboard: ${error}`);
        }
    } else {
        logWarn("[Action] No text found to copy.");
        // Optionally show a message if textToCopy is empty/null
    }
} 