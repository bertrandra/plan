// Le catalogue du toit (palette, groupe « Toit ») : ce que la personne pose d'un geste sur un batiment.
//
// Trois familles, comme la palette les montre :
//   - `toit`   : la forme du toit, prise dans le catalogue que la 3D sait dessiner (facade/catalogueToits.ts) ;
//   - `sur`    : ce qui se pose sur le toit (lucarnes du catalogue, cheminee, pignon) ;
//   - `facade` : ce qui tient a un mur et touche au toit (appentis ouvert : galerie, porche ; ferme).
//
// Les images de la palette sont les vignettes de ce meme catalogue (`vueIsometrique`) : elles viennent du
// code de la 3D, pas d'un dessin a part. Une forme choisie est le corps de reference du catalogue, remis a
// l'echelle du batiment (son rectangle, son egout, la hauteur de son toit).
//
// Ce module ne sait ni dessiner ni interroger l'ecran : il ecrit dans l'objet, avec le vocabulaire du
// modele (`Toit`, `CorpsToit`, `Lucarne`, `Cheminee`, `PignonToit`), et dit quand un geste n'a pas de
// sens. Un geste est une decision de la personne : il fige le toit (`toitFige`), la lecture automatique
// ne le reprend plus tant qu'elle n'a pas ete rallumee (app/ecouteurs/toitCatalogue.ts).
//
// Pur : pas de reseau, pas de DOM, pas d'historique (l'appelant empile l'instantane avant d'ecrire).

import { enPoints } from '../model/formes.js';
import { estFormeToit } from '../model/formeToit.js';
import { EXEMPLES_TOITS, LARGEUR_M, LONGUEUR_M, corpsDeLExemple, type ExempleToit } from './catalogueToits.js';
import { angleDuPlusLongCote } from '../facade/toit.js';
import { boiteOrientee, point, repere, type Repere } from '../facade/toitCorps.js';
import { formeDuCorps } from '../facade/regles/toits/faits.js';
import { corpsNeuf, type GenreCorps } from '../facade/regles/toits/corpsNeufs.js';
import { DEFAUTS_SAILLIE, corpsDeSaillie, murDuCorps, murLibre } from '../facade/regles/toits/saillies.js';
import type { BoutToit, Cheminee, CorpsToit, ElementDeToit, FormeSaillie, GenreSaillie, Lucarne, ObjetPlan, PignonToit, ProfilPan, PtBrut, TypeLucarne } from '../model/types.js';

export type FamillePiece = 'corps' | 'toit' | 'sur' | 'facade';

export interface PieceCatalogue {
  /** Stable : `famille:nom`. C'est la valeur que la palette passe a la commande. */
  id: string;
  famille: FamillePiece;
  libelle: string;
  /** L'exemple du catalogue (facade/catalogueToits.ts) dont la vignette est l'image de la piece ; absent : un glyphe. */
  exemple?: string;
  /** Pas proposee par la palette : un ancien identifiant que `appliquerPiece` comprend encore (les trois formes de bow-window d'avant). */
  cachee?: true;
}

/** Les tourelles ne se posent pas sur un batiment entier : le catalogue les garde, la palette non. */
const TOURELLES = new Set(['conique', 'polygonal', 'fleche', 'dome', 'imperiale']);

const formes = EXEMPLES_TOITS.filter((e) => e.famille === 'toit' && !TOURELLES.has(e.id));
const lucarnes = EXEMPLES_TOITS.filter((e) => e.famille === 'lucarne');

