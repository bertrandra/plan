// Les champs etendus d'un corps de toit (MD/spec-regles-toits.md §4) : profil, bouts, lucarnes, bords.
//
// Ils sont facultatifs, et un corps sans eux garde exactement son sens d'avant : un fichier ancien se
// relit a l'identique. A la lecture, un champ mal forme (un fichier ecrit a la main, une version
// future) est retire plutot que garde a moitie compris : la 3D et les regles ne liront jamais un
// profil brise sans largeur. A l'ecriture, ce qui dit la meme chose que l'absence ne s'ecrit pas
// (deux pentes droites, des bouts egaux a ceux que donnent les croupes, une liste vide), comme les
// pignons et les cheminees (io/serialisation.ts).

import { boutsDuCorps } from './formeToit.js';
import type { BordsToit, BoutToit, Lucarne, ProfilPan, SpecialeToit, TypeLucarne } from './types.js';

const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positif = (v: unknown): v is number => fini(v) && v > 0;
const positifOuNul = (v: unknown): v is number => fini(v) && v >= 0;
const objet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Un profil de pan bien forme, recopie sans ses cles inconnues ; null sinon. */
export function profilPanValide(v: unknown): ProfilPan | null {
  if (!objet(v)) return null;
  if (v.type === 'droit') return { type: 'droit' };
  if (v.type === 'brise' && positif(v.largeurBrisisM) && positif(v.hauteurBrisM)) return { type: 'brise', largeurBrisisM: v.largeurBrisisM, hauteurBrisM: v.hauteurBrisM };
  if (v.type === 'coyau' && positif(v.largeurM) && positif(v.penteDeg) && v.penteDeg < 90) return { type: 'coyau', largeurM: v.largeurM, penteDeg: v.penteDeg };
  if (v.type === 'courbe' && positif(v.flecheM)) return { type: 'courbe', flecheM: v.flecheM };
  return null;
}

/** Un bout bien forme ; null sinon. Une croupe de profondeur nulle est un pignon, comme `croupes`. */
export function boutToitValide(v: unknown): BoutToit | null {
  if (!objet(v)) return null;
  if (v.type === 'pignon') return { type: 'pignon' };
  if (v.type === 'redents') return { type: 'redents' };
  if (v.type === 'croupe' && positifOuNul(v.profondeurM)) return { type: 'croupe', profondeurM: v.profondeurM };
  if (v.type === 'demi-croupe' && positif(v.profondeurM) && positif(v.hauteurPignonM)) return { type: 'demi-croupe', profondeurM: v.profondeurM, hauteurPignonM: v.hauteurPignonM };
  if (v.type === 'brisis' && positif(v.largeurM)) return { type: 'brisis', largeurM: v.largeurM };
  return null;
}

/** Les types de lucarne connus (spec §2.3). */
export const TYPES_LUCARNE: readonly TypeLucarne[] = ['jacobine', 'capucine', 'chien-assis', 'rampante', 'meuniere', 'oeil-de-boeuf', 'outeau', 'lanterneau', 'inconnue'];

/** Une lucarne bien formee ; null sinon. */
export function lucarneValide(v: unknown): Lucarne | null {
  if (!objet(v)) return null;
  if (!TYPES_LUCARNE.includes(v.type as TypeLucarne) || (v.pan !== 0 && v.pan !== 1)) return null;
  if (!positifOuNul(v.debutM) || !fini(v.finM) || !(v.finM > v.debutM) || !positif(v.faitageM) || !positif(v.profondeurM)) return null;
  if (v.source !== 'lidar' && v.source !== 'observation') return null;
  return { type: v.type as TypeLucarne, pan: v.pan, debutM: v.debutM, finM: v.finM, faitageM: v.faitageM, profondeurM: v.profondeurM, source: v.source };
}

