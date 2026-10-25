// Ce qui se mesure sur une facade relevee (MD/spec-facades-calage-detection.md §15.1, lot G11) :
// largeur et hauteur des fenetres, appui, entraxe, part vitree, baies par niveau, place de la porte,
// garage, et le type de la facade (sur rue, arriere, pignon) quand le contexte le dit.
//
// Ces mesures sont ce que les profils de facades (G12) regleront et ce que le taux de conformite (G13)
// comparera a la disposition automatique (facade/ouvertures.ts). Elles se lisent donc dans les memes
// termes que cette disposition : un appui compte depuis le plancher suppose de son niveau (l'etage
// fois la hauteur d'un niveau), l'entraxe est l'ecart de deux baies voisines d'une rangee, la porte se
// place le long du mur.
//
// Pur, sans image ni reseau : le banc de facades le rejoue sur la verite de ses scenes, l'audit sur
// les releves du fichier de parcelle. Rien n'est calcule ailleurs a partir de ces mesures pour
// l'instant : elles ne changent aucune valeur produite par Plan.

import type { GrilleFacade, OuvertureFacade, PartieBasse, TypeOuverture } from './types.js';

/**
 * La hauteur d'un niveau quand le releve n'en a qu'un : la meme que `HAUTEUR_ETAGE_M` de
 * geo/bdtopo.ts (couche au-dessus, que le modele ne lit pas ; un test les garde egales).
 */
export const HAUTEUR_NIVEAU_DEFAUT_M = 2.7;
/** Deux baies sont du meme niveau si leurs hauteurs se recouvrent sur cette part de la plus basse (comme facade/detection/structure.ts). */
const RECOUVREMENT_NIVEAU = 0.5;
/** Ecart des centres d'une meme travee, d'une rangee a l'autre (comme facade/detection/structure.ts). */
const TRAVEE_M = 0.1;
/** Une porte est sous une baie d'etage quand leurs centres sont a moins de cela : la travee est montee a l'aplomb. */
const ALIGNEE_M = 0.15;

/** Le role d'une facade dans le batiment (spec §15.1). */
export type TypeFacade = 'rue' | 'arriere' | 'pignon';

/**
 * Ce que l'on sait du mur hors de la photo ; chaque champ est facultatif et `null` dit « on ne sait
 * pas ». `surRue` : le mur donne sur la rue (photo de rue, ou le mur oppose donne sur la rue :
 * `false`). `pignon` : le toit forme un pignon au-dessus du mur. `coteVoisin` : un autre batiment est
 * contre le mur ou tout pres.
 */
export interface ContexteFacade {
  surRue?: boolean | null;
  pignon?: boolean | null;
  coteVoisin?: boolean | null;
}

/** Ce que la mesure lit d'un releve. */
export interface FacadeAMesurer {
  largeur: number;
  hauteur: number;
  ouvertures: readonly OuvertureFacade[];
  grille?: GrilleFacade | null;
  partieBasse?: PartieBasse | null;
}

export interface MesureNiveau {
  /** Appui et linteau de la rangee, en metres depuis le sol (ceux de la grille). */
  appuiM: number;
  linteauM: number;
  /** Le numero d'etage suppose : 0 au rez-de-chaussee. */
  etage: number;
  baies: number;
  fenetres: number;
}

export interface MesurePorte {
  /** Le centre de la porte, en metres depuis la gauche du mur vu de dehors, et sa part de la largeur. */
  xM: number;
  part: number;
  position: 'gauche' | 'centre' | 'droite';
  /** Une baie d'un autre niveau est-elle a son aplomb (la porte tient la place d'une fenetre de la travee) ? */
  alignee: boolean;
}

