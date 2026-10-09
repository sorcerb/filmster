import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../main/updater';
import { isWebClient } from '../webApi';

// Update state from main/updater.ts, kept current by its events; null in a browser on the network
export const useUpdateStatus = (): UpdateStatus | null => {
    const [status, setStatus] = useState<UpdateStatus | null>(null);

    useEffect(() => {
        if (isWebClient) return;
        window.electron.getUpdateStatus()
            .then(setStatus)
            .catch(error => console.error('Error reading update status:', error));
        return window.electron.onUpdateStatus(setStatus);
    }, []);

    return status;
};