export const PIECES: readonly PieceCatalogue[] = [
  // Les corps (mode Plan) : leur vignette est la forme de toit qu'ils prennent a la pose.
  { id: 'corps:aile', famille: 'corps', libelle: 'Aile', exemple: 'appentis' },
  { id: 'corps:retour', famille: 'corps', libelle: 'Retour', exemple: 'deux-pans' },
  { id: 'corps:biaise', famille: 'corps', libelle: 'Biaise', exemple: 'croupes' },
  ...formes.map((e) => ({ id: 'forme:' + e.id, famille: 'toit' as const, libelle: e.titre, exemple: e.id })),
  { id: 'sur:pignon', famille: 'sur', libelle: 'Pignon' },
  { id: 'sur:cheminee', famille: 'sur', libelle: 'Cheminée' },
  { id: 'sur:fenetre-toit', famille: 'sur', libelle: 'Fenêtre de toit' },
  { id: 'sur:solaire', famille: 'sur', libelle: 'Solaire' },
  ...lucarnes.map((e) => ({ id: 'sur:' + e.id, famille: 'sur' as const, libelle: e.titre.replace(/^Lucarne /, ''), exemple: e.id })),
  { id: 'facade:bow-window', famille: 'facade', libelle: 'Bow-window' },
  { id: 'facade:bow-rectangle', famille: 'facade', libelle: 'Bow-window', cachee: true },
  { id: 'facade:bow-arc', famille: 'facade', libelle: 'Bow en arc', cachee: true },
  { id: 'facade:bow-conge', famille: 'facade', libelle: 'Bow arrondi', cachee: true },
  { id: 'facade:galerie', famille: 'facade', libelle: 'Galerie' },
  { id: 'facade:appentis-ferme', famille: 'facade', libelle: 'Appentis fermé' }
];

export const piece = (id: string): PieceCatalogue | undefined => PIECES.find((p) => p.id === id);
export const piecesDe = (famille: FamillePiece): PieceCatalogue[] => PIECES.filter((p) => p.famille === famille && !p.cachee);

const dixieme = (v: number) => Math.round(v * 10) / 10;
const aire = (c: CorpsToit): number => { const r = repere(c.pts); return r.L * r.W; };

/** Le corps qui porte ce que l'on pose : le plus grand, sans compter ce qui est pose sur une facade. */
export const corpsPrincipal = (o: ObjetPlan): CorpsToit | null => {
  const l = (o.corpsToit ?? []).filter((c) => !c.saillie);
  return l.length ? l.reduce((a, b) => (aire(b) > aire(a) ? b : a)) : null;
};

/** Le rectangle du batiment, la longueur selon le faitage (le grand cote) : celui sur lequel se pose le toit. */
function rectangleDuBatiment(o: ObjetPlan): PtBrut[] | null {
  const pts = enPoints(o).pts as PtBrut[] | undefined;
  if (!pts || pts.length < 3) return null;
  const rect = boiteOrientee(pts);
  const r = repere(rect);
  return r.L < r.W ? [rect[1] as PtBrut, rect[2] as PtBrut, rect[3] as PtBrut, rect[0] as PtBrut] : rect;
}

/** L'egout du batiment, et ce qu'il monte jusqu'au faitage : la hauteur que le catalogue remet a l'echelle. */
function hauteursDuBatiment(o: ObjetPlan): { egout: number; montee: number } {
  const c = corpsPrincipal(o);
  const egout = c ? Math.min(...c.egouts) : (o.elevation ?? 3);
  const montee = c ? Math.max(1, c.faitage - egout) : (o.toit?.hauteur ?? 2.5);
  return { egout, montee };
}

/**
 * Le corps de reference d'un exemple du catalogue, remis a l'echelle du batiment : son emprise (longueur
 * et largeur), son egout et la montee de son toit. Les distances le long du faitage suivent la longueur, celles
 * en travers la largeur, les hauteurs la montee. Plusieurs corps (un toit en M, un shed) se repartissent
 * sur le rectangle comme dans l'exemple.
 */
