import { useState, useEffect, useRef, useCallback, useMemo, RefObject } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Play, Pause, Rewind, FastForward, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Minimize, Captions } from 'lucide-react';
import { WatchProgress } from '../models/WatchProgressModel';
import { MediaFileModel, MediaType } from '../models/MediaFileModel';
import { AudioTrackInfo, MediaInfo, SubtitleTrackInfo } from '../models/MediaInfo';
import { useSubtitles } from '../hooks/useSubtitles';
import { findMatchingTrack, getAudioSignature, getSubtitleSignature } from '../utils/trackMatching';
import { useI18n } from '../i18n/I18nProvider';
import { MessageKey, TranslateParams } from '../../shared/i18n';
import { isWebClient, MEDIA_URL_BASE } from '../webApi';

const SEEK_STEP = 5;
const VOLUME_STEP = 0.05;
const CONTROLS_HIDE_DELAY = 2500;
const PROGRESS_SAVE_INTERVAL = 10000;
// Seeking in transcode mode restarts ffmpeg, so rapid seeks are coalesced
const TRANSCODE_SEEK_DEBOUNCE = 350;
// A seek in transcode mode moves at least this far in its direction, even if a keyframe is closer to the target
const MIN_KEYFRAME_STEP = 1;
const VOLUME_STORAGE_KEY = 'player-volume';
// Timeline hover preview: frames are taken every PREVIEW_STEP seconds, requested once the mouse rests a bit
const PREVIEW_STEP = 5;
const PREVIEW_DEBOUNCE = 100;
// Displayed width of the preview frame (ffmpeg renders it at this width too, see mediaProtocol.ts)
const PREVIEW_WIDTH = 240;

// Mouse side buttons (MouseEvent.button)
const MOUSE_BACK = 3;
const MOUSE_FORWARD = 4;

// Containers Chromium plays directly; others (mkv, avi, wmv, flv, ts) go through ffmpeg.
// Chromium seeks in raw H.264 Matroska land between keyframes: the picture freezes, ghosts over the previous scene
// or turns green until the next keyframe. ffmpeg streams always start on a keyframe.
const DIRECT_CONTAINERS = ['.mp4', '.m4v', '.mov', '.webm'];
// Types to ask canPlayType about; codecs not listed (mpeg4 aka Xvid/DivX, mpeg2video, wmv3, vc1...) are never playable
const VIDEO_CODEC_TYPES: Record<string, string> = {
    h264: 'video/mp4; codecs="avc1.640028"',
    hevc: 'video/mp4; codecs="hvc1.1.6.L120.90"',
    vp8: 'video/webm; codecs="vp8"',
    vp9: 'video/webm; codecs="vp09.00.10.08"',
    av1: 'video/mp4; codecs="av01.0.08M.08"',
};

// `nonce` forces a new request even if start/audio didn't change
const toThumbnailUrl = (filePath: string, time: number) => `${MEDIA_URL_BASE}path=${encodeURIComponent(filePath)}&thumb=${time}`;

const toMediaUrl = (filePath: string, transcode?: { start: number; audio: number; encodeVideo: boolean; nonce: number }) => {
    const url = `${MEDIA_URL_BASE}path=${encodeURIComponent(filePath)}`;
    return transcode
        ? `${url}&transcode=1&start=${transcode.start.toFixed(2)}&audio=${transcode.audio}${transcode.encodeVideo ? '&video=h264' : ''}&n=${transcode.nonce}`
        : url;
};

// The video codec can't be decoded here, so ffmpeg re-encodes it to H.264
const needsVideoEncode = (info: MediaInfo | null): boolean => {
    if (!info?.videoCodec) return false;
    const type = VIDEO_CODEC_TYPES[info.videoCodec];
    return !type || !document.createElement('video').canPlayType(type);
};

// Whether the file plays through ffmpeg with audio track `audio` rather than as the raw file
const needsTranscode = (filePath: string, info: MediaInfo | null, audio: number): boolean => {
    const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    if (!DIRECT_CONTAINERS.includes(extension) || needsVideoEncode(info)) return true;
    const track = info?.audioTracks[audio];
    // Track Chromium picks by itself when playing the raw file
    const nativeTrack = info?.audioTracks.find(t => t.isDefault)?.index ?? 0;
    return !!track && (!track.isSupported || audio !== nativeTrack);
};

