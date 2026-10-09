import { app, net } from 'electron';
import fs from 'fs';
import path from 'path';
import { MovieMetadata } from '../../renderer/models/MediaMetadata';
import { MovieSearchResult } from '../../renderer/models/MovieSearchResult';

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
async function downloadFile(url: string, outputPath: string): Promise<void> {
    const response = await net.fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
}

export interface SaveMetadataResult {
    metadataPath: string;
    posterPaths: string[];
    posterError?: string;
}

export async function saveMetadata(
    metadata: MovieMetadata,
    selectedMovie: MovieSearchResult | null
): Promise<SaveMetadataResult> {

    ensureDirectoriesExist();
    const metadataPath = path.join(getMetadataFolder(), `${metadata.id}.json`);
    // Remove first so the file gets the current name casing (Windows keeps the old one on overwrite)
    if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
    }
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    const result: SaveMetadataResult = { metadataPath, posterPaths: [] };

    if (selectedMovie) {
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
                await downloadFile(selectedMovie.posterUrlPreview, previewPath);
                result.posterPaths.push(previewPath);
            }
        } catch (error) {
            console.error('Error saving posters:', error);
            result.posterError = String(error);
        }
    }
    metadataCache.delete(metadata.id.toLowerCase());
    if (selectedMovie) posterIndex = null;
    return result;
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// Extension from URL path (ignoring query/hash), falling back to .jpg for unknown/missing ones
function getImageExt(url: string): string {
    let pathname = url;
    try {
        pathname = new URL(url).pathname;
    } catch {
        // not a valid URL, use as is
    }
    const ext = path.extname(pathname).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext) ? ext : '.jpg';
}

// Remove previously saved posters with this name (may have a different extension)
function removePosters(posterName: string) {
    for (const ext of IMAGE_EXTENSIONS) {
        const filePath = path.join(getPostersFolder(), `${posterName}${ext}`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

type LoadedMetadata = MovieMetadata & { posterUrl?: string; posterUrlPreview?: string };

// Metadata and the poster file list are read from disk once and kept in memory;
// saveMetadata() invalidates them. Keys are lower-cased: Windows file names are case-insensitive.
const metadataCache = new Map<string, LoadedMetadata | null>();
// lower-cased poster name (without extension) -> file name
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

// poster:// URL (served by mediaProtocol) with the file mtime as version, so the renderer can cache the image until it changes
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
                posterUrlPreview: getPosterUrl(getPosterPath(metadataId, true))
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

// Metadata (<id>.json) and poster (<id>.jpg, <id>_preview.jpg...) file names in the metadata folder
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
    metadataCache.delete(name.replace(/_preview$/, ''));
    posterIndex = null;
}
