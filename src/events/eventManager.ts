import { EventType, AppEvent } from './events';

type EventCallback = (event: AppEvent) => void;

interface EventListeners {
  [key: string]: EventCallback[];
}

export class EventManager {
  private listeners: EventListeners = {};

  subscribe(eventType: EventType, callback: EventCallback): void {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(callback);
  }

  unsubscribe(eventType: EventType, callback: EventCallback): void {
    if (!this.listeners[eventType]) {
      return;
    }
    this.listeners[eventType] = this.listeners[eventType].filter(
      (cb) => cb !== callback
    );
  }

  emit(eventType: EventType, eventData: AppEvent): void {
    if (!this.listeners[eventType]) {
      return;
    }
    this.listeners[eventType].forEach((callback) => {
      callback({ ...eventData, timestamp: new Date() });
    });
  }
}

// Global instance for easy access
export const eventManager = new EventManager();
