import type { MetadataProvider } from '../../shared/metadataApi';

export interface ApiSettings {
    apiKeyKinopoisk: string;
    apiKeyTheMovieDb: string;
    // Used by automatic loading and the first search in the metadata editor
    defaultProvider?: MetadataProvider;
}
