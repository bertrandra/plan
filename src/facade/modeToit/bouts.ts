// Les bouts d'un corps et la pointe d'un pignon au Mode Toit (MD/spec-mode-toit-3d.md, « Le cul de geai et la queue de vache » ;
// demande du proprietaire du 5 novembre 2026) : choisir pour chaque bout du faitage un pignon, une croupe ou un cul de geai (demi-croupe,
// nez de veau, bout rabattu, croupette), la pointe d'un pignon traversant en triangle ou en cul de geai, et la queue de vache (un coyau
// qui deborde) a l'egout d'un pan. Les memes boutons-images a choix exclusif que les autres reglages (elements.ts, `groupesDe`).
//
// Ce sont des decisions de la personne, jamais une regle du moteur : le toit est fige par l'appelant (`toitFige`). Pur : pas de DOM.

import { repere } from '../toits/toitCorps.js';
import { formeDuCorps } from '../regles/toits/faits.js';
import { boutsDuCorps } from '../../model/formeToit.js';
import { nomOrientation } from '../../geometry/cotesVusDeDehors.js';
import { corpsAvecBout, demiCroupeNeuve } from '../toits/culDeGeai.js';
import type { BoutToit, CorpsToit, DemiCroupe, PignonToit, ProfilPan } from '../../model/types.js';

/** Un groupe de choix : son nom technique, ce qu'il dit a l'ecran, et ses valeurs (elements.ts, `GroupeChoix`). */
export interface GroupeBout { groupe: string; titre: string; valeurs: { valeur: string; libelle: string }[] }

/** Le nom du cul de geai a l'ecran, et ses autres noms (decision du proprietaire, 5 novembre 2026), dits dans les infobulles. */
export const NOM_CUL_DE_GEAI = 'Cul de geai';
export const AUSSI_CUL_DE_GEAI = 'nez de veau, bout rabattu, croupette, demi-croupe';
export const NOM_QUEUE_DE_VACHE = 'Queue de vache (coyau)';
export const AUSSI_QUEUE_DE_VACHE = 'coyau, égout retroussé, chevron prolongé';

/** Les parts du pignon que coupe le petit pan, de la pointe vers le bas : le quart, le tiers, la moitie. */
export const PARTS_COUPE = [0.25, 0.33, 0.5] as const;
/** Les debords du faitage au-dela du mur proposes, en metres : 0, le cul de geai classique, le pied de la croupe sur le mur. */
export const DEBORDS_FAITAGE_M = [0, 0.5, 1] as const;
/** Les debords d'une queue de vache proposes, en metres (0 : pas de queue de vache, l'egout droit du corps). */
export const DEBORDS_QUEUE_DE_VACHE_M = [0, 0.6, 0.9, 1.2] as const;
/** Les pentes adoucies d'une queue de vache, en degres : sous la pente du pan, au moins de 3 degres. */
export const PENTES_COYAU_DEG = [10, 15, 20, 25] as const;
/** La part du pan que le coyau adoucit, depuis le mur : 0,8 m au plus, le tiers du pan au plus. */
const LARGEUR_COYAU_M = 0.8;

const centi = (v: number) => Math.round(v * 100) / 100;
const fr = (v: number) => String(v).replace('.', ',');
const proche = <T extends number>(l: readonly T[], v: number, tol: number): T | undefined => l.find((x) => Math.abs(x - v) <= tol);

/** Le nom d'un bout du faitage par son orientation (« Bout nord ») : sa normale sort du corps, vers -u au bout 0, +u au bout 1. */
export function nomDuBout(c: CorpsToit, i: 0 | 1): string {
  const r = repere(c.pts), n = i === 0 ? { x: -r.u.x, y: -r.u.y } : r.u;
  return 'Bout ' + nomOrientation((Math.atan2(n.x, n.y) * 180) / Math.PI).toLowerCase();
}

/** Le nom d'un pan par l'orientation de sa pente (« Pan sud »), comme elements.ts. */
function nomDuPan(c: CorpsToit, pan: 0 | 1): string {
  const r = repere(c.pts), n = pan === 0 ? { x: -r.v.x, y: -r.v.y } : r.v;
  return 'Pan ' + nomOrientation((Math.atan2(n.x, n.y) * 180) / Math.PI).toLowerCase();
}

/** Les pans du corps sont-ils droits (aucun profil, ou deux pentes droites) ? */
const pansDroits = (c: CorpsToit): boolean => !c.profil || c.profil.every((p) => p.type === 'droit');
/** Un pan porte-t-il un coyau ? */
const aCoyau = (c: CorpsToit): boolean => !!c.profil?.some((p) => p.type === 'coyau');

