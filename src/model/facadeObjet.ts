// La Facade et la facade objet (MD/spec-facade-calage-audit.md §3.2 a §3.4, lot F5) : ce qu'un releve garde une fois la facade
// validee (V4), relu et ecrit sans rien perdre ni inventer.
//
// - A la lecture d'un fichier (model/normalisation.ts), les champs de la Facade (`dimensions`, `forme`, `surface`, `textureCalee`)
//   et ceux d'une ouverture (`id`, `verifieeLe`, `details.carreaux`) sont verifies : un champ mal forme (un fichier ecrit a la main,
//   une version future) est retire plutot que garde a moitie compris, un mot inconnu aussi (vocabulaire ferme, comme
//   silhouetteFacade.ts). Un releve qui n'en porte aucun est rendu tel quel : un fichier ancien se relit a l'identique.
// - A l'ecriture d'un releve neuf sur un mur qui en a un (un rejeu de l'audit, coche ou pose d'office), le travail de la personne
//   reste : une ouverture qu'elle a posee, corrigee ou verifiee est gardee telle quelle et appariee aux nouvelles detections par
//   recouvrement (plus de moitie, comme le banc) ; les autres sont remplacees. Ce qui la garde se lit dans model/protections.ts.
//
// Pur : rien d'ecrit hors de ce qu'on rend.

import { NIVEAU, ouvertureGardee, peutEcrire, type BatimentProtege } from './protections.js';
import type { BoutVu, SilhouetteFacade } from './silhouetteFacade.js';
import type { CarreauxOuverture, CorpsDeFacade, DimensionsFacade, FormeFacade, GrilleCarreaux, OuvertureFacade, ParementFacade, PointeLue, ReleveFacade, SurfaceFacade, TextureCalee } from './typesReleve.js';

const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positif = (v: unknown): v is number => fini(v) && v > 0;
const objet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const parmi = <T extends string>(v: unknown, liste: readonly T[]): v is T => typeof v === 'string' && (liste as readonly string[]).includes(v);
const point = (v: unknown): v is { x: number; y: number } => objet(v) && fini(v.x) && fini(v.y);

const SILHOUETTES: readonly SilhouetteFacade[] = ['triangle', 'trapeze', 'rampe', 'ligne-droite', 'marches', 'plusieurs-sommets'];
const BOUTS: readonly BoutVu[] = ['pignon', 'croupe', 'demi-croupe', 'brisis', 'sans-objet'];
const PAREMENTS: readonly ParementFacade[] = ['enduit', 'pierre', 'brique', 'colombage', 'bardage-bois', 'bardage-metal', 'beton'];

/** Une grille de carreaux bien formee : deux entiers de 1 a 12. */
function grilleValide(v: unknown): GrilleCarreaux | null {
  const n = (x: unknown): x is number => fini(x) && Number.isInteger(x) && x >= 1 && x <= 12;
  return objet(v) && n(v.colonnes) && n(v.rangees) ? { colonnes: v.colonnes, rangees: v.rangees } : null;
}

/** La division du vitrage, recopiee sans ses mots inconnus ; null s'il ne reste rien d'elle ou si sa source manque. */
export function carreauxValides(v: unknown): CarreauxOuverture | null {
  if (!objet(v) || !parmi(v.source, ['ia', 'doigt'] as const)) return null;
  const c: CarreauxOuverture = { source: v.source };
  if (v.vantaux === 1 || v.vantaux === 2 || v.vantaux === 3) c.vantaux = v.vantaux;
  const g = grilleValide(v.grille);
  if (g) c.grille = g;
  if (parmi(v.petitsBois, ['aucun', 'fins', 'epais'] as const)) c.petitsBois = v.petitsBois;
  if (objet(v.imposte) && positif(v.imposte.hauteurM)) {
    const gi = grilleValide(v.imposte.grille);
    c.imposte = { hauteurM: v.imposte.hauteurM, ...(gi ? { grille: gi } : {}) };
  }
  if (parmi(v.vitrage, ['clair', 'depoli', 'teinte', 'vitrail'] as const)) c.vitrage = v.vitrage;
  return Object.keys(c).length > 1 ? c : null;
}

