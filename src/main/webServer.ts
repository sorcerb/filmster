import http, { IncomingMessage, ServerResponse } from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { getHandler, handle, onBroadcast, RpcClient } from './rpc';
import { mediaResponse, posterResponse, stopTranscode } from './mediaProtocol';
import { getExternalSubtitles, stopClientSubtitles } from './subtitles';
import { getAllMediaFiles } from './scanFiles';
import { getWebServerSecret, getWebServerSettings, setWebServerSettings, WebServerSettings } from '../renderer/stores/WebServerStore';
import { SubtitleRequest } from '../renderer/models/MediaInfo';
import { MovieMetadata } from '../renderer/models/MediaMetadata';
import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { isBackdropChange, isCustomPoster, METADATA_PROVIDERS, NEWS_SECTIONS } from '../shared/metadataApi';

// Serves the library to browsers on the local network: the renderer build as a web app,
// POST /api/<channel> for the rpc handlers, GET /api/events (Server-Sent Events) for events,
// GET /media (video) and /poster/<name>. Browsers get only what REMOTE_CHANNELS allows:
// no settings, library folders, API key or actions on the host (opening files and folders).

const RENDERER_DIR = path.join(__dirname, '../renderer');
const AUTH_COOKIE = 'filmster_auth';
const MAX_BODY_BYTES = 5 * 1024 * 1024;

const STATIC_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

// File paths a browser may use: library videos only
const isLibraryFile = (filePath: unknown): boolean =>
    typeof filePath === 'string' && getAllMediaFiles().some(file => file.fullPath === filePath);