/** Un corps a deux pans, faitage dedans, pans droits ou en coyau : ce dont les bouts et les egouts se reglent ici. */
function deuxPansReglables(c: CorpsToit): boolean {
  if (c.saillie || c.speciale) return false;
  const W = repere(c.pts).W, f = formeDuCorps(c);
  return f !== 'plat' && f !== 'appentis' && c.posFaitage > 0.3 && c.posFaitage < W - 0.3 && c.faitage - Math.max(...c.egouts) > 0.5;
}

/** Les bouts se reglent sur des pans droits (le dessin d'un coyau ferme ses bouts par des pignons, facade/toits/toitSpeciaux.ts). */
export const boutsReglables = (c: CorpsToit): boolean => deuxPansReglables(c) && pansDroits(c);
/** La queue de vache se pose sur un corps a deux pans dont les bouts sont des pignons (meme raison, dans l'autre sens). */
export const queueDeVacheReglable = (c: CorpsToit): boolean => deuxPansReglables(c) && (pansDroits(c) || aCoyau(c)) && !c.profil?.some((p) => p.type === 'brise' || p.type === 'courbe') && boutsDuCorps(c).every((b) => b.type === 'pignon');

/** La part du pignon que la demi-croupe coupe (de la pointe), sur un pignon d'egout `e` et de faitage `F`. */
const partDe = (b: DemiCroupe, e: number, F: number): number => (F - Math.min(F, e + b.hauteurPignonM)) / Math.max(F - e, 1e-6);

/** La meme demi-croupe coupee a une autre part, la pente de la petite croupe gardee. */
function avecPart(b: DemiCroupe, e: number, F: number, part: number): DemiCroupe {
  const coupeAvant = Math.max(F - (e + b.hauteurPignonM), 0.05), g = coupeAvant / Math.max(b.profondeurM, 0.05), coupe = (F - e) * part;
  return { ...b, profondeurM: centi(Math.max(0.3, coupe / g)), hauteurPignonM: centi(Math.max(0.1, F - e - coupe)) };
}

/** La meme demi-croupe au faitage qui deborde de `d` metres (0 : pas de debord, le champ ne s'ecrit pas). */
function avecDebordFaitage(b: DemiCroupe, d: number): DemiCroupe {
  const { debordFaitageM: _ancien, ...reste } = b;
  void _ancien;
  return d > 0 ? { ...reste, debordFaitageM: d } : reste;
}

/** Les groupes qui reglent une demi-croupe : la part coupee et le debord du faitage, avec un suffixe (`0`, `1`, ou rien pour un pignon). */
function groupesDemiCroupe(quoi: string, suffixe: string): GroupeBout[] {
  return [
    { groupe: 'coupe' + suffixe, titre: quoi + ' : part du pignon coupée', valeurs: PARTS_COUPE.map((v) => ({ valeur: String(v), libelle: quoi + ' : le petit pan coupe ' + (v === 0.25 ? 'le quart' : v === 0.33 ? 'le tiers' : 'la moitié') + ' du pignon' })) },
    { groupe: 'debordFaitage' + suffixe, titre: quoi + ' : débord du faîtage', valeurs: DEBORDS_FAITAGE_M.map((v) => ({ valeur: String(v), libelle: v === 0 ? quoi + ' : faîtage au nu du mur' : quoi + ' : le faîtage déborde de ' + fr(v) + ' m et porte la croupe en avant' })) }
  ];
}

/** Les groupes d'un corps : chaque bout (pignon, croupe, cul de geai) et ses reglages, puis la queue de vache de chaque pan. */
export function groupesBoutsDuCorps(c: CorpsToit): GroupeBout[] {
  const l: GroupeBout[] = [];
  if (boutsReglables(c)) {
    const bouts = boutsDuCorps(c);
    ([0, 1] as const).forEach((i) => {
      const nom = nomDuBout(c, i);
      l.push({ groupe: 'bout' + i, titre: nom, valeurs: [
        { valeur: 'pignon', libelle: nom + ' : pignon' }, { valeur: 'croupe', libelle: nom + ' : croupe' },
        { valeur: 'demi-croupe', libelle: nom + ' : ' + NOM_CUL_DE_GEAI.toLowerCase() + ' (' + AUSSI_CUL_DE_GEAI + ')' }
      ] });
      if (bouts[i].type === 'demi-croupe') l.push(...groupesDemiCroupe(nom, String(i)));
    });
  }
  if (queueDeVacheReglable(c)) {
    ([0, 1] as const).forEach((n) => {
      const nom = nomDuPan(c, n), pr = c.profil?.[n];
      l.push({ groupe: 'qdv' + n, titre: nom + ' : ' + NOM_QUEUE_DE_VACHE.toLowerCase(), valeurs: DEBORDS_QUEUE_DE_VACHE_M.map((v) => ({ valeur: String(v), libelle: v === 0 ? nom + ' : égout droit, sans queue de vache' : nom + ' : ' + NOM_QUEUE_DE_VACHE.toLowerCase() + ' (' + AUSSI_QUEUE_DE_VACHE + '), débord de ' + fr(v) + ' m' })) });
      if (pr?.type === 'coyau') {
        const pente = penteDuPanDeg(c, n);
        const pentes = PENTES_COYAU_DEG.filter((v) => v <= pente - 3);
        if (pentes.length) l.push({ groupe: 'penteCoyau' + n, titre: nom + ' : pente adoucie', valeurs: pentes.map((v) => ({ valeur: String(v), libelle: nom + ' : pente adoucie à ' + v + '° au bas du pan' })) });
      }
    });
  }
  return l;
}

