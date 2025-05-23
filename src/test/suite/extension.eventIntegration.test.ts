import *s vscode from 'vscode';
import * as sinon from 'sinon';
import * as assert from 'assert';
import { eventManager } from '../../events/eventManager';
import { EventType } from '../../events/events';
import { IRecorderService } from '../../services/recorderService';
import { TranscriptionService } from '../../services/transcriptionService';
import { FFmpegRecorderService } from '../../services/ffmpegRecorderService';
import { SttViewProvider } from '../../views/sttViewProvider';
import { initializeStatusBar } from '../../utils/statusBarUtils';

// Helper function to delay execution
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

suite('Extension Event Integration Tests', () => {
    let extension: vscode.Extension<any>;
    let sandbox: sinon.SinonSandbox;
    let mockRecorderService: sinon.SinonStubbedInstance<IRecorderService>;
    let mockTranscriptionService: sinon.SinonStubbedInstance<TranscriptionService>;
    let emitSpy: sinon.SinonSpy;

    suiteSetup(async () => {
        // Activate the extension
        extension = vscode.extensions.getExtension('vscode-speech-to-text-stt.speech-to-text-stt')!;
        if (!extension) {
            console.error("Extension not found!");
            return;
        }
        await extension.activate();
        console.log("Extension activated for integration tests.");

        // It's crucial that the real eventManager is used by the extension,
        // so we spy on the global instance's emit method.
        emitSpy = sinon.spy(eventManager, 'emit');
    });

    setup(async () => {
        sandbox = sinon.createSandbox();
        emitSpy.resetHistory(); // Reset spy history before each test

        // Mock services - these are used by the actions when commands are executed
        // We need to replace the actual services used by the extension.
        // This is tricky as services are often instantiated within activate() or other modules.
        // For robust tests, dependency injection or a way to replace service instances globally is better.
        // For now, we assume actions will pick up these mocks if commands are structured to allow it,
        // or we might need to stub methods on the actual instances if they are accessible.

        // Example: Stubbing methods on the actual recorderService instance if accessible
        // This requires the extension to export or provide access to its services.
        // Let's assume for now that the actions/commands can be made to use these stubs.
        // If not, this part needs refinement based on how the extension is structured.

        mockRecorderService = sandbox.createStubInstance(FFmpegRecorderService); // Use a concrete class for stubbing
        
        // Default stub behaviors
        mockRecorderService.isRecording = false;
        mockRecorderService.startRecording.returns(new vscode.EventEmitter<Buffer>().event); // Mock a stream
        mockRecorderService.stopRecording.returns(undefined);
        mockRecorderService.listMicrophones.resolves([{ id: 0, name: 'Mock Mic' }]);

        // Replace the actual recorder service instance used by commands.
        // This is a common challenge in VS Code extension testing.
        // One way is to modify the extension's context or use a test-specific setup.
        // For now, we'll assume such a mechanism is in place or can be added.
        // If 'extension.exports' provides access, use it. Otherwise, this is illustrative.
        if (extension.exports && extension.exports.services) {
             extension.exports.services.recorderService = mockRecorderService;
        } else {
            console.warn("Cannot directly replace recorderService for testing. Actions might use actual service.");
            // As a fallback, try to stub the prototype if actions create their own instances,
            // though this is less ideal and might not always work as expected.
            // sinon.stub(FFmpegRecorderService.prototype, "startRecording").returns(new vscode.EventEmitter<Buffer>().event);
            // sinon.stub(FFmpegRecorderService.prototype, "isRecording").get(() => false);
        }


        // Mock Transcription Service
        mockTranscriptionService = sandbox.createStubInstance(TranscriptionService);
        mockTranscriptionService.transcribeFile.resolves("mock transcription");
        mockTranscriptionService.isClientAvailable.returns(true);
        mockTranscriptionService.ensureProviderConfiguration.returns(true);

        if (extension.exports && extension.exports.services) {
            extension.exports.services.transcriptionService = mockTranscriptionService;
        } else {
             console.warn("Cannot directly replace transcriptionService for testing.");
        }

        // Reset relevant extension state if possible (e.g., selectedDeviceId)
        // This might involve calling commands or directly setting state if exposed for testing.
        // For example, ensure no recording is active before tests that start one.
        try {
            await vscode.commands.executeCommand('setContext', 'speechToTextStt.isRecordingActive', false);
        } catch (e) {
            console.warn("Could not set context 'speechToTextStt.isRecordingActive' during test setup.", e);
        }
    });

    teardown(() => {
        sandbox.restore();
        emitSpy.resetHistory();
    });

    suiteTeardown(() => {
        if (emitSpy) {
            emitSpy.restore();
        }
    });

    test('Recording Start: should emit RecordingStarted event when startRecording command is executed', async () => {
        // Arrange
        // Mock the recorderService.startRecording to simulate successful start
        // This is tricky if the command directly news up FFmpegRecorderService.
        // This test relies on the command using a replaceable/mockable service instance.
        
        // If FFmpegRecorderService is directly instantiated in startRecordingAction,
        // we need to stub its prototype's method BEFORE the action is called.
        const startRecordingStub = sinon.stub(FFmpegRecorderService.prototype, 'startRecording');
        const mockAudioStream = new vscode.EventEmitter<Buffer>();
        startRecordingStub.returns(mockAudioStream.event); // Return a mock stream event
        
        // Stub isRecording getter
        const isRecordingStub = sinon.stub(FFmpegRecorderService.prototype, 'isRecording');
        isRecordingStub.get(() => false); // Initially not recording


        // Act
        await vscode.commands.executeCommand('speech-to-text-stt.startRecording');
        await delay(100); // Allow time for async operations within the command

        // Assert
        // Check if eventManager.emit was called with RecordingStarted
        const recordingStartedCall = emitSpy.getCalls().find(call => call.args[0] === EventType.RecordingStarted);
        assert.ok(recordingStartedCall, 'RecordingStarted event should have been emitted');
        
        // Restore stubs on prototype
        startRecordingStub.restore();
        isRecordingStub.restore();
    });

    // Test Case: Transcription Cycle
    test('Transcription Cycle: should emit RecordingStopped, TranscriptionStarted, and TranscriptionCompleted events', async () => {
        // Arrange
        const fakeAudioFilePath = '/fake/path/to/audio.wav';
        const mockTranscriptionText = 'Hello, this is a test transcription.';

        // Mock recorderService behavior for this test
        // Simulate that recording was active and is now stopping
        const isRecordingStub = sinon.stub(FFmpegRecorderService.prototype, 'isRecording');
        isRecordingStub.get(() => true); // Simulate recording is active before stop
        const stopRecordingStub = sinon.stub(FFmpegRecorderService.prototype, 'stopRecording');
        stopRecordingStub.callsFake(() => {
            isRecordingStub.get(() => false); // Simulate recording stops
            // The action expects audioChunks to be populated and then saves them.
            // We need to ensure the action's logic for saving file can be bypassed or mocked too,
            // or that it uses the provided filePath from RecordingStopped event.
            // For this test, let's assume stopRecordingAction will eventually get/save a file path.
            // The event emission for RecordingStopped should happen *within* stopRecordingAction.
        });
        
        // Mock transcriptionService behavior
        // This is more complex if the service is newed up in the action.
        // Assuming the action uses a replaceable or globally stubbable instance.
        // If TranscriptionService is directly instantiated, this won't work.
        // Let's try stubbing the prototype directly for this case.
        const transcribeFileStub = sinon.stub(extension.exports.TranscriptionService.prototype, 'transcribeFile');
        transcribeFileStub.resolves(mockTranscriptionText);
        
        // Stub file saving utility to control the file path
        const saveAudioToFileStub = sinon.stub(extension.exports.fileUtils, 'saveAudioToFile');
        saveAudioToFileStub.resolves(fakeAudioFilePath); // Ensure it returns the expected path

        // Act
        // This command will internally call recorderService.stopRecording and then transcriptionService.transcribeFile
        await vscode.commands.executeCommand('speech-to-text-stt.stopRecordingAndTranscribe');
        await delay(500); // Allow time for async operations (file saving, transcription)

        // Assert
        const recordingStoppedCall = emitSpy.getCalls().find(call => call.args[0] === EventType.RecordingStopped);
        assert.ok(recordingStoppedCall, 'RecordingStopped event should have been emitted');
        assert.ok(recordingStoppedCall.args[1].filePath.endsWith('.wav'), 'RecordingStopped event should have a .wav file path');

        const transcriptionStartedCall = emitSpy.getCalls().find(call => call.args[0] === EventType.TranscriptionStarted);
        assert.ok(transcriptionStartedCall, 'TranscriptionStarted event should have been emitted');
        assert.ok(transcriptionStartedCall.args[1].filePath.endsWith('.wav'), 'TranscriptionStarted event should have a .wav file path');
        
        const transcriptionCompletedCall = emitSpy.getCalls().find(call => call.args[0] === EventType.TranscriptionCompleted);
        assert.ok(transcriptionCompletedCall, 'TranscriptionCompleted event should have been emitted');
        assert.strictEqual(transcriptionCompletedCall.args[1].text, mockTranscriptionText, 'TranscriptionCompleted event should have correct text');

        // Restore stubs
        isRecordingStub.restore();
        stopRecordingStub.restore();
        transcribeFileStub.restore();
        saveAudioToFileStub.restore(); // Restore file utility stub
    });

    // Test Case: Microphone Selection
    test('Microphone Selection: should emit MicrophoneSelected event when selectMicrophone command leads to a selection', async () => {
        // Arrange
        const mockDeviceId = 1;
        const mockDeviceName = 'Mock Mic 1';
        // Mock listMicrophones to return a list of devices
        const listMicrophonesStub = sinon.stub(FFmpegRecorderService.prototype, 'listMicrophones');
        listMicrophonesStub.resolves([{ id: mockDeviceId, name: mockDeviceName }, {id: 0, name: 'Default'}]);

        // Mock vscode.window.showQuickPick to simulate user selection
        const showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick');
        showQuickPickStub.resolves({ label: mockDeviceName, detail: String(mockDeviceId) } as vscode.QuickPickItem);

        // Act
        await vscode.commands.executeCommand('speech-to-text-stt.selectMicrophone');
        await delay(100);

        // Assert
        const micSelectedCall = emitSpy.getCalls().find(call => call.args[0] === EventType.MicrophoneSelected);
        assert.ok(micSelectedCall, 'MicrophoneSelected event should have been emitted');
        assert.strictEqual(micSelectedCall.args[1].deviceId, mockDeviceId, 'MicrophoneSelected event should have correct deviceId');
        
        listMicrophonesStub.restore();
        // showQuickPickStub is restored by sandbox.restore()
    });

    // Test Case: History Events
    test('History Events: should emit HistoryCleared and HistoryItemCopied events correctly', async () => {
        // Arrange
        const textToCopy = "sample history text";

        // Act & Assert for HistoryCleared
        // Mock showWarningMessage to automatically confirm clearing
        const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves("Clear History" as any);
        
        await vscode.commands.executeCommand('speech-to-text-stt.clearHistory');
        await delay(100);
        
        const historyClearedCall = emitSpy.getCalls().find(call => call.args[0] === EventType.HistoryCleared);
        assert.ok(historyClearedCall, 'HistoryCleared event should have been emitted after clearHistory command');
        showWarningStub.restore(); // Restore before next command that might use it
        emitSpy.resetHistory(); // Reset for the next part of the test

        // Act & Assert for HistoryItemCopied
        // Stub clipboard writeText
        const clipboardStub = sandbox.stub(vscode.env.clipboard, 'writeText');
        clipboardStub.resolves();

        await vscode.commands.executeCommand('speech-to-text-stt.copyHistoryItem', { fullText: textToCopy });
        await delay(100);

        const historyItemCopiedCall = emitSpy.getCalls().find(call => call.args[0] === EventType.HistoryItemCopied);
        assert.ok(historyItemCopiedCall, 'HistoryItemCopied event should have been emitted after copyHistoryItem command');
        assert.strictEqual(historyItemCopiedCall.args[1].text, textToCopy, 'HistoryItemCopied event should have correct text');
    });


    // Example test for a subscriber (SttViewProvider refresh on RecordingStarted)
    // This is more complex and requires careful setup.
    test('Subscriber Test (SttViewProvider): should refresh view when RecordingStarted event is emitted', async () => {
        // Arrange
        // Get the actual SttViewProvider instance if possible, or create one for testing
        // This assumes the extension exports its view provider or it can be accessed.
        let viewProvider = extension.exports?.sttViewProvider as SttViewProvider | undefined;
        
        if (!viewProvider) {
            console.warn("SttViewProvider instance not accessible from extension.exports. Skipping SttViewProvider subscriber test.");
            return;
        }
        // Ensure viewProvider's internal subscriptions are active if it was freshly created or re-created for test
        // This might not be necessary if the instance from extension.exports is the live one.

        const refreshSpy = sandbox.spy(viewProvider, 'refresh'); // Spy on the actual instance's method

        // Act: Emit the event directly
        eventManager.emit(EventType.RecordingStarted, {});
        await delay(50); // Allow time for event propagation

        // Assert
        assert.ok(refreshSpy.calledOnce, 'SttViewProvider.refresh should have been called on RecordingStarted event');
        
        refreshSpy.restore(); // Important to restore spy
    });


    // Test for status bar update on RecordingStarted
    // This requires the statusBarUtils to have been initialized with a real StatusBarItem
    // and for its event listeners to be active.
    test('Subscriber Test (StatusBar): should update status bar when RecordingStarted event is emitted', async () => {
        // Arrange
        // The statusBarUtils should already be initialized by `activate()`
        // We need to spy on the internal function that updates the text, or a public one if available.
        // Let's assume `_updateStatusBarDisplay` is not directly accessible for spying.
        // We can check the status bar item's properties directly.
        
        const statusBarItem = extension.exports?.statusBarItem as vscode.StatusBarItem | undefined;
        if (!statusBarItem) {
            console.warn("StatusBarItem instance not accessible. Skipping StatusBar subscriber test.");
            return;
        }
        // Ensure statusBarUtils are initialized with this item
        // This should have happened in activate(), but for a test, explicit re-setup or checking might be needed
        // if the test environment is very isolated or resets modules.
        // initializeStatusBar(statusBarItem); // This might re-subscribe, ensure it's safe or use a flag.

        const initialText = statusBarItem.text;

        // Act: Emit the event directly using the global eventManager
        eventManager.emit(EventType.RecordingStarted, {});
        await delay(50); // Allow time for event propagation

        // Assert
        assert.notStrictEqual(statusBarItem.text, initialText, "StatusBar text should change on RecordingStarted");
        assert.ok(statusBarItem.text.includes("Recording"), "StatusBar text should indicate recording: " + statusBarItem.text);
        assert.strictEqual(statusBarItem.command, 'speech-to-text-stt.stopRecordingAndTranscribe', "StatusBar command should be for stopping");

        // Reset to idle state for other tests (if needed) by emitting RecordingStopped
        eventManager.emit(EventType.RecordingStopped, {});
        await delay(50); // Allow time for event propagation
        assert.ok(statusBarItem.text.includes("Idle"), "StatusBar text should reset to Idle: " + statusBarItem.text);
    });

});