// Metadata ids become file names in the metadata folder
const isSafeFileName = (name: unknown): boolean =>
    typeof name === 'string' && /^[^\\/:*?"<>|]+$/.test(name) && name !== '.' && name !== '..';

// Posters are downloaded by the host; anything but http(s) (e.g. file://) would read local files
const isWebUrl = (url: unknown): boolean => url == null || (typeof url === 'string' && /^https?:\/\//i.test(url));

// Gets the call arguments as sent (unchecked JSON)
type ArgsCheck = (args: any) => boolean | Promise<boolean>;

const REMOTE_CHANNELS: Record<string, ArgsCheck | true> = {
    'get-media-files': true,
    'get-media-file': true,
    'scan-media-files': true,
    'group-media-files': true,
    'rename-media-group': true,
    'remove-media-group': true,
    'load-metadata': ([metadataId]) => isSafeFileName(metadataId),
    'save-metadata': ([metadata, selectedMovie, customPoster, backdrop]: [MovieMetadata, MovieSearchResult | null, unknown, unknown]) =>
        isSafeFileName(metadata?.id)
        && (!selectedMovie || (isWebUrl(selectedMovie.posterUrl) && isWebUrl(selectedMovie.posterUrlPreview) && isWebUrl(selectedMovie.backdropUrl)))
        && (customPoster == null || isCustomPoster(customPoster))
        && (backdrop == null || isBackdropChange(backdrop)),
    'get-metadata-providers': true,
    'metadata-search': ([provider]) => provider === 'tmdb' || provider === 'kinopoisk',
    'metadata-find-film': true,
    'metadata-images': ([film]) => typeof film?.filmId === 'number',
    'metadata-load-backdrop': ([metadataId]) => isSafeFileName(metadataId),
    'metadata-film-details': ([film]) => typeof film?.filmId === 'number',
    'metadata-news': ([provider, section]) => METADATA_PROVIDERS.includes(provider) && NEWS_SECTIONS.includes(section),
    'get-language': true,
    'get-genre-icons': true,
    'get-custom-links': true,
    'get-watch-progress': true,
    'save-watch-progress': true,
    'get-all-watch-progress': true,
    'get-track-preference': true,
    'save-track-preference': ([key, preference]) => typeof key === 'string' && typeof preference === 'object' && preference !== null,
    'get-library-progress': true,
    'get-file-duration': ([filePath]) => isLibraryFile(filePath),
    'get-media-info': ([filePath]) => isLibraryFile(filePath),
    'get-keyframes': ([filePath]) => isLibraryFile(filePath),
    'stop-transcode': true,
    'get-episode-markers': ([filePath]) => isLibraryFile(filePath),
    'get-auto-skip-intro': true,
    'set-auto-skip-intro': ([seriesName, enabled]) => typeof seriesName === 'string' && typeof enabled === 'boolean',
    'start-subtitles': async ([request]: [SubtitleRequest]) => {
        if (!isLibraryFile(request?.videoPath)) return false;
        if (!request.track?.filePath) return true;
        // Subtitle file next to the video, as listed by get-media-info
        return (await getExternalSubtitles(request.videoPath)).some(track => track.filePath === request.track.filePath);
    },
    'stop-subtitles': true,
};

// --- Authorization: a PIN, remembered by the browser as a signed cookie ---

const getAuthToken = (pin: string) => createHmac('sha256', getWebServerSecret()).update(pin).digest('hex');

const isAuthorized = (req: IncomingMessage): boolean => {
    const { pin } = getWebServerSettings();
    if (!pin) return true;
    const cookie = (req.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith(`${AUTH_COOKIE}=`));
    const token = Buffer.from(cookie?.slice(AUTH_COOKIE.length + 1) ?? '');
    const expected = Buffer.from(getAuthToken(pin));
    return token.length === expected.length && timingSafeEqual(token, expected);
};

// Wrong PINs from an address: after LOGIN_MAX_FAILURES further attempts wait LOGIN_LOCK_MS
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MS = 60 * 1000;
const loginFailures = new Map<string, { count: number; lockedUntil: number }>();

const login = async (req: IncomingMessage, res: ServerResponse) => {
    const address = req.socket.remoteAddress ?? '';
    const failures = loginFailures.get(address);
    if (failures && failures.lockedUntil > Date.now()) {
        return sendJson(res, 429, { error: 'Too many attempts' });
    }

    const [pin] = await readJsonBody(req) as [unknown];
    const settings = getWebServerSettings();
    if (!settings.pin || pin === settings.pin) {
        loginFailures.delete(address);
        res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${getAuthToken(settings.pin)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
        return sendJson(res, 200, { result: true });
    }

    const count = (failures?.count ?? 0) + 1;
    loginFailures.set(address, { count, lockedUntil: count >= LOGIN_MAX_FAILURES ? Date.now() + LOGIN_LOCK_MS : 0 });
    // Slows down guessing
    await new Promise(resolve => setTimeout(resolve, 1000));
    sendJson(res, 200, { result: false });
};

// --- Events (Server-Sent Events), per browser tab ---

const eventStreams = new Map<string, Set<ServerResponse>>();

const sendEvent = (clientId: string, channel: string, args: unknown[]) => {
    const data = `data: ${JSON.stringify({ channel, args })}\n\n`;
    eventStreams.get(clientId)?.forEach(res => res.write(data));
};

const createClient = (clientId: string): RpcClient => ({
    id: clientId,
    send: (channel, ...args) => sendEvent(clientId, channel, args),
});

onBroadcast((channel, args) => {
    for (const clientId of eventStreams.keys()) sendEvent(clientId, channel, args);
});

const openEventStream = (req: IncomingMessage, res: ServerResponse, clientId: string) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    if (!eventStreams.has(clientId)) eventStreams.set(clientId, new Set());
    eventStreams.get(clientId)!.add(res);

    // Proxies and the OS drop idle connections
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
        clearInterval(heartbeat);
        const streams = eventStreams.get(clientId);
        streams?.delete(res);
        if (!streams?.size) {
            // Tab closed: stop its ffmpeg processes
            eventStreams.delete(clientId);
            stopTranscode(clientId);
            stopClientSubtitles(clientId);
        }
    });
};

// --- Helpers ---

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
};

const readJsonBody = async (req: IncomingMessage): Promise<unknown[]> => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw new Error('Request too large');
        chunks.push(chunk);
    }
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : [];
    return Array.isArray(body) ? body : [];
};

// Pipes a fetch Response (shared with the media:// and poster:// protocols) into the HTTP response
const sendResponse = async (res: ServerResponse, response: Response, extraHeaders: Record<string, string> = {}) => {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => { headers[name] = value; });
    res.writeHead(response.status, { ...headers, ...extraHeaders });
    if (!response.body) {
        res.end();
        return;
    }
    const body = Readable.fromWeb(response.body as any);
    // Player seeked or closed: stop reading the file / kill ffmpeg
    res.on('close', () => body.destroy());
    body.on('error', () => res.destroy());
    body.pipe(res);
};

const sendStatic = async (res: ServerResponse, urlPath: string) => {
    const relative = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
    const filePath = path.resolve(RENDERER_DIR, `.${relative}`);
    if (!filePath.startsWith(RENDERER_DIR + path.sep)) {
        res.writeHead(403).end();
        return;
    }
    try {
        const data = await fsp.readFile(filePath);
        const isHtml = path.extname(filePath) === '.html';
        res.writeHead(200, {
            'Content-Type': STATIC_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
            // Built assets have content hashes in their names
            'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
        });
        res.end(data);
    } catch {
        res.writeHead(404).end();
    }
};