/** Les groupes d'un pignon traversant : sa pointe (triangle ou cul de geai), et les reglages du cul de geai. */
export function groupesPointe(c: CorpsToit, g: PignonToit): GroupeBout[] {
  if (g.faitage - c.egouts[g.pan] < 0.6) return [];
  const l: GroupeBout[] = [{ groupe: 'pointe', titre: 'Pointe du pignon', valeurs: [
    { valeur: 'triangle', libelle: 'Pointe en triangle' },
    { valeur: 'demi-croupe', libelle: 'Pointe en ' + NOM_CUL_DE_GEAI.toLowerCase() + ' (' + AUSSI_CUL_DE_GEAI + ')' }
  ] }];
  if (g.pointe) l.push(...groupesDemiCroupe('Pointe', ''));
  return l;
}

/** La pente d'un pan, en degres. */
function penteDuPanDeg(c: CorpsToit, n: 0 | 1): number {
  const W = repere(c.pts).W, largeur = n === 0 ? c.posFaitage : W - c.posFaitage;
  return (Math.atan2(c.faitage - c.egouts[n], Math.max(largeur, 0.01)) * 180) / Math.PI;
}

/** La valeur enfoncee d'un groupe de ce module, ou undefined si le groupe n'en est pas (null : aucune n'est enfoncee). */
export function valeurBout(c: CorpsToit, groupe: string, pignon: PignonToit | null): string | null | undefined {
  const m = /^(bout|coupe|debordFaitage|qdv|penteCoyau|pointe)([01]?)$/.exec(groupe);
  if (!m) return undefined;
  const [, quoi, k] = m;
  if (quoi === 'pointe') return pignon ? (pignon.pointe ? 'demi-croupe' : 'triangle') : null;
  if (quoi === 'qdv' || quoi === 'penteCoyau') {
    const pr = c.profil?.[Number(k) as 0 | 1];
    if (quoi === 'qdv') return pr?.type !== 'coyau' ? '0' : pr.debordM === undefined ? null : String(proche(DEBORDS_QUEUE_DE_VACHE_M, pr.debordM, 0.02) ?? '') || null;
    return pr?.type === 'coyau' ? String(proche(PENTES_COYAU_DEG, pr.penteDeg, 1) ?? '') || null : null;
  }
  // Un bout du corps, ou la pointe d'un pignon (groupes sans suffixe).
  const dc: BoutToit | undefined = k === '' ? pignon?.pointe : boutsDuCorps(c)[Number(k) as 0 | 1];
  if (quoi === 'bout') return dc?.type === 'pignon' || dc?.type === 'croupe' || dc?.type === 'demi-croupe' ? dc.type : null;
  if (!dc || dc.type !== 'demi-croupe') return null;
  if (quoi === 'debordFaitage') return String(proche(DEBORDS_FAITAGE_M, dc.debordFaitageM ?? 0, 0.02) ?? '') || null;
  const e = k === '' && pignon ? c.egouts[pignon.pan] : Math.max(...c.egouts), F = k === '' && pignon ? pignon.faitage : c.faitage;
  return String(proche(PARTS_COUPE, partDe(dc, e, F), 0.04) ?? '') || null;
}

/** Le corps avec ce bout : un pignon, une croupe a la pente des pans, ou un cul de geai (celui qu'il a deja, ou un neuf, regle). */
function avecBout(c: CorpsToit, i: 0 | 1, type: string, regler: (b: DemiCroupe) => DemiCroupe = (b) => b): CorpsToit {
  const r = repere(c.pts), avant = boutsDuCorps(c)[i];
  const emax = Math.max(...c.egouts), largeur = Math.min(c.posFaitage, r.W - c.posFaitage);
  if (type === 'pignon') return corpsAvecBout(c, i, { type: 'pignon' });
  if (type === 'croupe') return corpsAvecBout(c, i, avant.type === 'croupe' ? avant : { type: 'croupe', profondeurM: centi(Math.min(largeur, r.L / 2 - 0.1)) });
  if (type === 'demi-croupe') return corpsAvecBout(c, i, regler(avant.type === 'demi-croupe' ? avant : demiCroupeNeuve(emax, c.faitage, largeur)));
  return c;
}