const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const mm = h > 0 ? m.toString().padStart(2, '0') : m.toString();
    return `${h > 0 ? `${h}:` : ''}${mm}:${s.toString().padStart(2, '0')}`;
};

// Transcoded streams start on a video keyframe and play from it. The piped stream isn't seekable, so a native
// seek inside it lands between keyframes and shows green blocks until the next one.
// Picks the keyframe nearest to `target` that is on the seek's side of `from` (the position before the seek).
const pickKeyframe = (keyframes: number[], target: number, from = target): number => {
    const candidates = target > from
        ? keyframes.filter(k => k >= from + MIN_KEYFRAME_STEP)
        : keyframes.filter(k => k <= (from === target ? target : from - MIN_KEYFRAME_STEP));
    if (!candidates.length) return target;
    return candidates.reduce((best, k) => Math.abs(k - target) < Math.abs(best - target) ? k : best);
};

// Position a transcoded stream for a seek to `target` starts from: re-encoded video starts exactly there
const getStreamStart = async (filePath: string, info: MediaInfo | null, target: number, from = target): Promise<number> =>
    needsVideoEncode(info) ? target : pickKeyframe(await window.electron.getKeyframes(filePath, target), target, from);

const getFolder = (filePath: string) => filePath.slice(0, filePath.lastIndexOf('\\') + 1).toLowerCase();

// User group: its files; series: episodes of the same show; movies: files in the same folder
const getPlaylist = (item: MediaFileModel, files: MediaFileModel[]): MediaFileModel[] => {
    const playlist = item.groupId
        ? files.filter(f => f.groupId === item.groupId)
        : item.type === MediaType.Series
        ? files.filter(f => f.type === MediaType.Series && !f.groupId && f.parsedName === item.parsedName)
        : files.filter(f => !f.groupId && getFolder(f.fullPath) === getFolder(item.fullPath));
    return playlist.sort((a, b) =>
        (a.season ?? 0) - (b.season ?? 0)
        || (a.episode ?? 0) - (b.episode ?? 0)
        || a.fullPath.localeCompare(b.fullPath));
};

// Chosen tracks are kept per movie, and for a series - one for all its seasons and episodes
const getTrackPreferenceKey = (item: MediaFileModel): string =>
    item.type === MediaType.Series ? `series:${item.parsedName}` : `file:${item.fullPath}`;

const formatItemTitle = (item: MediaFileModel): string => {
    if (item.type === MediaType.Series && item.episode) {
        return `${item.parsedName} — S${String(item.season ?? 1).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`;
    }
    return item.fileName || item.parsedName;
};

const formatTrack = (track: AudioTrackInfo, t: (key: MessageKey, params?: TranslateParams) => string): string => {
    const parts = [track.language?.toUpperCase(), track.title].filter(Boolean);
    const label = parts.length ? parts.join(' — ') : t('player.track', { number: track.index + 1 });
    return `${label} (${track.codec.toUpperCase()}${track.channels ? ` ${track.channels}ch` : ''})`;
};

const formatSubtitle = (track: SubtitleTrackInfo, index: number, t: (key: MessageKey, params?: TranslateParams) => string): string => {
    const parts = [track.language?.toUpperCase(), track.title].filter(Boolean);
    return parts.length ? parts.join(' — ') : t('player.track', { number: index + 1 });
};

