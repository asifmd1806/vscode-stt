import { SttEvent } from './types';
import { logInfo } from '../utils/logger';

type EventHandler = (event: SttEvent) => void;

class EventBus {
    private handlers: Map<SttEvent['type'], EventHandler[]> = new Map();

    subscribe(eventType: SttEvent['type'], handler: EventHandler): void {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, []);
        }
        this.handlers.get(eventType)!.push(handler);
    }

    unsubscribe(eventType: SttEvent['type'], handler: EventHandler): void {
        const handlers = this.handlers.get(eventType);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(event: SttEvent): void {
        const handlers = this.handlers.get(event.type) || [];
        handlers.forEach(handler => {
            try {
                handler(event);
            } catch (error) {
                logInfo(`[EventBus] Error in event handler for ${event.type}:`, error);
            }
        });
    }
}

export const events = new EventBus(); 