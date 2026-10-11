import type { MetadataProvider } from '../../shared/metadataApi';

export interface ApiSettings {
    apiKeyKinopoisk: string;
    apiKeyTheMovieDb: string;
    defaultProvider?: MetadataProvider;
}
