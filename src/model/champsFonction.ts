// Ecrire dans le sous-objet d'une fonction (model/typesFonctions.ts) : il est cree au premier champ pose. Lire n'en a pas besoin
// (`o.batiment?.toit`) : un objet qui n'a rien d'un batiment ne porte pas de sous-objet vide, et son fichier garde sa forme.

import type { ChampsArbre, ChampsBatiment, ChampsParasol, ObjetBrut, ObjetPlan } from './types.js';

type AvecFonctions = Pick<ObjetPlan, 'batiment' | 'arbre' | 'parasol'>;

/** Le toit et les facades de l'objet, crees vides s'il n'en avait pas. */
export function champsBatiment(o: AvecFonctions): ChampsBatiment {
  return (o.batiment ??= {});
}

/** Le diametre et l'essence de l'arbre, crees vides s'il n'en avait pas. */
export function champsArbre(o: AvecFonctions): ChampsArbre {
  return (o.arbre ??= {});
}

/** Le pied du parasol, cree vide s'il n'en avait pas. */
export function champsParasol(o: AvecFonctions): ChampsParasol {
  return (o.parasol ??= {});
}

// ---------------------------------------------------------------------------------------------
// Le fichier de projet garde les champs a plat
// ---------------------------------------------------------------------------------------------
//
// Les sous-objets ne vivent qu'en memoire : le fichier de projet, l'historique et les exports gardent la forme d'avant, champ a
// plat (`toit`, `diametreArbre`, `hauteurParasol`…), au bit pres (empreinte projet.json). La normalisation les range a la
// lecture (model/normalisation.ts), la serialisation les remet a plat (io/serialisation.ts).

type SousObjet = 'batiment' | 'arbre' | 'parasol';

/** Chaque champ a plat du fichier : le sous-objet qui le porte en memoire, et son nom dedans. */
export const CHAMPS_A_PLAT: Readonly<Record<string, readonly [SousObjet, string]>> = {
  volumesToit: ['batiment', 'volumesToit'], toitMesure: ['batiment', 'toitMesure'], corpsToit: ['batiment', 'corpsToit'],
  toitLidarLu: ['batiment', 'toitLidarLu'], couleurMurs: ['batiment', 'couleurMurs'], verifieSurPlace: ['batiment', 'verifieSurPlace'],
  toitFige: ['batiment', 'toitFige'], toitACheval: ['batiment', 'toitACheval'], modeToit: ['batiment', 'modeToit'],
  facades: ['batiment', 'facades'], toit: ['batiment', 'toit'], fenetres3d: ['batiment', 'fenetres3d'], profilFacades: ['batiment', 'profilFacades'],
  diametreArbre: ['arbre', 'diametre'], couleurArbre: ['arbre', 'couleur'], especeArbre: ['arbre', 'espece'], textureArbre: ['arbre', 'texture'],
  hauteurParasol: ['parasol', 'hauteur'], matDeporte: ['parasol', 'matDeporte'], matAngleDeg: ['parasol', 'matAngleDeg'],
  matSurPerimetre: ['parasol', 'matSurPerimetre'], terrasseLieeKey: ['parasol', 'terrasseLieeKey'],
};

/**
 * Range dans leurs sous-objets les champs a plat d'un objet lu (fichier, instantane d'historique, copie) ; ecrit sur l'objet, qui
 * doit etre une copie. Un champ pose a `undefined` retire le champ du sous-objet, sans en creer un ; `null` et `false` passent tels
 * quels, pour que la serialisation reecrive le meme fichier.
 */
export function rangerChampsAPlat(o: Record<string, unknown>): void {
  for (const [plat, [sous, nom]] of Object.entries(CHAMPS_A_PLAT)) {
    if (!(plat in o)) continue;
    const v = o[plat];
    delete o[plat];
    const s = o[sous];
    if (v === undefined) {
      if (s && typeof s === 'object' && nom in s) { const sans = { ...(s as Record<string, unknown>) }; delete sans[nom]; o[sous] = sans; }
      continue;
    }
    const cible = (s && typeof s === 'object' ? { ...(s as Record<string, unknown>) } : {}) as Record<string, unknown>;
    cible[nom] = v;
    o[sous] = cible;
  }
}

/** Une copie d'un objet a plat (une serialisation), ses champs ranges dans leurs sous-objets : la forme de la memoire. */
export function versMemoire(o: object): ObjetBrut {
  const c = { ...o } as Record<string, unknown>;
  rangerChampsAPlat(c);
  return c as ObjetBrut;
}

/**
 * La forme a plat d'un objet, sans le copier en profondeur : ses champs, et ceux de ses sous-objets sous leur nom du fichier, a la
 * place du sous-objet (l'ordre des clefs suit celui de l'objet).
 */
export function aPlat(o: object): Record<string, unknown> {
  const src = o as Record<string, unknown>;
  if (!SOUS_OBJETS.some((s) => src[s] && typeof src[s] === 'object')) return src;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (!(SOUS_OBJETS as readonly string[]).includes(k)) { out[k] = v; continue; }
    if (!v || typeof v !== 'object') continue;
    for (const [nom, val] of Object.entries(v as Record<string, unknown>)) out[NOM_A_PLAT[k + '.' + nom] ?? nom] = val;
  }
  return out;
}

/** `batiment.toit` -> `toit`, `arbre.diametre` -> `diametreArbre`… */
const NOM_A_PLAT: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(CHAMPS_A_PLAT).map(([plat, [sous, nom]]) => [sous + '.' + nom, plat]));

const SOUS_OBJETS: readonly SousObjet[] = ['batiment', 'arbre', 'parasol'];