export function corpsDepuisExemple(e: ExempleToit, rect: readonly PtBrut[], egout: number, montee: number): CorpsToit[] {
  const r: Repere = repere(rect);
  const modeles = corpsDeLExemple(e);
  const L0 = Math.max(LONGUEUR_M, ...e.corps.map((c) => c.l ?? LONGUEUR_M));
  const W0 = Math.max(LARGEUR_M, ...e.corps.map((c) => (c.t0 ?? 0) + (c.w ?? LARGEUR_M)));
  const kL = r.L / L0, kW = r.W / W0;
  return modeles.map((m, i) => {
    const item = e.corps[i] as NonNullable<ExempleToit['corps'][number]>;
    const t0 = item.t0 ?? 0, w = item.w ?? LARGEUR_M, l = item.l ?? LONGUEUR_M;
    const bas = Math.min(...m.egouts);
    const kH = montee / Math.max(0.5, Math.abs(m.faitage - bas) || 4);
    const haut = (z: number) => dixieme(egout + (z - bas) * kH);
    const pts = [[0, t0], [l, t0], [l, t0 + w], [0, t0 + w]].map(([s, t]) => point(r, (s as number) * kL, (t as number) * kW));
    const profil = m.profil?.map((p): ProfilPan => (p.type === 'brise' ? { ...p, largeurBrisisM: dixieme(p.largeurBrisisM * kW), hauteurBrisM: haut(p.hauteurBrisM) }
      : p.type === 'coyau' ? { ...p, largeurM: dixieme(p.largeurM * kW) } : p.type === 'courbe' ? { ...p, flecheM: dixieme(p.flecheM * kW) } : p)) as CorpsToit['profil'];
    const bouts = m.bouts?.map((b): BoutToit => (b.type === 'croupe' ? { ...b, profondeurM: dixieme(b.profondeurM * kL) }
      : b.type === 'demi-croupe' ? { ...b, profondeurM: dixieme(b.profondeurM * kL), hauteurPignonM: dixieme(b.hauteurPignonM * kH) }
        : b.type === 'brisis' ? { ...b, largeurM: dixieme(b.largeurM * kL) } : b)) as CorpsToit['bouts'];
    const luc = m.lucarnes?.map((x): Lucarne => ({ ...x, debutM: dixieme(x.debutM * kL), finM: dixieme(x.finM * kL), faitageM: haut(x.faitageM), profondeurM: dixieme(x.profondeurM * kW) }));
    const neuf: CorpsToit = {
      ...m, pts,
      posFaitage: dixieme(m.posFaitage * kW),
      faitage: haut(m.faitage),
      egouts: [haut(m.egouts[0]), haut(m.egouts[1])],
      ...(m.croupes ? { croupes: [dixieme(m.croupes[0] * kL), dixieme(m.croupes[1] * kL)] as [number, number] } : {}),
      ...(profil ? { profil } : {}), ...(bouts ? { bouts } : {}), ...(luc ? { lucarnes: luc } : {})
    };
    return neuf;
  });
}

/**
 * Un corps tire du toit simple d'un batiment : le rectangle qui englobe le contour, la longueur selon le
 * faitage. C'est ce qui permet de poser une cheminee ou une lucarne sur un batiment lu seulement sur la
 * BD TOPO (un toit, pas de corps) : le catalogue n'oblige pas a passer d'abord par la lecture LiDAR.
 */
export function corpsDepuisToitSimple(o: ObjetPlan): CorpsToit | null {
  const rect = rectangleDuBatiment(o);
  if (!rect) return null;
  const r = repere(rect);
  const egout = o.elevation ?? 3;
  const haut = o.toit?.hauteur ?? 2.5;
  const forme = o.toit?.forme ?? 'deux-pans';
  const plat = forme === 'plat';
  return { pts: rect, posFaitage: forme === 'appentis' ? 0 : r.W / 2, faitage: plat ? egout : dixieme(egout + haut), egouts: [egout, egout], pignons: [], ecart: 0 };
}

/** Le contour est-il a peu pres son rectangle englobant ? Sinon un corps unique ne le decrit pas (une maison en L, en U). */
function contourRectangulaire(o: ObjetPlan): boolean {
  const pts = enPoints(o).pts as PtBrut[] | undefined;
  const rect = pts && pts.length >= 3 ? boiteOrientee(pts) : null;
  if (!pts || !rect) return false;
  const aire = (l: readonly PtBrut[]) => Math.abs(l.reduce((t, q, i) => { const r = l[(i + 1) % l.length] as PtBrut; return t + q.x * r.y - r.x * q.y; }, 0)) / 2;
  return aire(pts) >= 0.9 * aire(rect);
}

