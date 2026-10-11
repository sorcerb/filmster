import { MediaFileModel } from '../renderer/models/MediaFileModel';
import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { getBackdropPath, getPosterPath, loadMetadata, saveBackdrop, saveMetadata } from '../renderer/stores/metadataService';
import { buildMetadataFromFilm, MetadataApiError, MetadataProvider } from '../shared/metadataApi';
import { findFilm, getBackdropCandidates, getFilmCredits, getProviderOrder, hasAnyProviderKey } from './metadataProviders';
import { getAllMediaFiles, scanEvents } from './scanFiles';
import { broadcast } from './rpc';

const REQUEST_DELAY_MS = 300;

const queue: MediaFileModel[] = [];
const queuedIds = new Set<string>();
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
                    await loadMissingDetails(file.metadataId);
                }
            } catch (error) {
                console.error(`Error loading metadata for ${file.parsedName}:`, error);
                if (error instanceof MetadataApiError) {
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

const BACKDROP_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const detailsLookups = new Map<string, Promise<boolean>>();

type LoadedMetadata = NonNullable<ReturnType<typeof loadMetadata>>;

const getMetadataFilm = (loaded: LoadedMetadata): MovieSearchResult | null => {
    const { tmdb, kinopoisk } = loaded.externalIds ?? {};
    const provider: MetadataProvider | null = tmdb ? 'tmdb' : kinopoisk ? 'kinopoisk' : null;
    if (!provider || !getProviderOrder().includes(provider)) return null;
    return {
        source: provider,
        filmId: Number(tmdb ?? kinopoisk),
        type: loaded.type === 'series' ? 'TV_SERIES' : 'FILM',
    } as MovieSearchResult;
};

// Saves the metadata file only: poster and backdrop URLs are the files' ones, set when loading
const updateMetadata = (loaded: LoadedMetadata, changes: Partial<LoadedMetadata>) => {
    const { posterUrl, posterUrlPreview, backdropUrl, ...metadata } = loaded;
    return saveMetadata({ ...metadata, ...changes }, null, null, { kind: 'keep' });
};

const lookUpBackdrop = async (metadataId: string): Promise<boolean> => {
    const loaded = loadMetadata(metadataId);
    if (!loaded || loaded.noBackdrop || getBackdropPath(metadataId)) return false;
    if (loaded.backdropCheckedAt && Date.now() - loaded.backdropCheckedAt < BACKDROP_RECHECK_MS) return false;
    const film = getMetadataFilm(loaded);
    if (!film) return false;

    for (const url of (await getBackdropCandidates(film)).slice(0, 3)) {
        if (await saveBackdrop(metadataId, url, true).catch(() => false)) return true;
    }
    await updateMetadata(loaded, { backdropCheckedAt: Date.now() });
    return false;
};

// Saved empty if the provider lists nobody, so it isn't asked again
const lookUpCredits = async (metadataId: string): Promise<boolean> => {
    const loaded = loadMetadata(metadataId);
    if (!loaded || loaded.actors) return false;
    const film = getMetadataFilm(loaded);
    if (!film) return false;

    const { directors, actors } = await getFilmCredits(film);
    await updateMetadata(loaded, { directors, actors });
    return directors.length > 0 || actors.length > 0;
};

const lookUp = async (metadataId: string, name: string, lookUpPart: (metadataId: string) => Promise<boolean>) =>
    lookUpPart(metadataId).catch(error => {
        console.error(`Error loading ${name} for ${metadataId}:`, error);
        return false;
    });

// One after the other: both rewrite the metadata file.
export const loadMissingDetails = (metadataId: string): Promise<boolean> => {
    const key = metadataId.toLowerCase();
    let lookups = detailsLookups.get(key);
    if (!lookups) {
        lookups = (async () => {
            const hasBackdrop = await lookUp(metadataId, 'backdrop', lookUpBackdrop);
            const hasCredits = await lookUp(metadataId, 'cast', lookUpCredits);
            if (hasBackdrop || hasCredits) broadcast('metadata-updated', metadataId);
            return hasBackdrop || hasCredits;
        })();
        detailsLookups.set(key, lookups);
    }
    return lookups;
};

export const forgetMissingDetails = (metadataId: string) => detailsLookups.delete(metadataId.toLowerCase());

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
