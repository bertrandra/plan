// Identite de version (spec §3.2 : ce qui etait en tete du fichier mono-page).
//
// Trois contrats independants, trois numeros : l'application (SemVer), le schema du fichier de
// projet (entier monotone) et l'API (prefixe de route). Voir MD/RELEASE.md.
//
// Pas de build ni d'injection a ce stade : le "build id" se reduit a la date de figeage. Il
// identifie l'artefact, pas un contrat (RELEASE.md §5.1). L'artefact etant le source lui-meme,
// aucun fichier ne peut porter l'empreinte du commit qui le contient - c'est l'etiquette git qui
// l'identifie.
//
// ---------------------------------------------------------------------------------------------
// La rupture du 29 aout 2026
// ---------------------------------------------------------------------------------------------
//
// `APP_VERSION` est estampillee dans les six artefacts exportes : en-tete du resume, metadonnees du
// SVG, signature du DXF, `/Producer` des deux PDF, `meta.appVersion` du projet JSON. La changer
// **change donc les empreintes**, et c'est voulu.
//
// Jusqu'ici l'invariant de la migration etait « les six empreintes ne bougent pas ». Il devient :
// « les six empreintes ne bougent que par la version ». Ce que cela vaut a ete etabli avant le
// changement, pas apres : le meme build, estampille `1.0.0`, reproduisait les empreintes de la
// version figee au bit pres. Le passage a `1.1.0-alpha.1` est donc le seul ecart, et les empreintes
// de reference ont ete recapturees a ce numero (voir `tests/fixtures/golden/EMPREINTES.md`).
//
// Le SCHEMA du projet, lui, ne bouge pas : un fichier enregistre par l'ancienne version s'ouvre
// dans la nouvelle, et l'inverse aussi. La rupture porte sur l'artefact livre, pas sur les donnees.

export const APP_VERSION = '1.2.0-alpha.10';
export const SCHEMA_VERSION = 1;
export const API_VERSION = 'v1';
export const BUILD_AT = '2026-09-21';
export const BUILD_SHA: string | null = null;

export function versionLongue(): string {
  return APP_VERSION + (BUILD_SHA ? ' · ' + BUILD_SHA : '') + ' · ' + BUILD_AT;
}

/** Ligne d'identification portee par les exports texte (SVG, DXF, resume, PDF). */
export function signatureExport(): string {
  return 'Plan interactif ' + APP_VERSION + ' — ' + new Date().toLocaleDateString('fr-FR');
}
