import { EventType, AppEvent } from './events';
import * as vscode from 'vscode'; // Ensure vscode is imported for Disposable type

// Define EventCallback more generically for flexibility with specific event types.
type EventCallback<T extends AppEvent = AppEvent> = (event: T) => void;

interface EventListeners {
  [key: string]: EventCallback<any>[]; // Store callbacks of any AppEvent subtype
}

export class EventManager {
  private listeners: EventListeners = {};

  subscribe<T extends AppEvent>(eventType: EventType, callback: EventCallback<T>): vscode.Disposable {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(callback);

    return {
      dispose: () => this.unsubscribe(eventType, callback)
    };
  }

  unsubscribe(eventType: EventType, callback: EventCallback<any>): void { // Adjusted callback type here
    if (!this.listeners[eventType]) {
      return;
    }
    this.listeners[eventType] = this.listeners[eventType].filter(
      (cb) => cb !== callback
    );
  }

  emit(eventType: EventType, eventData: any): void { 
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
