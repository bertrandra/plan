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

import { dateFr } from '../util/format.js';

export const APP_VERSION = '5.0.0';
// 2 depuis la 2.2.0 : un batiment peut porter `facades` et `toit` (releve de facade). Un fichier
// qui n'en porte pas s'ouvre toujours dans la 2.1.x ; celui qui en porte y perdrait ces champs au
// premier enregistrement, d'ou le refus (RELEASE.md §3.1).
// 3 : un toit peut etre `croupes` (MD/spec-toit-ign.md), pose sur le squelette droit du contour ;
// la migration 2 -> 3 en donne un a chaque batiment BD TOPO qui n'en avait pas.
// 4 : la parcelle peut porter `relief`, la grille d'altitudes lue a l'IGN (MD/spec-relief.md) ; un
// lecteur 3 la perdrait au premier enregistrement. La migration 3 -> 4 est l'identite.
// 5 : les champs venus apres le relief (piscine, pergola, cloture, corps et volumes du toit, toit mesure, fenetres et voisinage
// en 3D, rues) ; ils s'ecrivaient au 4, qu'un lecteur 4 aurait perdus (migrations.ts, CHAMPS_DEPUIS). La migration 4 -> 5 est
// l'identite. Un releve y garde aussi la calibration de sa detection (`calibration`, etape 1.4). La plateforme doit accepter 5
// avant le depot (contrat/SOURCE-PRODUIT.md).
// 6 : les champs venus apres le premier schema 5 livre (4.0.0) : la retouche a la main d'un objet de l'IGN (`retoucheMain`), la
// hauteur a l'egout choisie (`egoutChoisi`) et le soleil du projet (`soleil`, sur la parcelle). Ils s'ecrivaient au 5, qu'un
// lecteur 5 d'avant aurait perdus. La migration 5 -> 6 est l'identite ; la plateforme accepte 6 depuis bertrandra/backprod#242.
// 7 : la Facade d'un releve valide (MD/spec-facade-calage-audit.md §3.4, lot F5) : ses dimensions, sa forme, son parement, la pose de
// sa texture, et ses ouvertures en objets (identifiant, date de verification, carreaux). Un lecteur 6 les garderait a la lecture,
// mais les perdrait des que la facade se reecrit (le releve d'un mur refait, la mesure de l'audit posee d'office) : une ouverture
// verifiee redeviendrait deplacable. La migration 6 -> 7 est l'identite ; la plateforme doit accepter 7 avant le depot.
// 8 : le reglement de la zone du PLU lu pour le projet (lot L4 de la lecture IA elargie) : `reglementPlu` sur la parcelle, sa source, la
// lecture de Claude et ses faits proposes ou valides. Un lecteur 7 le perdrait au premier enregistrement (la serialisation est une liste
// blanche). La migration 7 -> 8 est l'identite ; un projet sans lecture du PLU s'ecrit toujours au plus petit schema qui le decrit.
// La plateforme accepte deja 7 a 12 (contrat de la plateforme) : rien a deployer chez elle avant le depot.
// 9 : le jardin (lot L3 de la lecture IA elargie, MD/spec-lecture-ia-elargie.md §4.4) : la plantation d'un massif (`plantation` : son
// type, plate-bande ou massif, son mini-arbre), le retrait de sa vegetation en 3D (`vegetation3d`), la nature d'un equipement (`nature` :
// regard, eclairage, robinet) et la marque `existant`. Un lecteur 8 les perdrait au premier enregistrement (la serialisation est une
// liste blanche), et un regard redeviendrait un spa qui charge la terrasse. La migration 8 -> 9 est l'identite ; la plateforme accepte
// deja les schemas 7 a 12.
export const SCHEMA_VERSION = 9;
export const API_VERSION = 'v1';
export const BUILD_AT = '2026-10-29';
export const BUILD_SHA: string | null = null;

export function versionLongue(): string {
  return APP_VERSION + (BUILD_SHA ? ' · ' + BUILD_SHA : '') + ' · ' + BUILD_AT;
}

/** Ligne d'identification portee par les exports texte (SVG, DXF, resume, PDF). */
export function signatureExport(maintenant: Date = new Date()): string {
  return 'Plan interactif ' + APP_VERSION + ' — ' + dateFr(maintenant);
}
