import { useEffect, useState } from 'react';
import { Ban, Trash2 } from 'lucide-react';
import { GenreIconPair, GenreIcons } from '../models/GenreIcons';
import { GENRE_ICONS } from '../utils/genreIcons';
import { getItemGenres } from '../utils/genres';
import { useI18n } from '../i18n/I18nProvider';

// Icon before and after a genre's button on the home page
const GenreIconSettings = () => {
    const { t } = useI18n();
    const [icons, setIcons] = useState<GenreIcons>({});
    const [libraryGenres, setLibraryGenres] = useState<string[]>([]);

    useEffect(() => {
        window.electron.getGenreIcons()
            .then(setIcons)
            .catch(error => console.error('Error reading genre icons:', error));
        window.electron.getMediaFiles()
            .then(files => setLibraryGenres(Array.from(new Set(files.flatMap(file => getItemGenres(file.metadata?.genres))))))
            .catch(error => console.error('Error reading media files:', error));
    }, []);

    const save = async (next: GenreIcons) => {
        const previous = icons;
        setIcons(next);
        try {
            await window.electron.setGenreIcons(next);
        } catch (error) {
            console.error('Failed to update genre icons:', error);
            setIcons(previous);
        }
    };

    const setIcon = (genre: string, side: keyof GenreIconPair, id: string | undefined) =>
        save({ ...icons, [genre]: { ...icons[genre], [side]: id } });

    const removeGenre = (genre: string) => {
        const { [genre]: _removed, ...rest } = icons;
        save(rest);
    };

    const configuredGenres = Object.keys(icons).sort((a, b) => a.localeCompare(b));
    const availableGenres = libraryGenres.filter(genre => !icons[genre]).sort((a, b) => a.localeCompare(b));

    const iconPicker = (genre: string, side: keyof GenreIconPair) => {
        const selected = icons[genre]?.[side];
        const optionClass = (isSelected: boolean) =>
            `w-7 h-7 flex items-center justify-center rounded ${isSelected ? 'bg-blue-600' : 'hover:bg-neutral-700'}`;
        return (
            <div className="flex items-center gap-1">
                <span className="text-neutral-400 mr-1">{t(side === 'start' ? 'settings.genreIconStart' : 'settings.genreIconEnd')}</span>
                <button className={optionClass(!selected)} onClick={() => setIcon(genre, side, undefined)} title={t('settings.genreIconNone')}>
                    <Ban className="w-4 h-4 text-neutral-400" />
                </button>
                {GENRE_ICONS.map(icon => (
                    <button key={icon.id} className={optionClass(selected === icon.id)} onClick={() => setIcon(genre, side, icon.id)}>
                        <img src={icon.src} alt={icon.id} className="w-5 h-5 object-contain" />
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="mt-2 p-4 text-xs max-w-4xl bg-neutral-800 rounded-xl mx-auto">
            <div className="h-12 flex items-center justify-between">
                <h2 className="text-neutral-100 font-bold">{t('settings.genreIcons')}</h2>
                <select
                    value=""
                    onChange={(e) => e.target.value && save({ ...icons, [e.target.value]: {} })}
                    disabled={availableGenres.length === 0}
                    className="bg-neutral-900 text-white text-sm rounded px-2 py-1 border border-neutral-600 focus:border-blue-500 focus:outline-none"
                >
                    <option value="">{t('settings.genreIconsAdd')}</option>
                    {availableGenres.map(genre => (
                        <option key={genre} value={genre}>{genre}</option>
                    ))}
                </select>
            </div>
            <p className="text-neutral-400">{t('settings.genreIconsDescription')}</p>

            {configuredGenres.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                    {configuredGenres.map(genre => (
                        <div key={genre} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-2 rounded bg-neutral-900">
                            <span className="w-32 text-sm text-neutral-100 truncate" title={genre}>{genre}</span>
                            {iconPicker(genre, 'start')}
                            {iconPicker(genre, 'end')}
                            <button
                                className="ml-auto p-1 text-neutral-400 hover:text-red-400"
                                onClick={() => removeGenre(genre)}
                                title={t('settings.genreIconsRemove')}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default GenreIconSettings;
