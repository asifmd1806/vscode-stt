import * as assert from 'assert';
import { EventManager, eventManager as globalEventManager } from '../../../events/eventManager';
import { EventType, AppEvent } from '../../../events/events';

interface TestEventData extends AppEvent {
    payload: string;
}

const TEST_EVENT_TYPE = EventType.ExtensionActivated; // Using an existing event type for simplicity

suite('EventManager Unit Tests', () => {
    let eventManagerInstance: EventManager;

    setup(() => {
        eventManagerInstance = new EventManager();
    });

    test('should call subscriber callback when an event is emitted', (done) => {
        const eventData: TestEventData = { payload: 'test_payload' };

        eventManagerInstance.subscribe(TEST_EVENT_TYPE, (event: AppEvent) => {
            assert.ok(event.timestamp, 'Event should have a timestamp');
            const receivedData = event as TestEventData;
            assert.strictEqual(receivedData.payload, eventData.payload, 'Event data payload should match');
            done();
        });

        eventManagerInstance.emit(TEST_EVENT_TYPE, eventData);
    });

    test('should pass event data correctly to the callback', (done) => {
        const eventData: TestEventData = { payload: 'data_check' };

        eventManagerInstance.subscribe(TEST_EVENT_TYPE, (event: AppEvent) => {
            const receivedData = event as TestEventData;
            assert.deepStrictEqual(receivedData.payload, eventData.payload, 'Payload should be identical');
            assert.ok(event.timestamp instanceof Date, 'Timestamp should be a Date object');
            done();
        });

        eventManagerInstance.emit(TEST_EVENT_TYPE, eventData);
    });

    test('should not call any callback if emitting an event with no subscribers', () => {
        let called = false;
        // Create another EventManager to ensure no global state interference for this specific test
        const isolatedEventManager = new EventManager();
        isolatedEventManager.subscribe(TEST_EVENT_TYPE, () => {
            called = true; // This should not be called if emitting on eventManagerInstance
        });

        eventManagerInstance.emit(EventType.ExtensionDeactivated, { payload: 'no_one_listening' });
        assert.strictEqual(called, false, 'Callback should not have been called');
    });


    test('should handle multiple subscribers for the same event', () => {
        let callback1Called = false;
        let callback2Called = false;
        const eventData: TestEventData = { payload: 'multi_subscriber_test' };

        eventManagerInstance.subscribe(TEST_EVENT_TYPE, (event: AppEvent) => {
            assert.strictEqual((event as TestEventData).payload, eventData.payload);
            callback1Called = true;
        });

        eventManagerInstance.subscribe(TEST_EVENT_TYPE, (event: AppEvent) => {
            assert.strictEqual((event as TestEventData).payload, eventData.payload);
            callback2Called = true;
        });

        eventManagerInstance.emit(TEST_EVENT_TYPE, eventData);

        assert.ok(callback1Called, 'First callback should have been called');
        assert.ok(callback2Called, 'Second callback should have been called');
    });

    test('unsubscribe should remove a specific subscriber', () => {
        let callback1Called = false;
        let callback2Called = false;
        const eventData: TestEventData = { payload: 'unsubscribe_test' };

        const callbackToUnsubscribe = (event: AppEvent) => {
            callback1Called = true;
        };
        const callbackToKeep = (event: AppEvent) => {
            assert.strictEqual((event as TestEventData).payload, eventData.payload);
            callback2Called = true;
        };

        eventManagerInstance.subscribe(TEST_EVENT_TYPE, callbackToUnsubscribe);
        eventManagerInstance.subscribe(TEST_EVENT_TYPE, callbackToKeep);

        eventManagerInstance.unsubscribe(TEST_EVENT_TYPE, callbackToUnsubscribe);
        eventManagerInstance.emit(TEST_EVENT_TYPE, eventData);

        assert.strictEqual(callback1Called, false, 'Unsubscribed callback should not have been called');
        assert.ok(callback2Called, 'Remaining callback should have been called');
    });

    test('unsubscribing one listener doesn\'t affect others for the same event', () => {
        let callback1Count = 0;
        let callback2Count = 0;
        let callback3Count = 0;

        const callback1 = () => { callback1Count++; };
        const callback2 = () => { callback2Count++; }; // This one will be unsubscribed
        const callback3 = () => { callback3Count++; };

        eventManagerInstance.subscribe(TEST_EVENT_TYPE, callback1);
        eventManagerInstance.subscribe(TEST_EVENT_TYPE, callback2);
        eventManagerInstance.subscribe(TEST_EVENT_TYPE, callback3);

        eventManagerInstance.unsubscribe(TEST_EVENT_TYPE, callback2);

        eventManagerInstance.emit(TEST_EVENT_TYPE, { payload: 'test1' });

        assert.strictEqual(callback1Count, 1, 'Callback 1 should be called once');
        assert.strictEqual(callback2Count, 0, 'Callback 2 should not be called');
        assert.strictEqual(callback3Count, 1, 'Callback 3 should be called once');
        
        eventManagerInstance.emit(TEST_EVENT_TYPE, { payload: 'test2' });
        
        assert.strictEqual(callback1Count, 2, 'Callback 1 should be called twice');
        assert.strictEqual(callback2Count, 0, 'Callback 2 should still not be called');
        assert.strictEqual(callback3Count, 2, 'Callback 3 should be called twice');
    });
    
    test('unsubscribing a non-existent listener should not throw an error or affect others', () => {
        let called = false;
        const callback = () => { called = true; };
        const nonExistentCallback = () => {};

        eventManagerInstance.subscribe(TEST_EVENT_TYPE, callback);
        
        // Attempt to unsubscribe a callback that was never subscribed
        eventManagerInstance.unsubscribe(TEST_EVENT_TYPE, nonExistentCallback);
        // Attempt to unsubscribe from an event type with no listeners
        eventManagerInstance.unsubscribe(EventType.ExtensionDeactivated, callback);

        eventManagerInstance.emit(TEST_EVENT_TYPE, { payload: 'test_unsub_nonexistent' });
        assert.ok(called, 'Subscribed callback should still be called');
    });

    suite('Global EventManager Instance', () => {
        // Note: Tests for the global instance might affect each other if not careful with event types or state.
        // Using distinct event types or ensuring cleanup if stateful listeners are added.

        const GLOBAL_TEST_EVENT_TYPE = EventType.HistoryCleared; // Use a different event type

        test('global eventManager should subscribe and emit events', (done) => {
            const eventData: TestEventData = { payload: 'global_test' };

            globalEventManager.subscribe(GLOBAL_TEST_EVENT_TYPE, (event: AppEvent) => {
                assert.ok(event.timestamp, 'Global event should have a timestamp');
                const receivedData = event as TestEventData;
                assert.strictEqual(receivedData.payload, eventData.payload, 'Global event data payload should match');
                // Cleanup: unsubscribe to prevent interference with other tests
                globalEventManager.unsubscribe(GLOBAL_TEST_EVENT_TYPE, arguments.callee); 
                done();
            });

            globalEventManager.emit(GLOBAL_TEST_EVENT_TYPE, eventData);
        });

        test('global eventManager unsubscribe works', () => {
            let callCount = 0;
            const callback = () => { callCount++; };
            const GLOBAL_UNSUB_EVENT_TYPE = EventType.HistoryItemCopied;


            globalEventManager.subscribe(GLOBAL_UNSUB_EVENT_TYPE, callback);
            globalEventManager.emit(GLOBAL_UNSUB_EVENT_TYPE, { text: 'test copy 1' });
            assert.strictEqual(callCount, 1, 'Callback should be called once before unsubscribe');

            globalEventManager.unsubscribe(GLOBAL_UNSUB_EVENT_TYPE, callback);
            globalEventManager.emit(GLOBAL_UNSUB_EVENT_TYPE, { text: 'test copy 2' });
            assert.strictEqual(callCount, 1, 'Callback should not be called after unsubscribe');
        });
    });
});