const PlayerView = ({ id, fullscreenRef }: { id?: string; fullscreenRef: RefObject<HTMLDivElement | null> }) => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [mediaItem, setMediaItem] = useState<MediaFileModel | null>(null);
    const [prevItem, setPrevItem] = useState<MediaFileModel | null>(null);
    const [nextItem, setNextItem] = useState<MediaFileModel | null>(null);
    const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Audio track index (within audio streams) and position the current stream starts from (transcode mode only)
    const [audioTrack, setAudioTrack] = useState(0);
    const [streamStart, setStreamStart] = useState(0);
    const [streamNonce, setStreamNonce] = useState(0);
    // Index in mediaInfo.subtitleTracks, -1 - off (default)
    const [subtitleIndex, setSubtitleIndex] = useState(-1);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [volume, setVolume] = useState(() => {
        const saved = parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY) ?? '');
        return isNaN(saved) ? 1 : saved;
    });
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
    const [showControls, setShowControls] = useState(true);
    const [osd, setOsd] = useState<string | null>(null);
    const [hover, setHover] = useState<{ time: number; x: number; width: number } | null>(null);
    const [preview, setPreview] = useState<{ time: number; url: string } | null>(null);
    // Width / height of the preview frames; known once the first one loads, then frames still loading show as a dark box
    const [previewAspect, setPreviewAspect] = useState<number | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    // The current touch tap only revealed the hidden controls, so it must not toggle playback
    const tapRevealedControlsRef = useRef(false);
    const osdTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const seekTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    // Seek target not yet applied to the video (direct mode: until metadata loads; transcode mode: until debounce fires)
    const pendingSeekRef = useRef<number | null>(null);
    // Last known logical position; kept in a ref so it survives the <video> being detached on unmount
    const positionRef = useRef(0);
    // Transcode mode: position the coalesced seeks started from (decides which way to pick the keyframe)
    const seekOriginRef = useRef(0);
    // A new src is loading (start, seek or track change in transcode mode). Loading resets `paused`,
    // so whether to play once it's loaded is kept separately: a paused video stays paused after a seek
    const streamLoadingRef = useRef(true);
    const playIntentRef = useRef(true);
    // Preview frame object URLs by time; the latest requested time
    const previewCacheRef = useRef(new Map<number, string>());
    const previewWantedRef = useRef<number | null>(null);

    const tracks = mediaInfo?.audioTracks ?? [];
    const encodeVideo = useMemo(() => needsVideoEncode(mediaInfo), [mediaInfo]);
    const isTranscoding = !!mediaItem && needsTranscode(mediaItem.fullPath, mediaInfo, audioTrack);
    const duration = mediaInfo?.duration || videoDuration;
    const subtitleTracks = mediaInfo?.subtitleTracks ?? [];
    const selectedSubtitle = subtitleTracks[subtitleIndex] ?? null;

    useSubtitles(videoRef, mediaItem?.fullPath, selectedSubtitle, currentTime, isTranscoding ? streamStart : 0);

    useEffect(() => {
        const load = async () => {
            try {
                if (!id) return;
                const item = await window.electron.getMediaFile(id);
                if (!item) return;
                const [info, progress, allFiles, trackPreference] = await Promise.all([
                    window.electron.getMediaInfo(item.fullPath),
                    window.electron.getWatchProgress(item.fullPath),
                    window.electron.getMediaFiles(),
                    window.electron.getTrackPreference(getTrackPreferenceKey(item)),
                ]);
                const playlist = getPlaylist(item, allFiles);
                const index = playlist.findIndex(f => f.id === item.id);
                setPrevItem(index > 0 ? playlist[index - 1] : null);
                setNextItem(index >= 0 && index < playlist.length - 1 ? playlist[index + 1] : null);
                // The tracks chosen before (e.g. in the previous episode) if this file has them, otherwise its default ones
                const savedAudio = trackPreference?.audio && info
                    ? findMatchingTrack(trackPreference.audio, info.audioTracks.map(getAudioSignature))
                    : null;
                const audio = savedAudio ?? info?.audioTracks.find(t => t.isDefault)?.index ?? 0;
                const savedSubtitle = trackPreference?.subtitle && info
                    ? findMatchingTrack(trackPreference.subtitle, info.subtitleTracks.map(getSubtitleSignature))
                    : null;
                const resumeAt = progress && !progress.isCompleted && progress.lastPosition > 10 ? progress.lastPosition : 0;
                let position = resumeAt;
                if (resumeAt && needsTranscode(item.fullPath, info, audio)) {
                    position = await getStreamStart(item.fullPath, info, resumeAt);
                }

                setMediaInfo(info);
                setAudioTrack(audio);
                setSubtitleIndex(savedSubtitle ?? -1);
                setStreamStart(position);
                setCurrentTime(position);
                positionRef.current = position;
                pendingSeekRef.current = position || null;
                setMediaItem(item);
            } catch (err) {
                console.error('Error loading media item:', err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
        return () => { window.electron.stopTranscode(); };
    }, [id]);

    // Logical playback position in the file, independent of mode
    const getTime = useCallback((): number => {
        if (pendingSeekRef.current !== null) return pendingSeekRef.current;
        const video = videoRef.current;
        if (!video) return positionRef.current;
        return (isTranscoding ? streamStart : 0) + video.currentTime;
    }, [isTranscoding, streamStart]);

    const showOsd = useCallback((text: string) => {
        setOsd(text);
        clearTimeout(osdTimeoutRef.current);
        osdTimeoutRef.current = setTimeout(() => setOsd(null), 800);
    }, []);

    const revealControls = useCallback(() => {
        setShowControls(true);
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused) setShowControls(false);
        }, CONTROLS_HIDE_DELAY);
    }, []);

    const saveProgress = useCallback(async () => {
        if (!mediaItem?.fullPath || !duration || !isFinite(duration)) return;
        const position = positionRef.current;
        const percentage = Math.min((position / duration) * 100, 100);
        const progress: WatchProgress = {
            filePath: mediaItem.fullPath,
            lastPosition: position,
            totalDuration: duration,
            percentage: Math.round(percentage),
            lastWatched: new Date().toISOString(),
            isCompleted: percentage >= 95,
        };
        await window.electron.saveWatchProgress(mediaItem.fullPath, progress);
    }, [mediaItem, duration]);

    // Periodic save + save on leaving the page / closing the app
    useEffect(() => {
        if (!mediaItem) return;
        const interval = setInterval(() => {
            if (videoRef.current && !videoRef.current.paused) saveProgress();
        }, PROGRESS_SAVE_INTERVAL);
        window.addEventListener('beforeunload', saveProgress);
        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', saveProgress);
            saveProgress();
        };
    }, [mediaItem, saveProgress]);

    // Restarts the transcoded stream at `time` (copied video: the keyframe nearest to it in the seek's direction)
    const restartStream = useCallback(async (time: number) => {
        if (!mediaItem) return;
        const start = await getStreamStart(mediaItem.fullPath, mediaInfo, time, seekOriginRef.current);
        // A newer seek arrived while we were looking up keyframes
        if (pendingSeekRef.current !== time) return;
        pendingSeekRef.current = start;
        positionRef.current = start;
        setCurrentTime(start);
        setStreamStart(start);
        setStreamNonce(n => n + 1);
        streamLoadingRef.current = true;
    }, [mediaItem, mediaInfo]);

    const seekTo = useCallback((time: number) => {
        const target = Math.max(0, duration ? Math.min(duration - 1, time) : time);
        const video = videoRef.current;
        if (!isTranscoding) {
            positionRef.current = target;
            setCurrentTime(target);
            if (video) video.currentTime = target;
            return;
        }
        if (pendingSeekRef.current === null) seekOriginRef.current = getTime();
        positionRef.current = target;
        setCurrentTime(target);
        pendingSeekRef.current = target;
        clearTimeout(seekTimeoutRef.current);
        seekTimeoutRef.current = setTimeout(() => restartStream(target), TRANSCODE_SEEK_DEBOUNCE);
    }, [duration, isTranscoding, getTime, restartStream]);

    const seekBy = useCallback((delta: number) => {
        const target = getTime() + delta;
        seekTo(target);
        showOsd(`${delta > 0 ? '+' : '−'}${Math.abs(delta)}s  ${formatTime(Math.max(0, target))}`);
        revealControls();
    }, [getTime, seekTo, showOsd, revealControls]);

    const changeAudioTrack = useCallback(async (index: number) => {
        if (!mediaItem) return;
        const track = tracks[index];
        clearTimeout(seekTimeoutRef.current);
        const transcode = needsTranscode(mediaItem.fullPath, mediaInfo, index);
        // Transcode mode starts the new stream (and playback) at the keyframe before the current position
        let position = getTime();
        if (transcode) position = await getStreamStart(mediaItem.fullPath, mediaInfo, position);
        const streamFrom = transcode ? position : 0;
        pendingSeekRef.current = position;
        positionRef.current = position;
        setCurrentTime(position);
        setAudioTrack(index);
        setStreamStart(streamFrom);
        setStreamNonce(n => n + 1);
        if (transcode || isTranscoding) streamLoadingRef.current = true;
        if (track) {
            showOsd(formatTrack(track, t));
            window.electron.saveTrackPreference(getTrackPreferenceKey(mediaItem), { audio: getAudioSignature(track) });
        }
    }, [mediaItem, mediaInfo, isTranscoding, getTime, tracks, showOsd, t]);

    const changeSubtitles = useCallback((index: number) => {
        setSubtitleIndex(index);
        const track = subtitleTracks[index];
        if (mediaItem) {
            window.electron.saveTrackPreference(getTrackPreferenceKey(mediaItem), {
                subtitle: track ? getSubtitleSignature(track, index) : null,
            });
        }
        showOsd(track ? `${t('player.subtitles')}: ${formatSubtitle(track, index, t)}` : `${t('player.subtitles')}: ${t('player.subtitlesOff')}`);
    }, [mediaItem, subtitleTracks, showOsd, t]);

    const handleLoadedMetadata = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (isFinite(video.duration)) setVideoDuration(video.duration);
        video.volume = volume;
        // Transcoded stream already starts at the target keyframe and mustn't be seeked natively (see pickKeyframe)
        if (!isTranscoding && pendingSeekRef.current !== null) video.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
        streamLoadingRef.current = false;
        setError(null);
        if (playIntentRef.current) video.play().catch(err => console.error('Autoplay failed:', err));
    }, [volume, isTranscoding]);

    const handleVideoError = useCallback(() => {
        streamLoadingRef.current = false;
        const mediaError = videoRef.current?.error;
        console.error('Video error:', mediaError);
        setError(mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
            ? t('player.unsupported')
            : `${t('player.playbackError')}${mediaError?.message ? `: ${mediaError.message}` : ''}`);
    }, [t]);

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        // While loading the video is paused anyway, so toggle what happens once it's loaded
        const play = streamLoadingRef.current ? !playIntentRef.current : video.paused;
        playIntentRef.current = play;
        if (streamLoadingRef.current) setIsPlaying(play);
        if (play) video.play().catch(() => {});
        else video.pause();
    }, []);

    const changeVolume = useCallback((value: number) => {
        const video = videoRef.current;
        const next = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
        if (video) {
            video.volume = next;
            if (next > 0 && video.muted) video.muted = false;
        }
        setVolume(next);
        localStorage.setItem(VOLUME_STORAGE_KEY, String(next));
        showOsd(t('player.volume', { percent: Math.round(next * 100) }));
    }, [showOsd, t]);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !video.muted;
        showOsd(video.muted ? t('player.muted') : t('player.volume', { percent: Math.round(video.volume * 100) }));
    }, [showOsd, t]);

    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) document.exitFullscreen();
        else fullscreenRef.current?.requestFullscreen();
    }, [fullscreenRef]);

    // Replace history entry so Back returns to the page the player was opened from
    const playItem = useCallback((item: MediaFileModel | null) => {
        if (!item) return;
        navigate(`/play/${encodeURIComponent(item.id)}`, { replace: true });
    }, [navigate]);

    const goBack = useCallback(() => {
        if (document.fullscreenElement) document.exitFullscreen();
        navigate(-1);
    }, [navigate]);

    useEffect(() => {
        const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLSelectElement) return;
            if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
            switch (e.code) {
                case 'Space':
                case 'KeyK':
                    togglePlay();
                    break;
                case 'ArrowLeft':
                    seekBy(-SEEK_STEP);
                    break;
                case 'ArrowRight':
                    seekBy(SEEK_STEP);
                    break;
                case 'ArrowUp':
                    changeVolume((videoRef.current?.volume ?? volume) + VOLUME_STEP);
                    break;
                case 'ArrowDown':
                    changeVolume((videoRef.current?.volume ?? volume) - VOLUME_STEP);
                    break;
                case 'KeyF':
                case 'Enter':
                    toggleFullscreen();
                    break;
                case 'KeyM':
                    toggleMute();
                    break;
                case 'PageUp':
                    playItem(prevItem);
                    break;
                case 'PageDown':
                    playItem(nextItem);
                    break;
                case 'KeyP':
                case 'KeyN':
                    if (!e.shiftKey) return;
                    playItem(e.code === 'KeyN' ? nextItem : prevItem);
                    break;
                case 'Escape':
                    if (!document.fullscreenElement) goBack();
                    break;
                default:
                    return;
            }
            e.preventDefault();
            revealControls();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [togglePlay, seekBy, changeVolume, toggleFullscreen, toggleMute, goBack, revealControls, volume, playItem, prevItem, nextItem]);

    // Mouse wheel = volume, mouse back/forward buttons = seek
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const current = videoRef.current?.volume ?? volume;
            changeVolume(current + (e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP));
        };
        const isSideButton = (e: MouseEvent) => e.button === MOUSE_BACK || e.button === MOUSE_FORWARD;
        // Suppress default history navigation on side buttons
        const suppress = (e: MouseEvent) => {
            if (isSideButton(e)) e.preventDefault();
        };
        const onMouseUp = (e: MouseEvent) => {
            if (!isSideButton(e)) return;
            e.preventDefault();
            seekBy(e.button === MOUSE_BACK ? -SEEK_STEP : SEEK_STEP);
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('mousedown', suppress);
        window.addEventListener('auxclick', suppress);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            container.removeEventListener('wheel', onWheel);
            window.removeEventListener('mousedown', suppress);
            window.removeEventListener('auxclick', suppress);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [mediaItem, changeVolume, seekBy, volume]);

    // Fetches the preview frame for the hovered time; until it arrives the box is dark, not the previous frame
    const previewTime = hover && duration > 0 ? Math.floor(hover.time / PREVIEW_STEP) * PREVIEW_STEP : null;
    useEffect(() => {
        previewWantedRef.current = previewTime;
        if (previewTime === null || !mediaItem) {
            setPreview(null);
            return;
        }
        const cached = previewCacheRef.current.get(previewTime);
        if (cached) {
            setPreview({ time: previewTime, url: cached });
            return;
        }
        setPreview(null);
        const timer = setTimeout(async () => {
            try {
                const response = await fetch(toThumbnailUrl(mediaItem.fullPath, previewTime));
                // 204: superseded by a newer preview or no frame
                if (response.status !== 200) return;
                const blob = await response.blob();
                const bitmap = await createImageBitmap(blob);
                setPreviewAspect(bitmap.width / bitmap.height);
                bitmap.close();
                const url = URL.createObjectURL(blob);
                previewCacheRef.current.set(previewTime, url);
                if (previewWantedRef.current === previewTime) setPreview({ time: previewTime, url });
            } catch {
                // No preview, the time tooltip is still shown
            }
        }, PREVIEW_DEBOUNCE);
        return () => clearTimeout(timer);
    }, [previewTime, mediaItem]);

    useEffect(() => () => {
        previewCacheRef.current.forEach(url => URL.revokeObjectURL(url));
    }, []);

    useEffect(() => () => {
        clearTimeout(hideTimeoutRef.current);
        clearTimeout(osdTimeoutRef.current);
        clearTimeout(seekTimeoutRef.current);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-black">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!mediaItem) {
        return (
            <div className="text-center py-10">
                <h2 className="text-xl font-medium text-neutral-200">{t('common.mediaNotFound')}</h2>
                <p className="text-neutral-400 mt-2">{t('common.mediaNotFoundText')}</p>
                <button
                    onClick={() => navigate(-1)}
                    className="mt-4 px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-600 transition-colors"
                >
                    {t('common.goBack')}
                </button>
            </div>
        );
    }

    const progressPercent = duration ? (currentTime / duration) * 100 : 0;
    const controlsVisible = showControls || !isPlaying;
    const src = isTranscoding
        ? toMediaUrl(mediaItem.fullPath, { start: streamStart, audio: audioTrack, encodeVideo, nonce: streamNonce })
        : toMediaUrl(mediaItem.fullPath);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-dvh bg-black select-none overflow-hidden"
            style={{ cursor: controlsVisible ? 'default' : 'none' }}
            onMouseMove={revealControls}
            onPointerDown={(e) => {
                // No mouse to move on a touch screen: a tap shows the controls
                tapRevealedControlsRef.current = e.pointerType === 'touch' && !controlsVisible;
                if (e.pointerType === 'touch') revealControls();
            }}
        >
            <video
                ref={videoRef}
                src={src}
                className={`w-full h-full object-contain player-video${controlsVisible ? ' controls-visible' : ''}`}
                onLoadedMetadata={handleLoadedMetadata}
                onDurationChange={() => {
                    const d = videoRef.current?.duration ?? 0;
                    if (isFinite(d)) setVideoDuration(d);
                }}
                onTimeUpdate={() => {
                    if (pendingSeekRef.current !== null) return;
                    positionRef.current = getTime();
                    setCurrentTime(positionRef.current);
                }}
                onPlay={() => { playIntentRef.current = true; setIsPlaying(true); revealControls(); }}
                onPause={() => {
                    // A new src started loading, not the user pausing
                    if (streamLoadingRef.current) return;
                    playIntentRef.current = false;
                    setIsPlaying(false);
                    setShowControls(true);
                    saveProgress();
                }}
                onEnded={() => {
                    saveProgress();
                    if (mediaItem.type === MediaType.Series) playItem(nextItem);
                }}
                onVolumeChange={() => setIsMuted(videoRef.current?.muted ?? false)}
                onError={handleVideoError}
                onClick={() => {
                    // That tap only showed the controls
                    if (tapRevealedControlsRef.current) return;
                    togglePlay();
                }}
                onDoubleClick={toggleFullscreen}
            />

            <div
                className="absolute top-0 left-0 right-0 p-4 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300"
                style={{ opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? 'auto' : 'none' }}
            >
                <h1 className="flex-1 text-white text-lg font-medium truncate">
                    {formatItemTitle(mediaItem)}
                </h1>
                {isFullscreen && (
                    <button
                        onClick={toggleFullscreen}
                        className="absolute left-1/2 -translate-x-1/2 p-3 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                        title={t('player.exitFullscreen')}
                    >
                        <Minimize className="h-6 w-6" />
                    </button>
                )}
                <button
                    onClick={goBack}
                    className="p-3 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                    title={t('player.close')}
                >
                    <X className="h-6 w-6" />
                </button>
            </div>

            {osd && (
                <div className="absolute top-20 right-8 px-4 py-2 bg-black/70 text-white text-xl rounded pointer-events-none">
                    {osd}
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 text-center p-6">
                    <p className="text-neutral-200 text-lg">{error}</p>
                    {/* Would open the player on the host */}
                    {!isWebClient && (
                        <button
                            onClick={() => window.electron.openFile(mediaItem.fullPath)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                        >
                            {t('player.openExternal')}
                        </button>
                    )}
                </div>
            )}

            <div
                className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-10 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300"
                style={{ opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? 'auto' : 'none' }}
            >
                <div
                    className="relative flex items-center"
                    onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        setHover({ time: ratio * duration, x: e.clientX - rect.left, width: rect.width });
                    }}
                    onMouseLeave={() => setHover(null)}
                >
                    {hover && duration > 0 && (
                        <div
                            className="absolute bottom-4 flex flex-col items-center gap-1 pointer-events-none -translate-x-1/2"
                            style={{ left: previewAspect ? Math.max(PREVIEW_WIDTH / 2, Math.min(hover.x, hover.width - PREVIEW_WIDTH / 2)) : hover.x }}
                        >
                            {previewAspect && (
                                <div
                                    className="rounded border border-neutral-600 bg-neutral-900 shadow-lg overflow-hidden"
                                    style={{ width: PREVIEW_WIDTH, aspectRatio: previewAspect }}
                                >
                                    {preview && <img src={preview.url} alt="" className="w-full h-full object-cover" />}
                                </div>
                            )}
                            <div className="px-2 py-1 bg-black/80 rounded text-white text-sm whitespace-nowrap">
                                {formatTime(hover.time)}
                            </div>
                        </div>
                    )}
                    <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={currentTime}
                        onChange={(e) => seekTo(parseFloat(e.target.value))}
                        className="w-full h-1 cursor-pointer accent-blue-500"
                        style={{
                            background: `linear-gradient(to right, rgb(59 130 246) ${progressPercent}%, rgb(82 82 82) ${progressPercent}%)`,
                        }}
                        tabIndex={-1}
                    />
                </div>
                <div className="flex items-center gap-1 sm:gap-3 mt-2 text-white">
                    <button
                        onClick={() => playItem(prevItem)}
                        disabled={!prevItem}
                        className="p-2 hover:text-blue-400 disabled:opacity-30 disabled:hover:text-white"
                        title={prevItem ? t('player.previous', { title: formatItemTitle(prevItem) }) : t('player.noPrevious')}
                        tabIndex={-1}
                    >
                        <SkipBack className="h-5 w-5" />
                    </button>
                    <button onClick={togglePlay} className="p-2 hover:text-blue-400" title={t('player.playPause')} tabIndex={-1}>
                        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                    </button>
                    <button
                        onClick={() => playItem(nextItem)}
                        disabled={!nextItem}
                        className="p-2 hover:text-blue-400 disabled:opacity-30 disabled:hover:text-white"
                        title={nextItem ? t('player.next', { title: formatItemTitle(nextItem) }) : t('player.noNext')}
                        tabIndex={-1}
                    >
                        <SkipForward className="h-5 w-5" />
                    </button>
                    <button onClick={() => seekBy(-SEEK_STEP)} className="hidden sm:block p-2 hover:text-blue-400" title={t('player.seekBack', { seconds: SEEK_STEP })} tabIndex={-1}>
                        <Rewind className="h-5 w-5" />
                    </button>
                    <button onClick={() => seekBy(SEEK_STEP)} className="hidden sm:block p-2 hover:text-blue-400" title={t('player.seekForward', { seconds: SEEK_STEP })} tabIndex={-1}>
                        <FastForward className="h-5 w-5" />
                    </button>
                    <span className="text-sm tabular-nums">
                        {formatTime(currentTime)} / {formatTime(duration)}
                        <span className="hidden sm:inline text-neutral-400"> / -{formatTime(duration - currentTime)}</span>
                    </span>
                    <div className="flex-1" />
                    {tracks.length > 1 && (
                        <select
                            value={audioTrack}
                            onChange={(e) => changeAudioTrack(parseInt(e.target.value, 10))}
                            className="bg-black/60 text-white text-sm rounded px-2 py-1 border border-neutral-600 max-w-[7rem] sm:max-w-xs"
                            title={t('player.audioTrack')}
                            tabIndex={-1}
                        >
                            {tracks.map(track => (
                                <option key={track.index} value={track.index}>{formatTrack(track, t)}</option>
                            ))}
                        </select>
                    )}
                    {subtitleTracks.length > 0 && (
                        <div className="flex items-center gap-1" title={t('player.subtitles')}>
                            <Captions className={`h-5 w-5 ${selectedSubtitle ? 'text-blue-400' : 'text-neutral-400'}`} />
                            <select
                                value={subtitleIndex}
                                onChange={(e) => changeSubtitles(parseInt(e.target.value, 10))}
                                className="bg-black/60 text-white text-sm rounded px-2 py-1 border border-neutral-600 max-w-[7rem] sm:max-w-xs"
                                tabIndex={-1}
                            >
                                <option value={-1}>{t('player.subtitlesOff')}</option>
                                {subtitleTracks.map((track, index) => (
                                    <option key={index} value={index}>{formatSubtitle(track, index, t)}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button onClick={toggleMute} className="hidden sm:block p-2 hover:text-blue-400" title={t('player.mute')} tabIndex={-1}>
                        {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </button>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => changeVolume(parseFloat(e.target.value))}
                        className="hidden sm:block w-24 h-1 cursor-pointer accent-blue-500"
                        tabIndex={-1}
                    />
                    <button onClick={toggleFullscreen} className="p-2 hover:text-blue-400" title={t('player.fullscreen')} tabIndex={-1}>
                        {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Remount on file change so no state leaks between files. Fullscreen is requested on the wrapper,
// which outlives the remount, so switching files doesn't drop out of fullscreen
const Player = () => {
    const { id } = useParams<{ id: string }>();
    const fullscreenRef = useRef<HTMLDivElement>(null);
    return (
        <div ref={fullscreenRef} className="w-full h-dvh bg-black">
            <PlayerView key={id} id={id} fullscreenRef={fullscreenRef} />
        </div>
    );
};

export default Player;
