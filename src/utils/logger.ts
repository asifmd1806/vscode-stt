import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

/**
 * Initializes the logger with the VS Code Output Channel.
 * Must be called once during extension activation.
 */
export function initializeLogger(channel: vscode.OutputChannel): void {
    if (!outputChannel) {
        outputChannel = channel;
        console.log("[Logger] Initialized with Output Channel.");
    } else {
        console.warn("[Logger] Logger already initialized.");
    }
}

// Helper function to format messages with timestamp
function formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level}] ${message}`;
    if (data) {
        try {
            // Attempt to stringify data, handle potential circular references
            formatted += `\nData: ${JSON.stringify(data, null, 2)}`;
        } catch (e) {
            formatted += `\nData: (Could not stringify - ${e instanceof Error ? e.message : String(e)})`;
        }
    }
    return formatted;
}

/** Logs an informational message. */
export function logInfo(message: string, data?: any): void {
    const formattedMessage = formatMessage('INFO', message, data);
    console.log(formattedMessage);
    outputChannel?.appendLine(formattedMessage);
}

/** Logs a warning message. */
export function logWarn(message: string, data?: any): void {
    const formattedMessage = formatMessage('WARN', message, data);
    console.warn(formattedMessage);
    outputChannel?.appendLine(formattedMessage);
}

/** Logs an error message. */
export function logError(message: string, error?: any): void {
    const formattedMessage = formatMessage('ERROR', message, error);
    console.error(formattedMessage);
    outputChannel?.appendLine(formattedMessage);
}

// --- Functions that also show VS Code notifications ---

/** Logs info and shows an information message to the user. */
export function showInfo(message: string, data?: any): void {
    logInfo(message, data); // Log it first
    vscode.window.showInformationMessage(message);
}

/** Logs warning and shows a warning message to the user. */
export function showWarn(message: string, data?: any): void {
    logWarn(message, data); // Log it first
    vscode.window.showWarningMessage(message);
}

/** Logs error and shows an error message to the user. */
export function showError(message: string, error?: any): void {
    logError(message, error); // Log it first
    vscode.window.showErrorMessage(message); // Show a simplified message to the user
} 