export interface MesureFacade {
  largeurM: number;
  hauteurM: number;
  surfaceMurM2: number;
  baies: number;
  parType: Record<TypeOuverture, number>;
  /** Les medianes des fenetres (type `fenetre` seul) ; l'appui depuis le plancher de leur niveau. */
  fenetre: { n: number; largeurM: number; hauteurM: number; appuiM: number } | null;
  /** L'ecart median des centres de deux baies voisines d'une rangee (garages exclus) ; null sans deux baies cote a cote. */
  entraxeM: number | null;
  /** L'ecart median des linteaux de deux niveaux voisins ; null sous deux niveaux. */
  hauteurNiveauM: number | null;
  /** Fenetres et portes-fenetres sur la surface du mur : ce qui est vitre. */
  partVitree: number;
  /** Toutes les baies (portes et garages compris) sur la surface du mur. */
  partBaies: number;
  niveaux: MesureNiveau[];
  baiesParNiveau: number[];
  /** La porte d'entree (la plus basse, puis la plus a gauche) ; null sans porte. */
  porte: MesurePorte | null;
  garage: { n: number; largeurM: number } | null;
  /** Aucune baie : un pignon aveugle, le plus souvent cote voisin. */
  aveugle: boolean;
  type: TypeFacade | null;
  coteVoisin: boolean | null;
}

const cm = (v: number) => Math.round(v * 100) / 100;
const millieme = (v: number) => Math.round(v * 1000) / 1000;
const centre = (o: Pick<OuvertureFacade, 'x' | 'l'>) => o.x + o.l / 2;
const surface = (os: readonly OuvertureFacade[]) => os.reduce((s, o) => s + o.l * o.h, 0);

