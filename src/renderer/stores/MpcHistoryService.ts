import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface MpcWatchEntry {
    filename: string;
    filePosition: number;
    fileDuration: number;
    lastOpened: string;
}

const MPC_REG_KEY = 'HKCU\\Software\\MPC-HC\\MPC-HC\\MediaHistory';

let _cache: Record<string, MpcWatchEntry> = {};
let _lastLoaded = 0;
const CACHE_TTL = 10000;

// .reg value: "string" (with \\ and \" escapes), dword:hex or hex(b):little-endian QWORD bytes
const parseRegValue = (raw: string): string | number => {
    if (raw.startsWith('"')) {
        return raw.slice(1, -1).replace(/\\(.)/g, '$1');
    }
    if (raw.startsWith('dword:')) {
        return parseInt(raw.slice(6), 16);
    }
    if (raw.startsWith('hex(b):')) {
        const bytes = raw.slice(7).split(',').map(b => parseInt(b.trim(), 16));
        return bytes.reduceRight((value, byte) => value * 256 + (byte || 0), 0);
    }
    return raw;
};

const toNumber = (value: string | number | undefined): number =>
    typeof value === 'number' ? value : parseInt(value || '0', 10) || 0;

// reg export writes UTF-16, so non-ASCII paths survive (console output of reg query uses the OEM code page).
export const readMpcHistory = async (): Promise<Record<string, MpcWatchEntry>> => {
    const now = Date.now();
    if (now - _lastLoaded < CACHE_TTL && _lastLoaded > 0) {
        return _cache;
    }
    const exportPath = path.join(os.tmpdir(), `filmster-mpc-history-${process.pid}.reg`);
    try {
        await execFileAsync('reg', ['export', MPC_REG_KEY, exportPath, '/y'], { windowsHide: true });
        const text = (await fs.readFile(exportPath, 'utf16le')).replace(/^\uFEFF/, '');

        const entries: Record<string, MpcWatchEntry> = {};
        const addEntry = (values: Record<string, string | number>) => {
            const filename = typeof values.Filename === 'string' ? values.Filename.trim() : '';
            if (!filename) return;
            entries[filename.toLowerCase()] = {
                filename,
                filePosition: toNumber(values.FilePosition),
                fileDuration: toNumber(values.FileDuration),
                lastOpened: typeof values.LastOpened === 'string' ? values.LastOpened : ''
            };
        };

        let values: Record<string, string | number> = {};
        // Long hex values continue on the next line after a trailing backslash
        for (const line of text.replace(/\\\r?\n\s*/g, '').split(/\r?\n/)) {
            if (line.startsWith('[')) {
                addEntry(values);
                values = {};
                continue;
            }
            const match = line.match(/^"((?:[^"\\]|\\.)*)"=(.*)$/);
            if (match) {
                values[match[1]] = parseRegValue(match[2]);
            }
        }
        addEntry(values);

        _cache = entries;
        _lastLoaded = now;
        return entries;
    } catch (error) {
        console.error('Error reading MPC history:', error);
        _lastLoaded = now;
        return _cache;
    } finally {
        fs.unlink(exportPath).catch(() => undefined);
    }
};

export const findMpcEntryByPath = (
    history: Record<string, MpcWatchEntry>,
    filePath: string
): MpcWatchEntry | null => {
    const fileName = filePath.split('\\').pop()?.toLowerCase() || '';
    for (const [path, entry] of Object.entries(history)) {
        const mpcFileName = path.split('\\').pop()?.toLowerCase() || '';
        if (mpcFileName === fileName) {
            return entry;
        }
    }
    return null;
};
