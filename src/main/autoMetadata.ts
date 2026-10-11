import { MediaFileModel } from '../renderer/models/MediaFileModel';
import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { getBackdropPath, getPosterPath, loadMetadata, saveBackdrop, saveMetadata } from '../renderer/stores/metadataService';
import { buildMetadataFromFilm, MetadataApiError, MetadataProvider } from '../shared/metadataApi';
import { findFilm, getFilmDetails, getProviderOrder, hasAnyProviderKey } from './metadataProviders';
import { getAllMediaFiles, scanEvents } from './scanFiles';
import { broadcast } from './rpc';

// New files found by a scan get their metadata (title, description, poster) loaded automatically.
// Client events (app window and browsers): 'media-files-changed' after a scan, 'metadata-updated' (metadataId) after a download.

const REQUEST_DELAY_MS = 300;

const queue: MediaFileModel[] = [];
const queuedIds = new Set<string>();
// Ids that were already looked up in this session (found or not), so they are not requested on every scan
const processedIds = new Set<string>();
let isProcessing = false;

const hasMetadata = (metadataId: string) => {
    try {
        return loadMetadata(metadataId) != null || getPosterPath(metadataId) != null;
    } catch {
        return false;
    }
};

const enqueue = (files: MediaFileModel[]) => {
    for (const file of files) {
        const id = file.metadataId;
        if (!id || queuedIds.has(id) || processedIds.has(id)) continue;
        if (hasMetadata(id)) {
            processedIds.add(id);
            continue;
        }
        queuedIds.add(id);
        queue.push(file);
    }
    processQueue();
};

const processQueue = async () => {
    if (isProcessing) return;
    isProcessing = true;
    // Providers with a bad key or exceeded quota, skipped until the queue is done
    const failedProviders = new Set<MetadataProvider>();
    try {
        while (queue.length) {
            const file = queue.shift()!;
            queuedIds.delete(file.metadataId);
            processedIds.add(file.metadataId);

            if (!hasAnyProviderKey()) {
                queue.length = 0;
                queuedIds.clear();
                break;
            }

            try {
                const film = await findFilm(file.parsedName, file.year, failedProviders);
                const metadata = film && buildMetadataFromFilm(file.metadataId, film);
                if (metadata) {
                    await saveMetadata(metadata, film);
                    broadcast('metadata-updated', file.metadataId);
                }
            } catch (error) {
                console.error(`Error loading metadata for ${file.parsedName}:`, error);
                if (error instanceof MetadataApiError) {
                    // Bad keys or quota exceeded for all providers: the rest would fail too ("Load all metadata" can be used later)
                    queue.length = 0;
                    queuedIds.clear();
                    break;
                }
            }

            await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
        }
    } finally {
        isProcessing = false;
    }
};

// Titles saved before backdrops were loaded, or found by a Kinopoisk keyword search (its results have none):
// the backdrop is looked up when the title's page is opened, once per session, and a month later again if the provider had none
const BACKDROP_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const backdropLookups = new Map<string, Promise<boolean>>();

const lookUpBackdrop = async (metadataId: string): Promise<boolean> => {
    const loaded = loadMetadata(metadataId);
    if (!loaded || loaded.noBackdrop || getBackdropPath(metadataId)) return false;
    if (loaded.backdropCheckedAt && Date.now() - loaded.backdropCheckedAt < BACKDROP_RECHECK_MS) return false;

    const { tmdb, kinopoisk } = loaded.externalIds ?? {};
    const provider: MetadataProvider | null = tmdb ? 'tmdb' : kinopoisk ? 'kinopoisk' : null;
    if (!provider || !getProviderOrder().includes(provider)) return false;
    const film = {
        source: provider,
        filmId: Number(tmdb ?? kinopoisk),
        type: loaded.type === 'series' ? 'TV_SERIES' : 'FILM',
    } as MovieSearchResult;

    const details = await getFilmDetails(film);
    const found = !!details?.backdropUrl && await saveBackdrop(metadataId, details.backdropUrl, true);
    // Poster URLs are the files' ones, set when loading
    const { posterUrl, posterUrlPreview, backdropUrl, ...metadata } = loaded;
    if (!found) {
        await saveMetadata({ ...metadata, backdropCheckedAt: Date.now() }, null, null, { kind: 'keep' });
        return false;
    }
    broadcast('metadata-updated', metadataId);
    return true;
};

// True if a backdrop was saved
export const loadMissingBackdrop = (metadataId: string): Promise<boolean> => {
    const key = metadataId.toLowerCase();
    let lookup = backdropLookups.get(key);
    if (!lookup) {
        lookup = lookUpBackdrop(metadataId).catch(error => {
            console.error(`Error loading backdrop for ${metadataId}:`, error);
            return false;
        });
        backdropLookups.set(key, lookup);
    }
    return lookup;
};

// Library files that still have no metadata: on startup and after the API keys change,
// e.g. files scanned before a key was entered or whose metadata files were deleted
export const enqueueMissingMetadata = () => {
    if (!hasAnyProviderKey()) return;
    // A new key may find what the old ones didn't
    processedIds.clear();
    enqueue(getAllMediaFiles());
};

scanEvents.on('changed', ({ added }: { added: MediaFileModel[] }) => {
    broadcast('media-files-changed');
    if (added.length) enqueue(added);
});
