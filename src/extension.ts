import * as vscode from 'vscode';
import { ExtensionController } from './extensionController';
import { initializeLogger, logInfo, logError } from './utils/logger';

let extensionController: ExtensionController | null = null;

export async function activate(context: vscode.ExtensionContext) {
    try {
        // Initialize logger
        const outputChannel = vscode.window.createOutputChannel('Speech To Text STT');
        initializeLogger(outputChannel);
        
        logInfo('[Extension] Activating Speech To Text STT extension...');
        
        // Create and initialize the extension controller
        extensionController = new ExtensionController(context, outputChannel);
        await extensionController.initialize();
        
        logInfo('[Extension] Speech To Text STT extension activated successfully.');

        // Register FFmpeg help command
        context.subscriptions.push(vscode.commands.registerCommand('speech-to-text-stt.showFfmpegHelp', () => {
            const ffmpegDocPath = vscode.Uri.joinPath(context.extensionUri, 'docs', 'FFMPEG.md');
            // Attempt to show preview, fallback to opening as text document
            vscode.commands.executeCommand('markdown.showPreview', ffmpegDocPath)
                .then(null, (err) => { // Handle error if markdown preview fails (e.g., no markdown extension)
                    logWarn('[Extension] Failed to open FFMPEG.md in preview, trying to open as text:', err);
                    vscode.workspace.openTextDocument(ffmpegDocPath)
                        .then(doc => vscode.window.showTextDocument(doc));
                });
        }));
        
    } catch (error) {
        logError('[Extension] Failed to activate extension:', error);
        vscode.window.showErrorMessage(`Failed to activate Speech To Text STT: ${error}`);
        throw error;
    }
}

export function deactivate() {
    logInfo('[Extension] Deactivating Speech To Text STT extension...');
    
    if (extensionController) {
        extensionController.dispose();
        extensionController = null;
    }
    
    logInfo('[Extension] Speech To Text STT extension deactivated.');
} 