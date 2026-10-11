import { RefObject, useCallback, useEffect, useRef } from 'react';
import { SubtitleCue, SubtitleTrackInfo } from '../models/MediaInfo';

// Seconds
const EXTRACT_WINDOW = 600;
const PREFETCH = 300;
// Windows start a bit earlier so cues already on screen at the position are caught
const LEAD_IN = 30;
const RESTART_GAP = 60;

type Range = [number, number];

let nextRequestId = 1;

const addRange = (ranges: Range[], range: Range): Range[] => {
    const merged: Range[] = [];
    for (const r of [...ranges, range].sort((a, b) => a[0] - b[0])) {
        const last = merged[merged.length - 1];
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else merged.push([r[0], r[1]]);
    }
    return merged;
};

const cueKey = (cue: SubtitleCue) => `${cue.start}|${cue.text}`;

// `offset` - file time the current stream starts at (transcoded streams start at a keyframe)
export const useSubtitles = (
    videoRef: RefObject<HTMLVideoElement | null>,
    videoPath: string | undefined,
    track: SubtitleTrackInfo | null,
    time: number,
    offset: number,
) => {
    const cuesRef = useRef(new Map<string, SubtitleCue>());
    const shownRef = useRef(new Set<string>());
    const shownOffsetRef = useRef(0);
    const offsetRef = useRef(offset);
    offsetRef.current = offset;
    const textTrackRef = useRef<TextTrack | null>(null);
    const rangesRef = useRef<Range[]>([]);
    const activeRef = useRef<{ id: number; from: number; until: number | null; progress: number } | null>(null);

    // Tracks added with addTextTrack can't be removed, so one is created per <video> and reused
    const getTextTrack = useCallback((): TextTrack | null => {
        if (!textTrackRef.current && videoRef.current) {
            textTrackRef.current = videoRef.current.addTextTrack('subtitles');
            textTrackRef.current.mode = 'hidden';
        }
        return textTrackRef.current;
    }, [videoRef]);

    const clearTextTrack = useCallback(() => {
        const cues = textTrackRef.current?.cues;
        if (cues) for (let i = cues.length - 1; i >= 0; i--) textTrackRef.current!.removeCue(cues[i]);
        shownRef.current.clear();
    }, []);

    const syncCues = useCallback(() => {
        const textTrack = getTextTrack();
        if (!textTrack) return;
        const shift = offsetRef.current;
        if (shownOffsetRef.current !== shift) {
            clearTextTrack();
            shownOffsetRef.current = shift;
        }
        cuesRef.current.forEach((cue, key) => {
            if (shownRef.current.has(key) || cue.end - shift <= 0) return;
            textTrack.addCue(new VTTCue(Math.max(0, cue.start - shift), cue.end - shift, cue.text));
            shownRef.current.add(key);
        });
    }, [getTextTrack, clearTextTrack]);

    const stopExtraction = useCallback(() => {
        const active = activeRef.current;
        if (!active) return;
        window.electron.stopSubtitles(active.id);
        rangesRef.current = addRange(rangesRef.current, [active.from, active.progress]);
        activeRef.current = null;
    }, []);

    const startExtraction = useCallback((from: number) => {
        if (!track || !videoPath) return;
        const nextRange = rangesRef.current.find(r => r[0] > from);
        const until = track.filePath ? null : Math.min(nextRange?.[0] ?? Infinity, from + EXTRACT_WINDOW);
        const id = nextRequestId++;
        activeRef.current = { id, from, until, progress: from };
        window.electron.startSubtitles({ id, videoPath, track, from, until });
    }, [track, videoPath]);

    useEffect(() => {
        const offCues = window.electron.onSubtitleCues((id, cues) => {
            const active = activeRef.current;
            if (active?.id !== id) return;
            cues.forEach(cue => {
                cuesRef.current.set(cueKey(cue), cue);
                active.progress = Math.max(active.progress, cue.start);
            });
            syncCues();
        });
        const offEnd = window.electron.onSubtitleEnd((id, reachedUntil) => {
            const active = activeRef.current;
            if (active?.id !== id) return;
            // Not reaching `until` means ffmpeg hit the end of the file (or failed - don't retry then either)
            const end = reachedUntil && active.until !== null ? active.until : Infinity;
            rangesRef.current = addRange(rangesRef.current, [active.from, end]);
            activeRef.current = null;
        });
        return () => { offCues(); offEnd(); };
    }, [syncCues]);

    useEffect(() => {
        const textTrack = getTextTrack();
        if (textTrack) textTrack.mode = track ? 'showing' : 'hidden';
        return () => {
            stopExtraction();
            cuesRef.current.clear();
            rangesRef.current = [];
            clearTextTrack();
        };
    }, [track, videoPath, getTextTrack, stopExtraction, clearTextTrack]);

    useEffect(() => { syncCues(); }, [offset, syncCues]);

    useEffect(() => {
        if (!track) return;
        const active = activeRef.current;
        if (track.filePath) {
            if (!active && !rangesRef.current.length) startExtraction(0);
            return;
        }
        const findRange = () => rangesRef.current.find(r => time >= r[0] && time <= r[1]);
        if (active) {
            if ((time >= active.from && time <= active.progress + RESTART_GAP) || findRange()) return;
            stopExtraction();
        }
        const range = findRange();
        if (!range) startExtraction(Math.max(0, time - LEAD_IN));
        else if (range[1] - time < PREFETCH) startExtraction(range[1]);
    }, [track, time, startExtraction, stopExtraction]);
};
