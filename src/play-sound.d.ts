// Minimal type declaration for play-sound
declare module 'play-sound' {
    interface PlayOpts {
        
    }

    interface Player {
        play(file: string, callback?: (err: any) => void): any;
        play(file: string, options?: PlayOpts, callback?: (err: any) => void): any;
    }

    function playSound(opts?: PlayOpts): Player;

    export = playSound;
} 