/** Les dimensions d'une facade bien formees ; null sinon. */
export function dimensionsValides(v: unknown): DimensionsFacade | null {
  if (!objet(v) || !positif(v.largeurM) || !positif(v.egoutM) || !parmi(v.source, ['cadastre', 'lidar', 'ign', 'saisie'] as const)) return null;
  const d: DimensionsFacade = { largeurM: v.largeurM, egoutM: v.egoutM, source: v.source };
  if (positif(v.faitageM)) d.faitageM = v.faitageM;
  if (objet(v.ecartPhoto)) {
    const e: NonNullable<DimensionsFacade['ecartPhoto']> = {};
    if (fini(v.ecartPhoto.largeur) && v.ecartPhoto.largeur >= 0) e.largeur = v.ecartPhoto.largeur;
    if (fini(v.ecartPhoto.egout) && v.ecartPhoto.egout >= 0) e.egout = v.ecartPhoto.egout;
    if (Object.keys(e).length) d.ecartPhoto = e;
  }
  return d;
}

/** La forme d'une facade bien formee (un gabarit d'au moins deux points) ; null sinon. Ses parts illisibles sont retirees. */
export function formeValide(v: unknown): FormeFacade | null {
  if (!objet(v) || !Array.isArray(v.gabarit) || v.gabarit.length < 2 || !parmi(v.source, ['plan', 'photo', 'ia', 'doigt'] as const)) return null;
  if (!v.gabarit.every((p) => objet(p) && fini(p.u) && fini(p.v))) return null;
  const f: FormeFacade = { gabarit: (v.gabarit as { u: number; v: number }[]).map((p) => ({ u: p.u, v: p.v })), source: v.source };
  if (parmi(v.silhouetteLue, SILHOUETTES)) f.silhouetteLue = v.silhouetteLue;
  if (parmi(v.bout, BOUTS)) f.bout = v.bout;
  if (Array.isArray(v.pointes)) {
    const p = v.pointes.filter((x): x is PointeLue => objet(x) && fini(x.u) && fini(x.v) && parmi(x.source, ['ia', 'deterministe', 'doigt'] as const)).map((x) => ({ u: x.u, v: x.v, source: x.source }));
    if (p.length) f.pointes = p;
  }
  if (Array.isArray(v.corps)) {
    const c = v.corps.filter((x): x is CorpsDeFacade => objet(x) && objet(x.mur) && point(x.mur.gauche) && point(x.mur.droite) && fini(x.u0) && fini(x.u1) && x.u1 > x.u0)
      .map((x) => ({ mur: { gauche: { x: x.mur.gauche.x, y: x.mur.gauche.y }, droite: { x: x.mur.droite.x, y: x.mur.droite.y } }, u0: x.u0, u1: x.u1 }));
    if (c.length) f.corps = c;
  }
  return f;
}

/** Le parement d'une facade bien forme ; null sinon. */
export function surfaceValide(v: unknown): SurfaceFacade | null {
  if (!objet(v) || !parmi(v.principale, [...PAREMENTS, 'mixte'] as const) || !parmi(v.source, ['ia', 'doigt', 'audit'] as const)) return null;
  const s: SurfaceFacade = { principale: v.principale, source: v.source };
  if (Array.isArray(v.zones)) {
    const z = v.zones.filter((x): x is NonNullable<SurfaceFacade['zones']>[number] => objet(x) && parmi(x.type, PAREMENTS) && fini(x.u0) && fini(x.u1) && fini(x.v0) && fini(x.v1) && fini(x.confiance))
      .map((x) => ({ type: x.type, u0: x.u0, u1: x.u1, v0: x.v0, v1: x.v1, confiance: x.confiance }));
    if (z.length) s.zones = z;
  }
  return s;
}

