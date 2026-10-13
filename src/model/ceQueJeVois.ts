// « Ce que je vois » (MD/spec-audit.md §8.1) : le positif d'une observation, ecrit avec le vocabulaire
// des toits (MD/spec-regles-toits.md §2, §3 et §7.2). C'est le coeur de la liste de controle de
// l'audit de la parcelle (§12) et une section facultative de la fiche de la promenade.
//
// On n'ecrit que ce que l'on a vu : chaque champ est facultatif, et un champ absent n'affirme rien
// (comme une assertion absente de l'attendu d'un cas, spec-regles-toits §7.1). Les termes marques
// d'un doute dans le vocabulaire (Deversee, Queue de vache, Brisure, decision D12) ne sont pas
// proposes.

import type { MateriauTexture } from './couleurMur.js';
import type { CouvertureChoisie, PositionCheminee, Cheminee, TerrasseToit } from './types.js';

/** Les formes du catalogue (spec-regles-toits §3.1) qu'une personne reconnait depuis la rue. */
export type FormeVue =
  | 'plat' | 'appentis' | 'deux-pans' | 'croupes' | 'pavillon' | 'demi-croupe' | 'mansart'
  | 'asymetrique' | 'deux-pans-decales' | 'toit-en-m' | 'papillon' | 'gambrel' | 'shed' | 'berceau' | 'autre';

/** Les formes courantes d'abord ; les autres se rangent dans « Autres formes » (spec-regles-toits §7.2). */
export const FORMES_COURANTES: readonly { code: FormeVue; libelle: string }[] = [
  { code: 'deux-pans', libelle: 'Deux pans' },
  { code: 'croupes', libelle: 'Quatre pans (croupes)' },
  { code: 'appentis', libelle: 'Un pan (appentis)' },
  { code: 'plat', libelle: 'Plat (terrasse)' },
  { code: 'mansart', libelle: 'Mansart' },
];
export const AUTRES_FORMES: readonly { code: FormeVue; libelle: string }[] = [
  { code: 'pavillon', libelle: 'Pavillon (pyramide)' },
  { code: 'demi-croupe', libelle: 'Demi-croupes' },
  { code: 'asymetrique', libelle: 'Asymétrique' },
  { code: 'deux-pans-decales', libelle: 'Deux pans décalés' },
  { code: 'toit-en-m', libelle: 'En M (deux toits accolés)' },
  { code: 'papillon', libelle: 'Papillon (en V)' },
  { code: 'gambrel', libelle: 'Gambrel' },
  { code: 'shed', libelle: 'Shed (dents de scie)' },
  { code: 'berceau', libelle: 'Berceau (voûte)' },
  { code: 'autre', libelle: 'Autre forme' },
];

/** Le sens du faitage par rapport a la rue (spec-regles-toits §7.1, `faitage`). */
export type SensFaitage = 'perpendiculaire' | 'parallele';
export const SENS_FAITAGE: readonly { code: SensFaitage; libelle: string }[] = [
  { code: 'parallele', libelle: 'Parallèle à la rue' },
  { code: 'perpendiculaire', libelle: 'Perpendiculaire à la rue' },
];

/** Les bouts du toit, dans l'ordre du faitage quand ils different (spec-regles-toits §7.1, `bouts`). */
export type BoutsVus = 'pignons' | 'croupes' | 'pignon-croupe' | 'demi-croupes';
export const BOUTS: readonly { code: BoutsVus; libelle: string }[] = [
  { code: 'pignons', libelle: 'Deux pignons' },
  { code: 'croupes', libelle: 'Deux croupes' },
  { code: 'pignon-croupe', libelle: 'Un pignon, une croupe' },
  { code: 'demi-croupes', libelle: 'Demi-croupes' },
];

/** Le pan qui porte les lucarnes, vu depuis la rue. */
export type PanLucarnes = 'rue' | 'jardin' | 'les-deux';
export const PANS_LUCARNES: readonly { code: PanLucarnes; libelle: string }[] = [
  { code: 'rue', libelle: 'Côté rue' },
  { code: 'jardin', libelle: 'Côté jardin' },
  { code: 'les-deux', libelle: 'Des deux côtés' },
];

