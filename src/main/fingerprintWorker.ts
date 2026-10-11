import { parentPort } from 'worker_threads';
import { findSharedSegments, Fingerprint, fingerprint } from './audioFingerprint';

export type FingerprintTask =
    | { type: 'fingerprint'; samples: Int16Array }
    | { type: 'match'; a: Fingerprint; b: Fingerprint; minFrames: number; maxFrames: number };

parentPort!.on('message', ({ id, task }: { id: number; task: FingerprintTask }) => {
    try {
        if (task.type === 'fingerprint') {
            const result = fingerprint(task.samples);
            parentPort!.postMessage({ id, result }, [result.codes.buffer as ArrayBuffer, result.silent.buffer as ArrayBuffer]);
        } else {
            parentPort!.postMessage({ id, result: findSharedSegments(task.a, task.b, task.minFrames, task.maxFrames) });
        }
    } catch (error) {
        parentPort!.postMessage({ id, error: String(error) });
    }
});