/** La pose de la texture bien formee ; null sinon. */
export function textureCaleeValide(v: unknown): TextureCalee | null {
  if (!objet(v) || !positif(v.pxParM) || !objet(v.cadre)) return null;
  const c = v.cadre;
  if (!fini(c.x0) || !fini(c.y0) || !fini(c.x1) || !fini(c.y1) || !(c.x1 > c.x0) || !(c.y1 > c.y0)) return null;
  return { pxParM: v.pxParM, cadre: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }, ...(v.sansOmbres === true ? { sansOmbres: true } : {}) };
}

/** Une ouverture relue : son identifiant, sa date de verification et ses carreaux verifies ; tout le reste tel quel. */
function ouvertureLue(ov: OuvertureFacade): OuvertureFacade {
  const brut = ov as unknown as Record<string, unknown>;
  const details = brut.details as Record<string, unknown> | undefined;
  if (!('id' in brut) && !('verifieeLe' in brut) && !(details && 'carreaux' in details)) return ov;
  const o = { ...ov };
  if ('id' in brut && !(typeof brut.id === 'string' && brut.id)) delete o.id;
  if ('verifieeLe' in brut && !(typeof brut.verifieeLe === 'string' && brut.verifieeLe)) delete o.verifieeLe;
  if (details && 'carreaux' in details) {
    const c = carreauxValides(details.carreaux);
    const d = { ...ov.details };
    if (c) d.carreaux = c; else delete d.carreaux;
    o.details = d;
  }
  return o;
}

const VALIDATEURS = { dimensions: dimensionsValides, forme: formeValide, surface: surfaceValide, textureCalee: textureCaleeValide } as const;

/**
 * Un releve relu d'un fichier : les champs de la Facade et de la facade objet verifies, retires s'ils sont mal formes. Un releve qui
 * n'en porte aucun est rendu tel quel, le meme objet : un fichier ancien se relit a l'identique.
 */
export function facadeLue(r: ReleveFacade): ReleveFacade {
  const brut = r as unknown as Record<string, unknown>;
  const champs = (Object.keys(VALIDATEURS) as (keyof typeof VALIDATEURS)[]).filter((k) => k in brut);
  const ouvertures = Array.isArray(r.ouvertures) ? r.ouvertures.map(ouvertureLue) : r.ouvertures;
  const relues = Array.isArray(r.ouvertures) && ouvertures.some((o, i) => o !== r.ouvertures[i]);
  if (!champs.length && !relues) return r;
  const out: Record<string, unknown> = { ...r, ...(relues ? { ouvertures } : {}) };
  for (const k of champs) {
    const v = VALIDATEURS[k](brut[k]);
    if (v) out[k] = v; else delete out[k];
  }
  return out as unknown as ReleveFacade;
}

/** Le recouvrement de deux ouvertures (intersection sur union), de 0 a 1. */
export function recouvrement(a: Pick<OuvertureFacade, 'x' | 'y' | 'l' | 'h'>, b: Pick<OuvertureFacade, 'x' | 'y' | 'l' | 'h'>): number {
  const ix = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix <= 0 || iy <= 0) return 0;
  const inter = ix * iy;
  return inter / (a.l * a.h + b.l * b.h - inter);
}

/** Deux ouvertures sont la meme quand elles se recouvrent de plus de moitie (le critere du banc des facades). */
export const RECOUVREMENT_MEME_OUVERTURE = 0.5;

const enOrdre = (a: OuvertureFacade, b: OuvertureFacade): number => a.x - b.x || a.y - b.y;

/**
 * Les ouvertures d'un releve reecrit sur un mur : celles que la personne a posees, corrigees ou verifiees (`ouvertureGardee`) restent
 * telles quelles, a leur place ; une nouvelle detection qui en recouvre une de plus de moitie est la meme ouverture, elle n'entre
 * pas ; les autres nouvelles entrent. De gauche a droite, puis de bas en haut.
 */
export function fusionnerOuvertures(anciennes: readonly OuvertureFacade[], nouvelles: readonly OuvertureFacade[]): OuvertureFacade[] {
  const gardees = anciennes.filter(ouvertureGardee);
  if (!gardees.length) return [...nouvelles];
  const entrent = nouvelles.filter((n) => !gardees.some((g) => recouvrement(g, n) > RECOUVREMENT_MEME_OUVERTURE));
  return [...gardees, ...entrent].sort(enOrdre);
}