export const POSITIONS_CHEMINEE: readonly { code: PositionCheminee; libelle: string }[] = [
  { code: 'faitage', libelle: 'Au faîtage' },
  { code: 'pan', libelle: 'Dans un pan' },
  { code: 'pignon', libelle: 'Dans le pignon' },
  { code: 'facade', libelle: 'Adossée en façade' },
];
export type MateriauCheminee = NonNullable<Cheminee['materiau']>;
export const MATERIAUX_CHEMINEE: readonly { code: MateriauCheminee; libelle: string }[] = [
  { code: 'brique', libelle: 'Brique' },
  { code: 'enduit', libelle: 'Enduit' },
  { code: 'pierre', libelle: 'Pierre' },
  { code: 'metal', libelle: 'Métal (tubage)' },
];
export type CouronnementCheminee = NonNullable<Cheminee['couronnement']>;
export const COURONNEMENTS: readonly { code: CouronnementCheminee; libelle: string }[] = [
  { code: 'dalle', libelle: 'Dalle' },
  { code: 'chapeau', libelle: 'Chapeau' },
  { code: 'mitrons', libelle: 'Mitrons' },
];

export type RevetementTerrasse = NonNullable<TerrasseToit['revetement']>;
export const REVETEMENTS_TERRASSE: readonly { code: RevetementTerrasse; libelle: string }[] = [
  { code: 'gravillons', libelle: 'Gravillons' },
  { code: 'membrane', libelle: 'Membrane' },
  { code: 'dalles', libelle: 'Dalles' },
  { code: 'bois', libelle: 'Lames de bois' },
  { code: 'vegetalise', libelle: 'Végétalisée' },
];
/** La hauteur de l'acrotere, a vue : 0 pour aucun (spec-regles-toits §7.2 : « oui, non, hauteur a vue »). */
export const ACROTERES: readonly { valeur: number; libelle: string }[] = [
  { valeur: 0, libelle: 'Aucun' },
  { valeur: 0.3, libelle: 'Bas (30 cm)' },
  { valeur: 0.6, libelle: 'Moyen (60 cm)' },
  { valeur: 1, libelle: 'Haut (1 m)' },
];

export const MATERIAUX_MURS_VUS: readonly { code: MateriauTexture; libelle: string }[] = [
  { code: 'enduit', libelle: 'Enduit' },
  { code: 'pierre', libelle: 'Pierre' },
  { code: 'meuliere', libelle: 'Meulière' },
  { code: 'brique', libelle: 'Brique' },
  { code: 'beton', libelle: 'Béton' },
  { code: 'bois', libelle: 'Bois' },
];
export type CouvertureVue = CouvertureChoisie | 'terrasse';
export const COUVERTURES_VUES: readonly { code: CouvertureVue; libelle: string }[] = [
  { code: 'tuile', libelle: 'Tuiles mécaniques' },
  { code: 'tuile-plate', libelle: 'Tuiles plates' },
  { code: 'tuile-canal', libelle: 'Tuiles canal' },
  { code: 'ardoise', libelle: 'Ardoise' },
  { code: 'zinc', libelle: 'Zinc' },
  { code: 'terrasse', libelle: 'Étanchéité (terrasse)' },
];

/** Une souche vue : sa position, et ce qu'on distingue de son materiau et de son couronnement. */
export interface SoucheVue {
  position?: PositionCheminee;
  materiau?: MateriauCheminee;
  couronnement?: CouronnementCheminee;
}

/** Ce que l'on voit d'un batiment. Tout est facultatif : on n'ecrit que ce que l'on a vu. */
export interface CeQueJeVois {
  forme?: FormeVue;
  sensFaitage?: SensFaitage;
  bouts?: BoutsVus;
  lucarnes?: { nombre: number; pan?: PanLucarnes };
  /** `nombre: 0` : on a regarde, il n'y en a aucune. Une souche par cheminee, dans l'ordre ou on les note. */
  cheminees?: { nombre: number; souches: SoucheVue[] };
  terrasse?: { accessible?: boolean; revetement?: RevetementTerrasse; acrotereM?: number; gardeCorps?: boolean; edicules?: number };
  murs?: MateriauTexture;
  couverture?: CouvertureVue;
}

/** Les cheminees et les lucarnes se comptent jusque-la : au-dela, la photo le dira mieux. */
export const NOMBRE_VU_MAX = 6;

/** Les parties de « Ce que je vois », chacune une ligne de la liste de controle (spec-audit §12.1). */
export type PartieVue = 'toit' | 'cheminees' | 'terrasse' | 'materiaux';

/** Le toit est-il vu : sa forme, le sens du faitage, ses bouts ou ses lucarnes. */
export const toitVu = (v: CeQueJeVois): boolean => v.forme !== undefined || v.sensFaitage !== undefined || v.bouts !== undefined || v.lucarnes !== undefined;
/** Les cheminees : pas encore regardees, aucune, ou vues (avec leur nombre). */
export function etatCheminees(v: CeQueJeVois): 'aVoir' | 'aucune' | 'vues' {
  if (!v.cheminees) return 'aVoir';
  return v.cheminees.nombre > 0 ? 'vues' : 'aucune';
}
export const terrasseVue = (v: CeQueJeVois): boolean => !!v.terrasse && Object.values(v.terrasse).some((x) => x !== undefined);
/** Les materiaux sont vus quand les murs et la couverture le sont : la ligne porte les deux. */
export const materiauxVus = (v: CeQueJeVois): boolean => v.murs !== undefined && v.couverture !== undefined;

