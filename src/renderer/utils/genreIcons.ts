import star from '../../assets/genre-icons/star.png';
import fire from '../../assets/genre-icons/fire.png';
import heart from '../../assets/genre-icons/heart.png';
import ghost from '../../assets/genre-icons/ghost.png';
import rocket from '../../assets/genre-icons/rocket.png';
import crown from '../../assets/genre-icons/crown.png';

// Icons a genre button can have (chosen in the settings). The ids are saved, so they must not change.
// Microsoft Fluent Emoji (MIT).
export const GENRE_ICONS: { id: string; src: string }[] = [
    { id: 'star', src: star },
    { id: 'fire', src: fire },
    { id: 'heart', src: heart },
    { id: 'ghost', src: ghost },
    { id: 'rocket', src: rocket },
    { id: 'crown', src: crown },
];

export const getGenreIconSrc = (id: string | undefined): string | undefined =>
    GENRE_ICONS.find(icon => icon.id === id)?.src;