/** Le corps sur lequel poser, cree depuis le toit simple s'il n'y en a pas encore. Null : pas de contour, ou un contour que le rectangle decrit mal. */
function corpsPourPoser(o: ObjetPlan): CorpsToit | null {
  const deja = corpsPrincipal(o);
  if (deja) return deja;
  if (!contourRectangulaire(o)) return null;
  const c = corpsDepuisToitSimple(o);
  if (!c) return null;
  o.corpsToit = [c];
  return c;
}

/** Pourquoi ce geste n'a pas de sens ici ; null quand il en a. */
export function raisonIndisponible(o: ObjetPlan, id: string): string | null {
  const p = piece(id);
  if (!p) return 'Geste inconnu.';
  if (!rectangleDuBatiment(o)) return 'Ce bâtiment n’a pas de contour.';
  if (p.famille === 'toit') return null;
  if (p.famille === 'corps') {
    const h = corpsPrincipal(o);
    if (!h && !contourRectangulaire(o)) return 'Choisissez d’abord la forme du toit : un corps se pose contre un autre.';
    if (h && !corpsNeuf(h, id.split(':')[1] as GenreCorps, o.corpsToit ?? [])) return 'Pas de place contre ce corps.';
    return null;
  }
  // Un contour en L ou en U n'est pas un seul corps : on ne le remplace pas en silence par son rectangle englobant.
  if (!corpsPrincipal(o) && !contourRectangulaire(o)) return 'Le toit de ce bâtiment n’est pas encore découpé en corps : choisissez d’abord sa forme.';
  if (id === 'sur:pignon') {
    const c = corpsPrincipal(o) ?? corpsDepuisToitSimple(o);
    return c && formeDuCorps(c) === 'appentis' ? 'Un appentis n’a pas de pignon sur son long pan.' : null;
  }
  if (p.famille === 'sur') return null;
  // Facade : un element se pose sur un mur du corps principal ; ce corps se deduit du toit simple au besoin.
  return null;
}

const toitDe = (o: ObjetPlan) => {
  if (!o.toit) o.toit = { forme: 'deux-pans', hauteur: 2.5, angleFaitage: angleDuPlusLongCote(enPoints(o).pts as PtBrut[]), source: 'saisie' };
  return o.toit;
};

function lucarneSur(c: CorpsToit, type: TypeLucarne): Lucarne {
  const r = repere(c.pts);
  const deja = (c.lucarnes ?? []).filter((l) => l.pan === 0).length;
  const centre = (r.L * (deja + 1)) / (deja + 2);
  const demi = type === 'chien-assis' ? 0.75 : type === 'oeil-de-boeuf' ? 0.4 : 0.7;
  const egout = c.egouts[0];
  return {
    type, pan: 0, debutM: dixieme(centre - demi), finM: dixieme(centre + demi),
    faitageM: dixieme(Math.min(c.faitage - 0.2, egout + (c.faitage - egout) * 0.5 + 1)), profondeurM: 1.2, source: 'observation'
  };
}

function chemineeSur(c: CorpsToit): Cheminee {
  const r = repere(c.pts);
  const n = c.cheminees?.length ?? 0;
  const p = point(r, r.L * Math.max(0.1, 0.7 - 0.25 * n), c.posFaitage);
  return { x: dixieme(p.x), y: dixieme(p.y), largeurM: 0.7, profondeurM: 0.7, sommetM: dixieme(c.faitage + 0.8), position: 'faitage', source: 'observation' };
}

/** Une fenetre de toit ou un panneau solaire, au milieu du pan 0 ; le suivant se range a cote du precedent. */
function elementSur(c: CorpsToit, type: 'fenetre-toit' | 'solaire'): ElementDeToit {
  const r = repere(c.pts);
  const deja = (c.elementsToit ?? []).filter((e) => e.pan === 0).length;
  return { type, pan: 0, sM: dixieme((r.L * (deja + 1)) / (deja + 2)), dM: dixieme(Math.max(c.posFaitage, 0.5) / 2) };
}

function pignonSur(c: CorpsToit): PignonToit {
  const r = repere(c.pts);
  const largeur = Math.min(3.2, r.L / 2);
  const sur = c.pignons.some((p) => p.pan === 0 && p.debut < largeur * 0.9);
  const debut = sur ? r.L - largeur : 0;
  return { pan: 0, debut: dixieme(debut), fin: dixieme(debut + largeur), faitage: c.faitage, profondeur: dixieme(Math.max(c.posFaitage, r.W - c.posFaitage)) };
}