/** Le pan `n` en queue de vache de debord `d` (0 : l'egout redevient droit), ou avec sa pente adoucie a `deg`. */
function avecCoyau(c: CorpsToit, n: 0 | 1, d: number | null, deg: number | null): CorpsToit {
  const W = repere(c.pts).W, largeur = n === 0 ? c.posFaitage : W - c.posFaitage;
  const profil: [ProfilPan, ProfilPan] = c.profil ? [c.profil[0], c.profil[1]] : [{ type: 'droit' }, { type: 'droit' }];
  const avant = profil[n];
  if (d === 0) profil[n] = { type: 'droit' };
  else {
    const pente = penteDuPanDeg(c, n);
    const base = avant.type === 'coyau' ? avant : { type: 'coyau' as const, largeurM: centi(Math.min(LARGEUR_COYAU_M, largeur / 3)), penteDeg: Math.max(5, Math.round(pente - 15)) };
    profil[n] = { ...base, ...(deg !== null ? { penteDeg: Math.min(deg, Math.floor(pente - 3)) } : {}), ...(d !== null ? { debordM: d } : {}) };
  }
  const neuf: CorpsToit = { ...c };
  if (profil.every((p) => p.type === 'droit')) delete neuf.profil; else neuf.profil = profil;
  return neuf;
}

/** Ecrit un choix de ce module ; null si le groupe n'en est pas ou que la valeur n'a pas de sens (l'appelant rend alors une copie). */
export function appliquerBout(c: CorpsToit, groupe: string, valeur: string, pignonI: number | null): CorpsToit | null {
  const m = /^(bout|coupe|debordFaitage|qdv|penteCoyau|pointe)([01]?)$/.exec(groupe);
  if (!m) return null;
  const [, quoi, k] = m, v = Number(valeur);
  if (k === '' && pignonI !== null) {
    const g = c.pignons[pignonI];
    if (!g) return null;
    const e = c.egouts[g.pan], largeur = (g.fin - g.debut) / 2;
    let pointe: DemiCroupe | undefined = g.pointe;
    if (quoi === 'pointe' && valeur === 'triangle') pointe = undefined;
    else if (quoi === 'pointe' && valeur === 'demi-croupe') pointe = g.pointe ?? demiCroupeNeuve(e, g.faitage, largeur);
    else if (quoi === 'coupe' && g.pointe && (PARTS_COUPE as readonly number[]).includes(v)) pointe = avecPart(g.pointe, e, g.faitage, v);
    else if (quoi === 'debordFaitage' && g.pointe && (DEBORDS_FAITAGE_M as readonly number[]).includes(v)) pointe = avecDebordFaitage(g.pointe, v);
    else return null;
    const { pointe: _p, ...reste } = g;
    void _p;
    return { ...c, pignons: c.pignons.map((x, j) => (j === pignonI ? (pointe ? { ...reste, pointe } : reste) : x)) };
  }
  const i = Number(k) as 0 | 1;
  if (k === '') return null;
  if (quoi === 'qdv') return queueDeVacheReglable(c) && (DEBORDS_QUEUE_DE_VACHE_M as readonly number[]).includes(v) ? avecCoyau(c, i, v, null) : null;
  if (quoi === 'penteCoyau') return c.profil?.[i]?.type === 'coyau' && (PENTES_COYAU_DEG as readonly number[]).includes(v) ? avecCoyau(c, i, null, v) : null;
  if (!boutsReglables(c)) return null;
  const emax = Math.max(...c.egouts);
  if (quoi === 'bout') return ['pignon', 'croupe', 'demi-croupe'].includes(valeur) ? avecBout(c, i, valeur) : null;
  if (boutsDuCorps(c)[i].type !== 'demi-croupe') return null;
  if (quoi === 'coupe' && (PARTS_COUPE as readonly number[]).includes(v)) return avecBout(c, i, 'demi-croupe', (b) => avecPart(b, emax, c.faitage, v));
  if (quoi === 'debordFaitage' && (DEBORDS_FAITAGE_M as readonly number[]).includes(v)) return avecBout(c, i, 'demi-croupe', (b) => avecDebordFaitage(b, v));
  return null;
}
