import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleCheck } from 'lucide-react';
import { MediaFileModel, MediaType } from '../models/MediaFileModel';
import { LibraryFileProgress } from '../models/WatchProgressModel';
import { getProfileStats } from '../utils/profileStats';
import { getMediaTitle } from '../utils/mediaGroups';
import { useI18n } from '../i18n/I18nProvider';
import { MessageKey } from '../../shared/i18n';

const StatTile = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
    <div className="bg-neutral-800 rounded-xl p-4" title={hint}>
        <p className="text-xs text-neutral-400">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
);

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
    <section className="mt-6">
        <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        <div className="mt-2">{children}</div>
    </section>
);

const Profile = () => {
    const { t, language } = useI18n();
    const navigate = useNavigate();
    const [files, setFiles] = useState<MediaFileModel[] | null>(null);
    const [progress, setProgress] = useState<Record<string, LibraryFileProgress>>({});

    useEffect(() => {
        Promise.all([window.electron.getMediaFiles(), window.electron.getLibraryProgress()])
            .then(([loadedFiles, loadedProgress]) => {
                setFiles(loadedFiles);
                setProgress(loadedProgress);
            })
            .catch(error => {
                console.error('Error loading profile statistics:', error);
                setFiles([]);
            });
    }, []);

    const stats = useMemo(() => files && getProfileStats(files, progress), [files, progress]);

    if (!stats) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    const formatNumber = (value: number) => new Intl.NumberFormat(language).format(value);
    const formatHours = (hours: number) => new Intl.NumberFormat(language, { maximumFractionDigits: hours < 10 ? 1 : 0 }).format(hours);
    const formatSize = (bytes: number) => {
        const tb = bytes / 1024 ** 4;
        return tb >= 1
            ? new Intl.NumberFormat(language, { style: 'unit', unit: 'terabyte', maximumFractionDigits: 1 }).format(tb)
            : new Intl.NumberFormat(language, { style: 'unit', unit: 'gigabyte', maximumFractionDigits: 0 }).format(bytes / 1024 ** 3);
    };
    const formatDate = (iso: string) => new Date(iso).toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });

    const maxGenreCount = stats.genres[0]?.count ?? 0;

    const tile = (label: MessageKey, value: string, hint?: MessageKey) =>
        <StatTile label={t(label)} value={value} hint={hint && t(hint)} />;

    return (
        <div className="max-w-5xl mx-auto pb-8">
            <div className="h-12 flex items-center justify-between">
                <h1 className="text-xl text-neutral-100">{t('profile.title')}</h1>
            </div>

            <Section title={t('profile.watched')} hint={t('profile.hoursHint')}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {tile('profile.watchedMovies', formatNumber(stats.watchedMovies))}
                    {tile('profile.watchedEpisodes', formatNumber(stats.watchedEpisodes))}
                    {tile('profile.hoursTotal', `≈ ${formatHours(stats.hoursTotal)}`, 'profile.hoursHint')}
                    {tile('profile.hoursThisMonth', `≈ ${formatHours(stats.hoursThisMonth)}`, 'profile.hoursHint')}
                </div>
            </Section>

            <Section title={t('profile.library')}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {tile('profile.libraryMovies', formatNumber(stats.library.movies))}
                    {tile('profile.librarySeries', formatNumber(stats.library.series))}
                    {tile('profile.libraryFiles', formatNumber(stats.library.files))}
                    {tile('profile.librarySize', formatSize(stats.library.bytes))}
                </div>
            </Section>

            <div className="grid md:grid-cols-2 gap-x-6">
                <Section title={t('profile.genres')} hint={t('profile.genresHint')}>
                    <div className="bg-neutral-800 rounded-xl p-4">
                        {stats.genres.length === 0 ? (
                            <p className="text-xs text-neutral-400">{t('profile.genresEmpty')}</p>
                        ) : (
                            <ul className="flex flex-col gap-2.5">
                                {stats.genres.map(({ genre, count }) => (
                                    <li key={genre} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-xs" title={`${genre}: ${count}`}>
                                        <span className="text-neutral-200 truncate">{genre}</span>
                                        <div className="h-2.5">
                                            <div
                                                className="h-full bg-blue-500 rounded-r"
                                                style={{ width: `${(count / maxGenreCount) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-neutral-400 text-right tabular-nums">{formatNumber(count)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </Section>

                <Section title={t('profile.recent')}>
                    <div className="bg-neutral-800 rounded-xl p-2">
                        {stats.recent.length === 0 ? (
                            <p className="p-2 text-xs text-neutral-400">{t('profile.recentEmpty')}</p>
                        ) : (
                            <ul>
                                {stats.recent.map(({ file, progress: fileProgress, isFinished, percent }) => (
                                    <li key={file.id}>
                                        <button
                                            className="w-full flex items-center gap-3 p-2 rounded hover:bg-neutral-700 text-left text-xs"
                                            onClick={() => navigate(`/media/${file.id}`)}
                                        >
                                            <span className="flex-1 min-w-0 truncate text-neutral-100">
                                                {getMediaTitle(file)}
                                                {file.type === MediaType.Series && file.episode
                                                    ? ` · S${String(file.season ?? 1).padStart(2, '0')}E${String(file.episode).padStart(2, '0')}`
                                                    : ''}
                                            </span>
                                            <span className="shrink-0 text-neutral-400 tabular-nums">
                                                {isFinished
                                                    ? <CircleCheck className="inline h-3.5 w-3.5 text-neutral-400" aria-label={t('profile.finished')} />
                                                    : percent ? `${percent}%` : ''}
                                            </span>
                                            <span className="shrink-0 w-24 text-right text-neutral-500">{formatDate(fileProgress.lastWatched)}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </Section>
            </div>
        </div>
    );
};

export default Profile;
