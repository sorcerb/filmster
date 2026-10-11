import { getAutoScan } from '../renderer/stores/AutoScanStore';
import { scanMediaFilesIncremental } from './scanFiles';

let autoScanInterval: NodeJS.Timeout | null = null;
const AUTO_SCAN_INTERVAL_MS = 10000;

export const updateAutoScan = (enabled: boolean) => {
    if (autoScanInterval) {
        clearInterval(autoScanInterval);
        autoScanInterval = null;
    }

    if (!enabled) return;

    autoScanInterval = setInterval(() => {
        try {
            scanMediaFilesIncremental();
        } catch (error) {
            console.error('Error in auto-scan:', error);
        }
    }, AUTO_SCAN_INTERVAL_MS);

    autoScanInterval.unref();
};

export const initAutoScan = () => {
    const enabled = getAutoScan();
    updateAutoScan(enabled);
};
initAutoScan();
