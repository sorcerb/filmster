import { app, nativeImage, net } from 'electron';
import fs from 'fs';
import path from 'path';
import { MovieMetadata } from '../../renderer/models/MediaMetadata';
import { MovieSearchResult } from '../../renderer/models/MovieSearchResult';
import { BackdropChange, CustomPoster } from '../../shared/metadataApi';

let _metadataFolder: string | null = null;
let _postersFolder: string | null = null;

function getMetadataFolder(): string {
    if (!_metadataFolder) {
        const userDataPath = app.getPath('userData');
        _metadataFolder = path.join(userDataPath, 'metadata');
    }
    return _metadataFolder;
}

export function getPostersFolder(): string {
    if (!_postersFolder) {
        const userDataPath = app.getPath('userData');
        _postersFolder = path.join(userDataPath, 'metadata');
    }
    return _postersFolder;
}

function ensureDirectoriesExist() {
    const metadataFolder = getMetadataFolder();
    const postersFolder = getPostersFolder();
    
    if (!fs.existsSync(metadataFolder)) {
        fs.mkdirSync(metadataFolder, { recursive: true });
    }
    if (!fs.existsSync(postersFolder)) {
        fs.mkdirSync(postersFolder, { recursive: true });
    }
}

// net.fetch uses Chromium's network stack (system proxy, VPN, certificates), same as the renderer
async function fetchImage(url: string): Promise<Buffer> {
    const response = await net.fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
    fs.writeFileSync(outputPath, await fetchImage(url));
}

const decodeDataUrl = (dataUrl: string): Buffer => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

const BACKDROP_SUFFIX = '_backdrop';
const MIN_BACKDROP_WIDTH = 1000;
const MIN_BACKDROP_RATIO = 1.3;

const isBackdropSize = (image: Buffer): boolean => {
    const { width, height } = nativeImage.createFromBuffer(image).getSize();
    // Formats nativeImage can't read (WebP) come out empty: kept, the provider listed them as backdrops
    if (!width || !height) return true;
    return width >= MIN_BACKDROP_WIDTH && width / height >= MIN_BACKDROP_RATIO;
};

export async function saveBackdrop(metadataId: string, url: string, checkSize: boolean): Promise<boolean> {
    const isDataUrl = url.startsWith('data:');
    const image = isDataUrl ? decodeDataUrl(url) : await fetchImage(url);
    if (checkSize && !isBackdropSize(image)) return false;
    ensureDirectoriesExist();
    const name = `${metadataId}${BACKDROP_SUFFIX}`;
    removePosters(name);
    fs.writeFileSync(path.join(getPostersFolder(), `${name}${isDataUrl ? '.jpg' : getImageExt(url)}`), image);
    posterIndex = null;
    metadataCache.delete(metadataId.toLowerCase());
    return true;
}

const removeBackdrop = (metadataId: string) => {
    removePosters(`${metadataId}${BACKDROP_SUFFIX}`);
    posterIndex = null;
};

async function applyBackdropChange(metadata: MovieMetadata, selectedMovie: MovieSearchResult | null, change: BackdropChange) {
    if (change.kind === 'keep') return;
    delete metadata.noBackdrop;
    delete metadata.backdropCheckedAt;
    if (change.kind === 'none') {
        removeBackdrop(metadata.id);
        metadata.noBackdrop = true;
    } else if (change.kind === 'image') {
        await saveBackdrop(metadata.id, change.url, false);
    } else {
        removeBackdrop(metadata.id);
        if (selectedMovie?.backdropUrl) await saveBackdrop(metadata.id, selectedMovie.backdropUrl, true);
    }
}

export interface SaveMetadataResult {
    metadataPath: string;
    posterPaths: string[];
    posterError?: string;
    backdropError?: string;
}

