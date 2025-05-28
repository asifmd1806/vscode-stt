import * as vscode from 'vscode';
import { getGeneralSetting } from '../config/settings';

export class TranscriptionActionsService {
    handleTranscriptionActions(text: string): void {
        // Auto-copy to clipboard
        if (getGeneralSetting('copyToClipboardAfterTranscription')) {
            vscode.env.clipboard.writeText(text);
            vscode.window.showInformationMessage('Transcription copied to clipboard');
        }

        // Auto-insert into editor
        if (getGeneralSetting('insertIntoEditorAfterTranscription')) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, text);
                });
            }
        }
    }

    async showTranscriptionProgress<T>(
        title: string,
        task: () => Promise<T>
    ): Promise<T | undefined> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: title,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Processing audio...' });
            
            try {
                const result = await task();
                progress.report({ increment: 100, message: 'Complete!' });
                return result;
            } catch (error) {
                throw error;
            }
        });
    }
} 