/**
 * Ecrit le geste dans le batiment : rend vrai s'il a change quelque chose. Le toit est fige ensuite :
 * c'est la personne qui le regle.
 */
export function appliquerPiece(o: ObjetPlan, id: string): boolean {
  if (raisonIndisponible(o, id)) return false;
  const [prefixe = '', nom = ''] = id.split(':');
  if (prefixe === 'forme') {
    const rect = rectangleDuBatiment(o), e = EXEMPLES_TOITS.find((x) => x.id === nom);
    if (!rect || !e) return false;
    const { egout, montee } = hauteursDuBatiment(o);
    o.corpsToit = corpsDepuisExemple(e, rect, egout, montee);
    o.modeToit = 'corps';
    const toit = toitDe(o);
    if (estFormeToit(nom)) toit.forme = nom;
    toit.source = 'saisie';
    delete toit.pente;
  } else if (prefixe === 'corps') {
    const hote = corpsPourPoser(o);
    const neuf = hote ? corpsNeuf(hote, nom as GenreCorps, o.corpsToit ?? []) : null;
    if (!hote || !neuf || !o.corpsToit) return false;
    o.corpsToit = [...o.corpsToit, neuf];
    o.modeToit = 'corps';
    toitDe(o).source = 'saisie';
  } else if (prefixe === 'sur') {
    const c = corpsPourPoser(o);
    if (!c) return false;
    if (nom === 'cheminee') c.cheminees = [...(c.cheminees ?? []), chemineeSur(c)];
    else if (nom === 'fenetre-toit' || nom === 'solaire') c.elementsToit = [...(c.elementsToit ?? []), elementSur(c, nom)];
    else if (nom === 'pignon') c.pignons = [...c.pignons, pignonSur(c)];
    else c.lucarnes = [...(c.lucarnes ?? []), lucarneSur(c, nom as TypeLucarne)];
    o.modeToit = 'corps';
    toitDe(o).source = 'saisie';
  } else {
    const hote = corpsPourPoser(o);
    if (!hote || !o.corpsToit) return false;
    const rang = o.corpsToit.indexOf(hote);
    const genre: GenreSaillie = nom.startsWith('bow-') ? 'bow-window' : nom === 'galerie' ? 'galerie' : 'appentis';
    const forme: FormeSaillie = nom === 'bow-arc' ? 'arc' : nom === 'bow-conge' ? 'conge' : nom === 'bow-rectangle' ? 'rectangle' : genre === 'bow-window' ? 'pans' : 'rectangle';
    const d = DEFAUTS_SAILLIE[genre];
    const mur = murLibre(o.corpsToit, rang);
    const { L } = murDuCorps(hote, mur);
    const largeurM = Math.min(d.largeurM, Math.max(0.6, L - 0.4));
    // Un bow-window arrondi saille davantage : son demi-cercle a besoin de profondeur pour se lire.
    const profondeurM = forme === 'arc' ? Math.min(largeurM / 2, 1.2) : d.profondeurM;
    o.corpsToit = [...o.corpsToit, corpsDeSaillie(hote, { genre, hote: rang, mur, centreM: L / 2, largeurM, profondeurM, forme, niveau: d.niveau, toit: d.toit })];
    o.modeToit = 'corps';
    toitDe(o).source = 'saisie';
  }
  o.toitFige = true;
  return true;
}

/**
 * Rallume la lecture automatique : le batiment redevient lisible par le LiDAR, les faits et les profils
 * (regles/). Ce que la personne avait regle est remplace a la prochaine lecture : l'appelant previent et
 * empile l'instantane avant.
 */
export function reprendreLectureAuto(o: ObjetPlan): void {
  delete o.toitFige;
  delete o.toitLidarLu;
  if (o.toit?.source === 'saisie') o.toit.source = 'bdtopo';
  delete o.corpsToit;
  delete o.volumesToit;
  delete o.toitMesure;
  delete o.modeToit;
}