function mediane(v: readonly number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/** Les ecarts entre valeurs voisines d'une liste triee. */
const ecarts = (v: readonly number[]) => v.slice(1).map((x, i) => x - (v[i] ?? x));

/**
 * Le type d'une facade, d'apres son contexte. La rue l'emporte : un pignon sur rue porte les baies
 * de la rue. Un mur que l'on sait hors de la rue, sans pignon, est l'arriere. Sans rien de sur : null.
 */
export function typeDeFacade(c: ContexteFacade): TypeFacade | null {
  if (c.surRue === true) return 'rue';
  if (c.pignon === true) return 'pignon';
  if (c.surRue === false) return 'arriere';
  return null;
}

/** Recouvrement vertical d'une baie et d'une bande, rapporte a la plus basse des deux. */
function recouvrement(a0: number, a1: number, b0: number, b1: number): number {
  const inter = Math.min(a1, b1) - Math.max(a0, b0);
  return inter > 0 ? inter / Math.min(a1 - a0, b1 - b0) : 0;
}

/**
 * La grille d'un releve qui n'en porte pas (releve d'avant le lot L15) : niveaux par recouvrement des
 * hauteurs, travees par centres a l'aplomb, avec les regles de facade/detection/structure.ts, simplifiees (pas
 * de regularisation) : elle ne sert qu'a compter et a mesurer.
 */
export function grilleSimple(ouvertures: readonly OuvertureFacade[]): GrilleFacade {
  const parBas = [...ouvertures].sort((a, b) => a.y - b.y);
  const rangs: OuvertureFacade[][] = [];
  for (const o of parBas) {
    const r = rangs.find((g) => g.some((x) => recouvrement(o.y, o.y + o.h, x.y, x.y + x.h) >= RECOUVREMENT_NIVEAU));
    if (r) r.push(o);
    else rangs.push([o]);
  }
  const niveaux = rangs.map((g) => {
    const f = g.filter((o) => o.type === 'fenetre');
    const ref = f.length ? f : g;
    return { appuiM: cm(f.length ? (mediane(f.map((o) => o.y)) ?? 0) : Math.min(...g.map((o) => o.y))), linteauM: cm(mediane(ref.map((o) => o.y + o.h)) ?? 0) };
  }).sort((a, b) => a.linteauM - b.linteauM);
  const centres = ouvertures.map((o) => ({ c: centre(o), l: o.l })).sort((a, b) => a.c - b.c);
  const colonnes: { c: number; l: number }[][] = [];
  for (const x of centres) {
    const der = colonnes[colonnes.length - 1];
    if (der && x.c - (der[der.length - 1]?.c ?? x.c) <= TRAVEE_M) der.push(x);
    else colonnes.push([x]);
  }
  const travees = colonnes.map((g) => ({ xM: cm(mediane(g.map((x) => x.c)) ?? 0), largeurM: cm(mediane(g.map((x) => x.l)) ?? 0) }));
  return { niveaux, travees };
}

/** Le niveau d'une ouverture : celui que porte le releve, sinon la rangee de la grille qui la recouvre le plus. */
function niveauDe(o: OuvertureFacade, g: GrilleFacade, duReleve: boolean): number {
  if (duReleve && o.niveau !== undefined && o.niveau >= 0 && o.niveau < g.niveaux.length) return o.niveau;
  let meilleur = 0, rec = -1;
  g.niveaux.forEach((n, k) => {
    const r = recouvrement(o.y, o.y + o.h, Math.min(n.appuiM, o.y), n.linteauM);
    if (r > rec) { rec = r; meilleur = k; }
  });
  return meilleur;
}

/**
 * Le numero d'etage d'une rangee : son appui divise par la hauteur d'un niveau. Une fenetre a 0,9 m
 * du plancher et un niveau de 2,7 a 3 m donnent le bon etage jusqu'a un rez-de-chaussee sureleve de
 * 1,5 m environ ; une porte-fenetre (appui au plancher) aussi.
 */
const etageDe = (appuiM: number, hNiveau: number) => Math.max(0, Math.floor((appuiM + 1e-6) / hNiveau));

function mesurerPorte(porte: OuvertureFacade | undefined, autres: readonly OuvertureFacade[], largeur: number): MesurePorte | null {
  if (!porte) return null;
  const xM = centre(porte);
  const part = largeur > 0 ? xM / largeur : 0.5;
  const alignee = autres.some((o) => o !== porte && o.y >= porte.y + porte.h - 0.05 && Math.abs(centre(o) - xM) <= ALIGNEE_M);
  return { xM: cm(xM), part: millieme(part), position: part < 1 / 3 ? 'gauche' : part > 2 / 3 ? 'droite' : 'centre', alignee };
}

/**
 * Les ecarts des centres de deux baies voisines d'une meme rangee, toutes rangees confondues. Le
 * garage n'y est pas : sa largeur ne suit pas le rythme des fenetres ; la porte y est, la disposition
 * automatique la pose a la place d'une fenetre. Une baie absente (une travee aveugle) fait un ecart
 * double, que la mediane ecarte.
 */
function ecartsDesRangees(os: readonly OuvertureFacade[], niv: readonly number[]): number[] {
  const parRangee = new Map<number, number[]>();
  os.forEach((o, i) => {
    if (o.type === 'garage') return;
    const k = niv[i] ?? 0;
    parRangee.set(k, [...(parRangee.get(k) ?? []), centre(o)]);
  });
  return [...parRangee.values()].flatMap((cs) => ecarts(cs.sort((a, b) => a - b)));
}

/** La surface du mur, du sol a l'egout ; la partie basse d'un mur en L s'arrete a son propre egout. */
function surfaceMur(f: FacadeAMesurer): number {
  const pb = f.partieBasse;
  const retrait = pb ? Math.max(0, pb.fin - pb.debut) * Math.max(0, f.hauteur - pb.hauteur) : 0;
  return Math.max(0, f.largeur * f.hauteur - retrait);
}

/** Ce qui se mesure sur une facade relevee (spec §15.1). */
export function mesurerFacade(f: FacadeAMesurer, contexte: ContexteFacade = {}): MesureFacade {
  const os = f.ouvertures;
  // Le rang d'une ouverture (`niveau`) ne vaut que dans la grille du releve qui l'a pose.
  const duReleve = !!f.grille && f.grille.niveaux.length > 0;
  const g = duReleve && f.grille ? f.grille : grilleSimple(os);
  const hNiveau = mediane(ecarts(g.niveaux.map((n) => n.linteauM)));
  const hRef = hNiveau && hNiveau > 0 ? hNiveau : HAUTEUR_NIVEAU_DEFAUT_M;
  const niv = os.map((o) => niveauDe(o, g, duReleve));
  const niveaux: MesureNiveau[] = g.niveaux.map((n, k) => ({
    appuiM: n.appuiM, linteauM: n.linteauM, etage: etageDe(n.appuiM, hRef),
    baies: niv.filter((x) => x === k).length,
    fenetres: os.filter((o, i) => niv[i] === k && o.type === 'fenetre').length,
  }));
  const fenetres = os.map((o, i) => ({ o, etage: niveaux[niv[i] ?? 0]?.etage ?? 0 })).filter((x) => x.o.type === 'fenetre');
  const parType: Record<TypeOuverture, number> = { fenetre: 0, 'porte-fenetre': 0, porte: 0, garage: 0 };
  for (const o of os) parType[o.type]++;
  const mur = surfaceMur(f);
  const portes = os.filter((o) => o.type === 'porte').sort((a, b) => a.y - b.y || a.x - b.x);
  const garages = os.filter((o) => o.type === 'garage');
  const entraxe = mediane(ecartsDesRangees(os, niv));
  return {
    largeurM: cm(f.largeur), hauteurM: cm(f.hauteur), surfaceMurM2: cm(mur),
    baies: os.length, parType,
    fenetre: fenetres.length ? {
      n: fenetres.length,
      largeurM: cm(mediane(fenetres.map((x) => x.o.l)) ?? 0),
      hauteurM: cm(mediane(fenetres.map((x) => x.o.h)) ?? 0),
      appuiM: cm(mediane(fenetres.map((x) => x.o.y - x.etage * hRef)) ?? 0),
    } : null,
    entraxeM: entraxe === null ? null : cm(entraxe),
    hauteurNiveauM: hNiveau === null ? null : cm(hNiveau),
    partVitree: mur > 0 ? millieme(surface(os.filter((o) => o.type === 'fenetre' || o.type === 'porte-fenetre')) / mur) : 0,
    partBaies: mur > 0 ? millieme(surface(os) / mur) : 0,
    niveaux,
    baiesParNiveau: niveaux.map((n) => n.baies),
    porte: mesurerPorte(portes[0], os, f.largeur),
    garage: garages.length ? { n: garages.length, largeurM: cm(mediane(garages.map((o) => o.l)) ?? 0) } : null,
    aveugle: os.length === 0,
    type: typeDeFacade(contexte),
    coteVoisin: contexte.coteVoisin ?? null,
  };
}

const pc = (v: number) => Math.round(v * 100) + ' %';
const cmTxt = (v: number) => String(Math.round(v * 100));

/**
 * La mesure en une ligne, pour les scripts du banc et de l'audit :
 * « fenetres 120x135 appui 90 · entraxe 310 · vitre 12 % · niveaux 3+3 · porte centre · garage 250 · rue ».
 */
export function resumeMesureFacade(m: MesureFacade): string {
  const morceaux: string[] = [];
  if (m.aveugle) morceaux.push('aveugle');
  if (m.fenetre) morceaux.push(`fenetres ${cmTxt(m.fenetre.largeurM)}x${cmTxt(m.fenetre.hauteurM)} appui ${cmTxt(m.fenetre.appuiM)}`);
  if (m.entraxeM !== null) morceaux.push('entraxe ' + cmTxt(m.entraxeM));
  if (!m.aveugle) morceaux.push('vitre ' + pc(m.partVitree), 'niveaux ' + m.baiesParNiveau.join('+'));
  if (m.hauteurNiveauM !== null) morceaux.push('etage ' + cmTxt(m.hauteurNiveauM));
  if (m.porte) morceaux.push('porte ' + m.porte.position + (m.porte.alignee ? ' alignee' : ''));
  if (m.garage) morceaux.push('garage ' + (m.garage.n > 1 ? m.garage.n + 'x' : '') + cmTxt(m.garage.largeurM));
  morceaux.push(m.type ?? 'type ?');
  if (m.coteVoisin) morceaux.push('cote voisin');
  return morceaux.join(' · ');
}