/**
 * Chaque ouverture recoit son identifiant : elle garde le sien ; une ouverture qui recouvre de plus de moitie une ouverture d'avant
 * (un rejeu) prend le sien, s'il est libre ; les autres en recoivent un neuf (`o1`, `o2`…, apres le plus grand deja pris).
 */
export function numeroterOuvertures(ouvertures: readonly OuvertureFacade[], avant: readonly OuvertureFacade[] = []): OuvertureFacade[] {
  const pris = new Set(ouvertures.map((o) => o.id).filter((x): x is string => !!x));
  const rang = (id: string) => { const m = /^o(\d+)$/.exec(id); return m ? Number(m[1]) : 0; };
  let suivant = Math.max(0, ...[...pris, ...avant.map((o) => o.id ?? '')].map(rang)) + 1;
  return ouvertures.map((o) => {
    if (o.id) return o;
    const meme = avant.find((a) => a.id && !pris.has(a.id) && recouvrement(a, o) > RECOUVREMENT_MEME_OUVERTURE);
    const id = meme?.id ?? 'o' + suivant++;
    pris.add(id);
    return { ...o, id };
  });
}

/**
 * Le releve a ecrire sur le mur `r.cote` d'un batiment qui en a peut-etre deja un (un rejeu de l'audit) : les ouvertures gardees de
 * l'ancien y restent (`fusionnerOuvertures`) ; ses dimensions, sa forme et son parement, valides par la personne, restent tant que
 * le neuf n'en apporte pas (un releve mesure n'en porte pas : seule la validation V4 les ecrit) et qu'un ecrivain de l'audit ne peut
 * pas les ecrire (model/protections.ts). La pose de la texture et le parement lu sur la photo, eux, partent avec la texture qu'ils
 * decrivaient : le releve neuf apporte la sienne. L'ecart que la photo constatait part aussi : il disait l'ancienne photo.
 */
export function releveReecrit(o: BatimentProtege, existant: ReleveFacade | undefined, r: ReleveFacade): ReleveFacade {
  if (!existant) return r;
  const ouvertures = fusionnerOuvertures(existant.ouvertures, r.ouvertures);
  const out: ReleveFacade = ouvertures.length === r.ouvertures.length && ouvertures.every((x, i) => x === r.ouvertures[i]) ? r : { ...r, ouvertures };
  const ctx = { cote: r.cote };
  const garde = (groupe: 'facadeDimensions' | 'facadeForme') => !peutEcrire(o, groupe, NIVEAU.surPlace, ctx);
  if (!r.dimensions && existant.dimensions && garde('facadeDimensions')) {
    const d = { ...existant.dimensions };
    delete d.ecartPhoto;
    out.dimensions = d;
  }
  if (!r.forme && existant.forme && garde('facadeForme')) out.forme = existant.forme;
  return out;
}

/** La place d'une lucarne du toit vue sur un mur (facade/regles/toits/elementsDesMurs.ts::lucarnesDevantLeMur), en metres du releve. */
export interface LucarneSurLeMur { de: number; a: number; dessusM: number }

/**
 * Les ouvertures d'une facade objet sans celles qui sont la fenetre d'une lucarne du toit : le milieu entre ses bords, l'appui au-dessus
 * de l'egout du pan (lot F7). Un element n'a qu'un endroit ou atterrir (MD/spec-facade-calage-audit.md §5 quater) : une lucarne est
 * dans le toit, jamais aussi une baie du mur ; la validation de la facade (V4) et la pose d'une lucarne par l'audit passent ici.
 */
export function ouverturesHorsDesLucarnes(ouvertures: readonly OuvertureFacade[], lucarnes: readonly LucarneSurLeMur[]): OuvertureFacade[] {
  if (!lucarnes.length) return [...ouvertures];
  return ouvertures.filter((o) => { const m = o.x + o.l / 2; return !lucarnes.some((l) => m >= l.de && m <= l.a && o.y >= l.dessusM); });
}
