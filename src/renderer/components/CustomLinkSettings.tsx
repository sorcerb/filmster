import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { CustomLink, isCustomLinkUrl } from '../models/CustomLink';
import { useI18n } from '../i18n/I18nProvider';

const inputClass = 'bg-neutral-900 text-white text-sm rounded px-2 py-1 border border-neutral-600 focus:border-blue-500 focus:outline-none';

// Links to other sites with a search for the title: on news and on the movie page
const CustomLinkSettings = () => {
    const { t } = useI18n();
    const [links, setLinks] = useState<CustomLink[]>([]);
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');

    useEffect(() => {
        window.electron.getCustomLinks()
            .then(setLinks)
            .catch(error => console.error('Error reading custom links:', error));
    }, []);

    const save = async (next: CustomLink[]) => {
        const previous = links;
        setLinks(next);
        try {
            await window.electron.setCustomLinks(next);
        } catch (error) {
            console.error('Failed to update custom links:', error);
            setLinks(previous);
        }
    };

    const canAdd = isCustomLinkUrl(url);

    const addLink = () => {
        if (!canAdd) return;
        save([...links, { name: name.trim(), url: url.trim() }]);
        setName('');
        setUrl('');
    };

    return (
        <div className="mt-2 p-4 text-xs max-w-4xl bg-neutral-800 rounded-xl mx-auto">
            <div className="h-12 flex items-center">
                <h2 className="text-neutral-100 font-bold">{t('settings.customLinks')}</h2>
            </div>
            <p className="text-neutral-400">{t('settings.customLinksDescription')}</p>

            <form
                className="mt-4 flex flex-wrap items-center gap-2"
                onSubmit={(e) => { e.preventDefault(); addLink(); }}
            >
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('settings.customLinkName')}
                    className={`${inputClass} w-40`}
                />
                <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://"
                    className={`${inputClass} flex-1 min-w-60`}
                />
                <button
                    type="submit"
                    disabled={!canAdd}
                    className="px-4 py-1 bg-zinc-500 text-white rounded hover:bg-zinc-400 disabled:opacity-50 disabled:hover:bg-zinc-500"
                >
                    {t('settings.customLinkAdd')}
                </button>
            </form>

            {links.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                    {links.map((link, index) => (
                        <div key={index} className="flex items-center gap-4 p-2 rounded bg-neutral-900">
                            <span className="w-40 shrink-0 text-sm text-neutral-100 truncate" title={link.name}>{link.name || '—'}</span>
                            <span className="flex-1 min-w-0 text-neutral-400 truncate" title={link.url}>{link.url}</span>
                            <button
                                className="p-1 text-neutral-400 hover:text-red-400"
                                onClick={() => save(links.filter((_, i) => i !== index))}
                                title={t('settings.customLinkRemove')}
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

export default CustomLinkSettings;
