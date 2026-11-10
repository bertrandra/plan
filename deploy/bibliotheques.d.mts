// Les types de deploy/bibliotheques.mjs, pour vite.config.ts et les tests.
export declare const DOSSIER_VENDOR: string;
export declare function source(racine: string, chemin: string): string | null;
export declare function fichiersBibliotheques(racine: string, adressesCdn: string[]): { chemin: string; source: string }[];
export declare function servirBibliotheques(racine: string): (req: { url?: string }, res: { setHeader(n: string, v: string): void; end(b: Uint8Array): void }, suite: () => void) => void;
