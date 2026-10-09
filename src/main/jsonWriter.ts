import { app } from 'electron';
import { renameSync, writeFileSync } from 'fs';

// Batches frequent saves of a JSON file into one write after a quiet period.
// Writes go to a temp file and are renamed over the target, so a crash never leaves a half-written file.
// Pending writes are flushed when the app quits.

export interface JsonWriter {
    schedule(): void;
    flush(): void;
}

const writers = new Set<JsonWriter>();

export const flushJsonWriters = () => {
    writers.forEach(writer => writer.flush());
};

app.on('will-quit', flushJsonWriters);

export const createJsonWriter = (getPath: () => string, getData: () => unknown, delayMs: number): JsonWriter => {
    let timer: NodeJS.Timeout | null = null;

    const writer: JsonWriter = {
        schedule() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => writer.flush(), delayMs);
        },
        flush() {
            if (!timer) return;
            clearTimeout(timer);
            timer = null;
            const filePath = getPath();
            try {
                writeFileSync(`${filePath}.tmp`, JSON.stringify(getData()), 'utf-8');
                renameSync(`${filePath}.tmp`, filePath);
            } catch (error) {
                console.error(`Error saving ${filePath}:`, error);
            }
        }
    };

    writers.add(writer);
    return writer;
};