/** Le nombre de faces d'une pyramide : un entier de 3 a 16. */
const cotesValides = (v: unknown): v is number => fini(v) && Number.isInteger(v) && v >= 3 && v <= 16;

/** Un toit de revolution bien forme ; null sinon. */
export function specialeValide(v: unknown): SpecialeToit | null {
  if (!objet(v)) return null;
  if (v.type === 'conique' || v.type === 'dome' || v.type === 'imperiale') return { type: v.type };
  if ((v.type === 'polygonal' || v.type === 'fleche') && cotesValides(v.cotes)) return { type: v.type, cotes: v.cotes };
  return null;
}

/** Les bords bien formes, sans les cles mal formees ; null s'il n'en reste rien. */
export function bordsValides(v: unknown): BordsToit | null {
  if (!objet(v)) return null;
  const out: BordsToit = {};
  if (positifOuNul(v.debordEgoutM)) out.debordEgoutM = v.debordEgoutM;
  if (positifOuNul(v.saillieRiveM)) out.saillieRiveM = v.saillieRiveM;
  if (typeof v.coyau === 'boolean') out.coyau = v.coyau;
  if (typeof v.queueDeVache === 'boolean') out.queueDeVache = v.queueDeVache;
  return Object.keys(out).length ? out : null;
}

/** Une paire bien formee (deux elements valides), ou null. */
function paire<T>(v: unknown, valide: (x: unknown) => T | null): [T, T] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const a = valide(v[0]), b = valide(v[1]);
  return a && b ? [a, b] : null;
}

/**
 * Relit les champs etendus d'un corps (une copie deja faite par la normalisation) : chacun est
 * verifie, recopie sans cle inconnue, ou retire s'il est mal forme. Les lucarnes mal formees sont
 * retirees une a une. Un corps sans ces champs n'est pas touche.
 */
export function lireChampsEtendus(c: Record<string, unknown>): void {
  if ('profil' in c) { const p = paire(c.profil, profilPanValide); if (p) c.profil = p; else delete c.profil; }
  if ('bouts' in c) { const b = paire(c.bouts, boutToitValide); if (b) c.bouts = b; else delete c.bouts; }
  if ('lucarnes' in c) {
    const l = Array.isArray(c.lucarnes) ? c.lucarnes.map(lucarneValide).filter((x): x is Lucarne => !!x) : [];
    if (l.length) c.lucarnes = l; else delete c.lucarnes;
  }
  if ('bords' in c) { const b = bordsValides(c.bords); if (b) c.bords = b; else delete c.bords; }
  if ('ouvert' in c && typeof c.ouvert !== 'boolean') delete c.ouvert;
  if ('speciale' in c) { const x = specialeValide(c.speciale); if (x) c.speciale = x; else delete c.speciale; }
}

const memeBout = (a: BoutToit, b: BoutToit) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Retire d'un corps a ecrire (une copie) ce qui dit la meme chose que l'absence : deux pentes
 * droites, des bouts egaux a ceux que donnent ses croupes, une liste de lucarnes vide, des bords
 * sans rien. Le corps relu a donc le meme sens.
 */
export function compacterChampsEtendus(c: Record<string, unknown>): void {
  const profil = c.profil as ProfilPan[] | undefined;
  if (Array.isArray(profil) && profil.every((p) => p?.type === 'droit')) delete c.profil;
  const bouts = c.bouts as [BoutToit, BoutToit] | undefined;
  if (Array.isArray(bouts) && bouts.length === 2) {
    const deduits = boutsDuCorps(Array.isArray(c.croupes) ? { croupes: c.croupes as [number, number] } : {});
    if (memeBout(bouts[0], deduits[0]) && memeBout(bouts[1], deduits[1])) delete c.bouts;
  }
  if (Array.isArray(c.lucarnes) && !c.lucarnes.length) delete c.lucarnes;
  if (objet(c.bords) && Object.values(c.bords).every((x) => x === undefined)) delete c.bords;
}