export async function saveMetadata(
    metadata: MovieMetadata,
    selectedMovie: MovieSearchResult | null,
    customPoster: CustomPoster | null = null,
    backdrop: BackdropChange = { kind: 'movie' }
): Promise<SaveMetadataResult> {

    ensureDirectoriesExist();
    const metadataPath = path.join(getMetadataFolder(), `${metadata.id}.json`);
    const result: SaveMetadataResult = { metadataPath, posterPaths: [] };

    // Before the metadata file is written: the outcome goes into it
    try {
        await applyBackdropChange(metadata, selectedMovie, backdrop);
    } catch (error) {
        console.error('Error saving backdrop:', error);
        result.backdropError = String(error);
    }

    // Remove first so the file gets the current name casing (Windows keeps the old one on overwrite)
    if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
    }
    const { backdropUrl: _backdropUrl, ...storedMetadata } = metadata;
    fs.writeFileSync(metadataPath, JSON.stringify(storedMetadata, null, 2), 'utf-8');

    if (customPoster) {
        try {
            const baseName = metadata.id;
            const posterPath = path.join(getPostersFolder(), `${baseName}.jpg`);
            const previewPath = path.join(getPostersFolder(), `${baseName}_preview.jpg`);
            removePosters(baseName);
            removePosters(`${baseName}_preview`);
            fs.writeFileSync(posterPath, decodeDataUrl(customPoster.poster));
            fs.writeFileSync(previewPath, decodeDataUrl(customPoster.preview));
            result.posterPaths.push(posterPath, previewPath);
        } catch (error) {
            console.error('Error saving own poster:', error);
            result.posterError = String(error);
        }
    } else if (selectedMovie) {
        try {
            const baseName = metadata.id;
            
            if (selectedMovie.posterUrl) {
                const posterPath = path.join(getPostersFolder(), `${baseName}${getImageExt(selectedMovie.posterUrl)}`);
                removePosters(baseName);
                await downloadFile(selectedMovie.posterUrl, posterPath);
                result.posterPaths.push(posterPath);
            }

            if (selectedMovie.posterUrlPreview) {
                const previewPath = path.join(getPostersFolder(), `${baseName}_preview${getImageExt(selectedMovie.posterUrlPreview)}`);
                removePosters(`${baseName}_preview`);
                try {
                    await downloadFile(selectedMovie.posterUrlPreview, previewPath);
                    result.posterPaths.push(previewPath);
                } catch (error) {
                    // Some previews fail to download on some networks while the full image works
                    if (!selectedMovie.posterUrl) throw error;
                    const fallbackPath = path.join(getPostersFolder(), `${baseName}_preview${getImageExt(selectedMovie.posterUrl)}`);
                    removePosters(`${baseName}_preview`);
                    await downloadFile(selectedMovie.posterUrl, fallbackPath);
                    result.posterPaths.push(fallbackPath);
                }
            }
        } catch (error) {
            console.error('Error saving posters:', error);
            result.posterError = String(error);
        }
    }
    metadataCache.delete(metadata.id.toLowerCase());
    if (selectedMovie || customPoster || backdrop.kind !== 'keep') posterIndex = null;
    return result;
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function getImageExt(url: string): string {
    let pathname = url;
    try {
        pathname = new URL(url).pathname;
    } catch {
        // Not a valid URL, used as is
    }
    const ext = path.extname(pathname).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext) ? ext : '.jpg';
}

function removePosters(posterName: string) {
    for (const ext of IMAGE_EXTENSIONS) {
        const filePath = path.join(getPostersFolder(), `${posterName}${ext}`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

type LoadedMetadata = MovieMetadata & { posterUrl?: string; posterUrlPreview?: string; backdropUrl?: string };

// Keys are lower-cased: Windows file names are case-insensitive.
const metadataCache = new Map<string, LoadedMetadata | null>();
let posterIndex: Map<string, string> | null = null;

function getPosterIndex(): Map<string, string> {
    if (posterIndex) return posterIndex;
    posterIndex = new Map();
    const folder = getPostersFolder();
    if (fs.existsSync(folder)) {
        // Posters share the folder with <id>.json, so match image extensions only
        for (const file of fs.readdirSync(folder)) {
            const ext = path.extname(file);
            if (IMAGE_EXTENSIONS.includes(ext.toLowerCase())) {
                posterIndex.set(path.basename(file, ext).toLowerCase(), file);
            }
        }
    }
    return posterIndex;
}

// mtime as version, so the renderer can cache the image until it changes
function getPosterUrl(posterPath: string | null): string | undefined {
    if (!posterPath) return undefined;
    try {
        return `poster://local/${encodeURIComponent(path.basename(posterPath))}?v=${Math.round(fs.statSync(posterPath).mtimeMs)}`;
    } catch {
        return undefined;
    }
}

export function loadMetadata(metadataId: string): LoadedMetadata | null {
    const key = metadataId.toLowerCase();
    if (metadataCache.has(key)) {
        return metadataCache.get(key)!;
    }

    let result: LoadedMetadata | null = null;
    const metadataPath = path.join(getMetadataFolder(), `${metadataId}.json`);
    if (fs.existsSync(metadataPath)) {
        try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as MovieMetadata;
            result = {
                ...metadata,
                posterUrl: getPosterUrl(getPosterPath(metadataId, false)),
                posterUrlPreview: getPosterUrl(getPosterPath(metadataId, true)),
                backdropUrl: metadata.noBackdrop ? undefined : getPosterUrl(getBackdropPath(metadataId))
            };
        } catch (error) {
            console.error(`Error reading metadata ${metadataPath}:`, error);
        }
    }

    metadataCache.set(key, result);
    return result;
}

export function getPosterPath(metadataId: string, isPreview = false): string | null {
    const posterName = isPreview ? `${metadataId}_preview` : metadataId;
    const posterFile = getPosterIndex().get(posterName.toLowerCase());
    return posterFile ? path.join(getPostersFolder(), posterFile) : null;
}

export function getBackdropPath(metadataId: string): string | null {
    const backdropFile = getPosterIndex().get(`${metadataId}${BACKDROP_SUFFIX}`.toLowerCase());
    return backdropFile ? path.join(getPostersFolder(), backdropFile) : null;
}

export const getMetadataIdOfFile = (name: string): string => name.replace(/_(preview|backdrop)$/i, '');

export function listMetadataFiles(): string[] {
    const folder = getMetadataFolder();
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder).filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ext === '.json' || IMAGE_EXTENSIONS.includes(ext);
    });
}

export function removeMetadataFile(fileName: string) {
    fs.unlinkSync(path.join(getMetadataFolder(), fileName));
    const name = path.basename(fileName, path.extname(fileName)).toLowerCase();
    metadataCache.delete(name);
    metadataCache.delete(getMetadataIdOfFile(name));
    posterIndex = null;
}