/** Une partie est-elle notee (la ligne de la liste passe a « vu »). */
export function partieVue(v: CeQueJeVois, p: PartieVue): boolean {
  if (p === 'toit') return toitVu(v);
  if (p === 'cheminees') return etatCheminees(v) !== 'aVoir';
  if (p === 'terrasse') return terrasseVue(v);
  return materiauxVus(v);
}

/** Rien n'est note : la fiche de la promenade n'ecrit pas de section vide dans son fichier. */
export const rienVu = (v: CeQueJeVois | undefined): boolean => !v || (['toit', 'cheminees', 'terrasse'] as const).every((p) => !partieVue(v, p)) && v.murs === undefined && v.couverture === undefined;

/**
 * Le nombre de cheminees change : les souches suivent (les premieres gardent ce qu'on en a dit, les
 * suivantes arrivent vides). Pur : rend un nouvel objet.
 */
export function avecNombreDeCheminees(v: CeQueJeVois, nombre: number): CeQueJeVois {
  const n = Math.max(0, Math.min(NOMBRE_VU_MAX, Math.round(nombre)));
  const avant = v.cheminees?.souches ?? [];
  const souches = Array.from({ length: n }, (_, i) => ({ ...(avant[i] ?? {}) }));
  return { ...v, cheminees: { nombre: n, souches } };
}

/** Une souche change : une copie, les autres intactes. */
export function avecSouche(v: CeQueJeVois, rang: number, souche: SoucheVue): CeQueJeVois {
  const c = v.cheminees;
  if (!c || rang < 0 || rang >= c.souches.length) return v;
  return { ...v, cheminees: { ...c, souches: c.souches.map((s, i) => (i === rang ? { ...souche } : s)) } };
}

/** Le libelle d'un code dans une liste de choix, ou le code lui-meme. */
export function libelleDe<T extends string>(liste: readonly { code: T; libelle: string }[], code: T | undefined): string {
  return code === undefined ? '' : liste.find((x) => x.code === code)?.libelle ?? code;
}

/**
 * Le resume d'une partie, pour la ligne de la liste : « Deux pans · parallèle à la rue », « 2 au
 * faîtage », « Enduit · ardoise ». Vide quand rien n'est note.
 */
export function resumePartie(v: CeQueJeVois, p: PartieVue): string {
  const morceaux: string[] = [];
  if (p === 'toit') {
    if (v.forme) morceaux.push(libelleDe([...FORMES_COURANTES, ...AUTRES_FORMES], v.forme));
    if (v.sensFaitage) morceaux.push(libelleDe(SENS_FAITAGE, v.sensFaitage).toLowerCase());
    if (v.bouts) morceaux.push(libelleDe(BOUTS, v.bouts).toLowerCase());
    if (v.lucarnes) morceaux.push(v.lucarnes.nombre ? v.lucarnes.nombre + ' lucarne' + (v.lucarnes.nombre > 1 ? 's' : '') : 'sans lucarne');
  } else if (p === 'cheminees') {
    const c = v.cheminees;
    if (c) morceaux.push(c.nombre ? c.nombre + ' cheminée' + (c.nombre > 1 ? 's' : '') : 'aucune cheminée');
    const positions = [...new Set((c?.souches ?? []).map((s) => s.position).filter((x): x is PositionCheminee => !!x))];
    if (positions.length) morceaux.push(positions.map((x) => libelleDe(POSITIONS_CHEMINEE, x).toLowerCase()).join(', '));
  } else if (p === 'terrasse') {
    const t = v.terrasse;
    if (t?.accessible !== undefined) morceaux.push(t.accessible ? 'accessible' : 'inaccessible');
    if (t?.revetement) morceaux.push(libelleDe(REVETEMENTS_TERRASSE, t.revetement).toLowerCase());
    if (t?.acrotereM !== undefined) morceaux.push(t.acrotereM > 0 ? 'acrotère ' + String(t.acrotereM).replace('.', ',') + ' m' : 'sans acrotère');
    if (t?.edicules) morceaux.push(t.edicules + ' édicule' + (t.edicules > 1 ? 's' : ''));
  } else {
    if (v.murs) morceaux.push(libelleDe(MATERIAUX_MURS_VUS, v.murs));
    if (v.couverture) morceaux.push(libelleDe(COUVERTURES_VUES, v.couverture).toLowerCase());
  }
  const texte = morceaux.join(' · ');
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