const callChannel = async (req: IncomingMessage, res: ServerResponse, channel: string) => {
    const check = REMOTE_CHANNELS[channel];
    const handler = getHandler(channel);
    if (!check || !handler) return sendJson(res, 404, { error: 'Unknown channel' });

    const args = await readJsonBody(req);
    if (check !== true && !(await check(args))) return sendJson(res, 403, { error: 'Forbidden' });

    const clientId = String(req.headers['x-client-id'] ?? 'web');
    const result = await handler(createClient(clientId), ...args);
    sendJson(res, 200, { result: result ?? null });
};

const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { pathname } = url;

    if (pathname === '/api/auth' && req.method === 'GET') {
        return sendJson(res, 200, { result: { required: !!getWebServerSettings().pin, authorized: isAuthorized(req) } });
    }
    if (pathname === '/api/login' && req.method === 'POST') {
        return login(req, res);
    }

    const isProtected = pathname.startsWith('/api/') || pathname === '/media' || pathname.startsWith('/poster/');
    if (!isProtected) {
        return req.method === 'GET' ? sendStatic(res, pathname) : res.writeHead(405).end();
    }
    if (!isAuthorized(req)) {
        return sendJson(res, 401, { error: 'PIN required' });
    }

    if (pathname === '/api/events' && req.method === 'GET') {
        return openEventStream(req, res, url.searchParams.get('client') ?? 'web');
    }
    if (pathname.startsWith('/api/') && req.method === 'POST') {
        return callChannel(req, res, pathname.slice('/api/'.length));
    }
    if (pathname === '/media' && req.method === 'GET') {
        if (!isLibraryFile(url.searchParams.get('path'))) return res.writeHead(403).end();
        const clientId = url.searchParams.get('client') ?? 'web';
        return sendResponse(res, await mediaResponse(url.searchParams, req.headers.range ?? null, clientId));
    }
    if (pathname.startsWith('/poster/') && req.method === 'GET') {
        // ?v=<mtime> changes with the file
        return sendResponse(res, await posterResponse(decodeURIComponent(pathname.slice('/poster/'.length))),
            { 'Cache-Control': 'public, max-age=31536000, immutable' });
    }
    res.writeHead(404).end();
};

// --- Server lifecycle ---

export interface WebServerStatus {
    settings: WebServerSettings;
    running: boolean;
    error?: string;
    // Addresses to open on other devices
    urls: string[];
}

let server: http.Server | null = null;
let lastError: string | undefined;

const getLocalUrls = (port: number): string[] =>
    Object.values(os.networkInterfaces())
        .flat()
        .filter(address => address && address.family === 'IPv4' && !address.internal)
        .map(address => `http://${address!.address}:${port}`);

const getStatus = (): WebServerStatus => {
    const settings = getWebServerSettings();
    return {
        settings,
        running: !!server?.listening,
        error: lastError,
        urls: server?.listening ? getLocalUrls(settings.port) : [],
    };
};

const stopServer = (): Promise<void> => new Promise(resolve => {
    if (!server) return resolve();
    const closing = server;
    server = null;
    // Open event streams would keep close() waiting
    closing.closeAllConnections();
    closing.close(() => resolve());
});

// Starts, restarts or stops the server according to the settings
export const applyWebServerSettings = async (): Promise<WebServerStatus> => {
    await stopServer();
    lastError = undefined;
    const { enabled, port } = getWebServerSettings();
    if (!enabled) return getStatus();

    const next = http.createServer((req, res) => {
        handleRequest(req, res).catch(error => {
            console.error('Web server error:', error);
            if (!res.headersSent) sendJson(res, 500, { error: String(error?.message ?? error) });
            else res.destroy();
        });
    });
    await new Promise<void>(resolve => {
        next.once('error', (error: NodeJS.ErrnoException) => {
            lastError = error.code === 'EADDRINUSE' ? `Port ${port} is already in use` : error.message;
            console.error('Web server failed to start:', error);
            resolve();
        });
        next.listen(port, '0.0.0.0', () => {
            server = next;
            resolve();
        });
    });
    return getStatus();
};

// Settings page of the app window only (not in REMOTE_CHANNELS)
handle('get-web-server-status', () => getStatus());

handle('set-web-server-settings', (_client, settings: WebServerSettings) => {
    const port = Math.round(Number(settings.port));
    setWebServerSettings({
        enabled: !!settings.enabled,
        port: port >= 1024 && port <= 65535 ? port : getWebServerSettings().port,
        pin: String(settings.pin ?? '').trim(),
    });
    return applyWebServerSettings();
});
