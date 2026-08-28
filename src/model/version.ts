// Identite de version (spec §3.2 : ce qui etait en tete du fichier mono-page).
//
// Trois contrats independants, trois numeros : l'application (SemVer), le schema du fichier de
// projet (entier monotone) et l'API (prefixe de route). Voir MD/RELEASE.md.
//
// Pas de build ni d'injection a ce stade : le "build id" se reduit a la date de figeage. Il
// identifie l'artefact, pas un contrat (RELEASE.md §5.1). L'artefact etant le source lui-meme,
// aucun fichier ne peut porter l'empreinte du commit qui le contient - c'est l'etiquette git qui
// l'identifie.

export const APP_VERSION = '1.0.0';
export const SCHEMA_VERSION = 1;
export const API_VERSION = 'v1';
export const BUILD_AT = '2026-08-28';
export const BUILD_SHA: string | null = null;

export function versionLongue(): string {
  return APP_VERSION + (BUILD_SHA ? ' · ' + BUILD_SHA : '') + ' · ' + BUILD_AT;
}

/** Ligne d'identification portee par les exports texte (SVG, DXF, resume, PDF). */
export function signatureExport(): string {
  return 'Plan interactif ' + APP_VERSION + ' — ' + new Date().toLocaleDateString('fr-FR');
}
