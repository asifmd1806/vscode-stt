declare module 'speech-recorder' {
    interface SpeechRecorderOptions {
        device?: number | string;
        sampleRate?: number;
        samplesPerFrame?: number;
        vad?: any; 
        onAudio: (data: { audio: Buffer }) => void;
        onError?: (error: any) => void;
    }

    export class SpeechRecorder {
        constructor(options: SpeechRecorderOptions);
        start(): void;
        stop(): void;
    }

    export function devices(): Array<{ id: number; name: string; }>;
} 