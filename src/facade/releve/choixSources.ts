// Les choix de la personne entre le calcul, Claude et sa propre valeur, element par element, et le forcage de Claude (lot C2, decisions
// du proprietaire du 7 novembre 2026). Ce sont des gestes, donc des entrees de `derouler` (EntreesFacade.choix et .forcages), lues ici
// et nulle part ailleurs : l'element choisi remplace la valeur du moteur pour les etapes qui le consomment (FAMILLES_CLAUDE). Sans choix
// ni forcage, chaque fonction rend exactement ce qu'elle a recu (le meme objet) : rien ne change, ni un calcul ni une sortie.
//
// - Ouvertures (E12, E14) : une boite retrouvee prise de Claude remplace la place de l'ouverture calculee qu'elle confirme ; une boite
//   seulement proposee, prise, s'ajoute ; Manuel part de l'une ou de l'autre ; une ouverture ajoutee a la main (`ajout:k`) s'ajoute.
// - Les angles du mur (E7) : la pose de Claude, ou celle de la personne, devient le mur pose a la main (une entree de la chaine) ;
//   « Forcer Claude partout » ne les couvre pas (un choix delibere de l'E7), et la lecture de Claude devient perimee (l'E8 le dit).
// - Les pointes, le mot du haut, les autres volumes, les elements du toit (E9, E10 ; E14 pour les pointes) : la lecture que le
//   diagnostic et le bilan recoivent, avec les elements que la personne prend malgre le haut lu (le moteur les pose, ou les refuse).
// - Le parement, ses zones, ce qui cache le mur, les appentis : aucune etape ne les consomme encore ; le choix est range et dit.
// Pur, sans DOM.

import { FAMILLES_CLAUDE, type ChoixSource, type FamilleClaude, type ForcageSource, type IdEtape, type SourceElement, type ValeurElement } from '../../model/etapeFacade.js';
import type { ObservationsFacade } from '../../regles/facades/observations.js';
import type { OuvertureFacade, TypeOuverture } from '../../model/types.js';
import type { AccordIa, RectIa } from '../regles/facades/ia.js';
import { avisDesPointes } from '../regles/facades/ia.js';
import type { BoutVu, SilhouetteFacade } from '../../model/silhouetteFacade.js';

/** Les choix et les forcages d'une facade, tels que `derouler` les recoit. */
interface ChoixEtForcages { choix?: readonly ChoixSource[] | undefined; forcages?: readonly ForcageSource[] | undefined }

/** Rien a appliquer : ni choix ni forcage. Le chemin de tous les jours, et la preuve que rien ne change. */
const sansChoix = (e: ChoixEtForcages): boolean => !e.choix?.length && !e.forcages?.length;

/** La source qui vaut pour un element, et pourquoi. */
interface SourceLue { source: SourceElement | null; choisie: ChoixSource | null; forcee: ForcageSource | null; sansClaude: boolean }

/**
 * La source d'un element, lue dans cet ordre : le choix de l'element, sinon le forcage (Claude, ou le calcul quand Claude ne l'a pas
 * lu), sinon celle que retient le moteur. Un forcage vise l'element quand il porte sur toutes les etapes, ou sur l'etape qui le montre
 * ou qui le consomme.
 */
export function sourceDe(e: ChoixEtForcages, cle: string, famille: FamilleClaude, claudeLu: boolean, retenue: SourceElement | null): SourceLue {
  const choisie = e.choix?.find((x) => x.cle === cle) ?? null, f = FAMILLES_CLAUDE[famille];
  // « Forcer Claude partout » ne couvre pas les angles du mur : poser le mur sur Claude reste un choix delibere de l'E7.
  const forcee = e.forcages?.find((x) => ('toutes' in x ? famille !== 'angles' : x.etape === f.montreeA || f.consommePar.includes(x.etape))) ?? null;
  const sansClaude = !choisie && !!forcee && !claudeLu;
  const source: SourceElement | null = choisie ? choisie.source : forcee ? (claudeLu ? 'claude' : 'calcul') : retenue;
  return { source, choisie, forcee, sansClaude };
}

const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r2 = (v: number) => Math.round(v * 100) / 100;
const TYPES: readonly TypeOuverture[] = ['fenetre', 'porte-fenetre', 'porte', 'garage'];

/** Une place d'ouverture lue dans une valeur manuelle (x, y, l, h en metres, son type) ; null si elle ne se lit pas. */
function placeManuelle(v: ValeurElement | null | undefined, defaut: TypeOuverture = 'fenetre'): Pick<OuvertureFacade, 'type' | 'x' | 'y' | 'l' | 'h'> | null {
  if (!v || !fini(v.x) || !fini(v.y) || !fini(v.l) || !fini(v.h) || v.l <= 0 || v.h <= 0) return null;
  const type = TYPES.includes(v.type as TypeOuverture) ? (v.type as TypeOuverture) : defaut;
  return { type, x: r2(v.x), y: r2(v.y), l: r2(v.l), h: r2(v.h) };
}

const meme = (a: Pick<OuvertureFacade, 'x' | 'y' | 'l' | 'h'>, b: Pick<OuvertureFacade, 'x' | 'y' | 'l' | 'h'>) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.l - b.l) < 1e-6 && Math.abs(a.h - b.h) < 1e-6;

/** La cle d'une boite de Claude : son rang dans sa lecture (la reponse votee), stable d'un rejeu a l'autre de la meme reponse. */
const cleDeLaBoite = (reponse: ObservationsFacade | null, ia: object): string => 'ouverture:' + (reponse?.ouvertures ?? []).indexOf(ia as never);

/**
 * Les ouvertures de la facade selon les choix (E12, ce que V3 relit et V4 ecrit) : `base` est la liste du moteur (l'accord de Claude,
 * sinon le releve), `calculees` et `devinees` celles que `vers` designe. Null quand aucun choix ne change rien : la liste du moteur vaut.
 */
export function ouverturesSelonLesChoix(e: ChoixEtForcages, accord: AccordIa | null, reponse: ObservationsFacade | null, base: readonly OuvertureFacade[], calculees: readonly OuvertureFacade[], devinees: readonly OuvertureFacade[]): { ouvertures: OuvertureFacade[]; changees: string[] } | null {
  if (sansChoix(e)) return null;
  const out = base.map((o) => o);
  const changees: string[] = [];
  const remplacer = (cible: OuvertureFacade | undefined, par: Pick<OuvertureFacade, 'type' | 'x' | 'y' | 'l' | 'h'>, source: 'claude' | 'corrigee', cle: string) => {
    const k = cible ? out.findIndex((o) => meme(o, cible)) : -1;
    const o = out[k];
    if (!o || meme(o, par) && o.type === par.type) return;
    out[k] = { ...o, ...par, source };
    changees.push(cle);
  };
  for (const x of accord?.boites ?? []) {
    const cle = cleDeLaBoite(reponse, x.ia), s = sourceDe(e, cle, 'ouverture', true, x.avec ? 'calcul' : null);
    const place = s.source === 'claude' ? { type: x.ouverture.type, x: x.ouverture.x, y: x.ouverture.y, l: x.ouverture.l, h: x.ouverture.h } : s.source === 'manuel' ? placeManuelle(s.choisie?.valeur, x.ouverture.type) : null;
    if (!place) continue;
    const source = s.source === 'claude' ? 'claude' : 'corrigee';
    if (x.avec === 'detectee' && x.vers !== null) remplacer(calculees[x.vers], place, source, cle);
    else if (x.avec === 'devinee' && x.vers !== null) remplacer(devinees[x.vers], place, source, cle);
    else { out.push({ ...place, source: s.source === 'claude' ? 'claude' : 'ajoutee', ...(x.ouverture.details ? { details: x.ouverture.details } : {}) }); changees.push(cle); }
  }
  // Une boite ecartee (hors du mur) n'a pas de place sur lui : seule une valeur de la personne la pose.
  for (const ia of accord?.ecartees ?? []) {
    const cle = cleDeLaBoite(reponse, ia), s = sourceDe(e, cle, 'ouverture', true, null);
    const place = s.source === 'manuel' ? placeManuelle(s.choisie?.valeur, ia.type as TypeOuverture) : null;
    if (place) { out.push({ ...place, source: 'ajoutee' }); changees.push(cle); }
  }
  // Les ouvertures ajoutees a la main, a cote de ce que le calcul et Claude ont vu.
  for (const c of e.choix ?? []) {
    if (!c.cle.startsWith('ajout:') || c.source !== 'manuel') continue;
    const place = placeManuelle(c.valeur);
    if (place) { out.push({ ...place, source: 'ajoutee' }); changees.push(c.cle); }
  }
  return changees.length ? { ouvertures: out.sort((a, b) => a.x - b.x || a.y - b.y), changees } : null;
}

/**
 * La pose du mur selon le choix des angles (E7) : celle de Claude, ou celle de la personne (x0, x1, y0, y1 en pixels de l'image prise
 * pour la suite) ; null : le mur du calcul reste.
 */
export function poseSelonLesChoix(e: ChoixEtForcages, poseDeClaude: RectIa | null): { rect: RectIa; source: 'claude' | 'manuel' } | null {
  if (sansChoix(e)) return null;
  const s = sourceDe(e, 'angles', 'angles', !!poseDeClaude, 'calcul');
  if (s.source === 'claude' && poseDeClaude) return { rect: poseDeClaude, source: 'claude' };
  const v = s.source === 'manuel' ? s.choisie?.valeur : null;
  if (v && fini(v.x0) && fini(v.x1) && fini(v.y0) && fini(v.y1) && v.x1 > v.x0 && v.y1 > v.y0) return { rect: { x0: v.x0, x1: v.x1, y0: v.y0, y1: v.y1 }, source: 'manuel' };
  return null;
}

const SILHOUETTES: readonly SilhouetteFacade[] = ['triangle', 'trapeze', 'rampe', 'ligne-droite', 'marches', 'plusieurs-sommets', 'indetermine'];
const BOUTS: readonly BoutVu[] = ['pignon', 'croupe', 'demi-croupe', 'brisis', 'sans-objet', 'indetermine'];

/**
 * La lecture de Claude telle que le diagnostic (E10) et le bilan (E14) la recoivent selon les choix : une pointe en plus prise du calcul
 * s'en va, une pointe corrigee a la main prend sa place, une pointe attendue et non vue s'ajoute a la main ; le mot du haut pris du calcul
 * ne dit plus rien (le diagnostic lit le haut lu), corrige a la main il dit ce que la personne a vu ; un autre volume pris du calcul s'en
 * va ; un element du toit pris du calcul s'en va, pris de Claude (ou corrige) il est pris malgre le haut lu (`pris`), que le moteur pose
 * ou refuse. Sans choix : la reponse telle quelle, aucun element pris.
 */
export function lectureSelonLesChoix(e: ChoixEtForcages, r: ObservationsFacade | null, attendues: readonly { u: number; v: number }[]): { reponse: ObservationsFacade | null; pris: { element: 'cheminee' | 'lucarne'; u: number }[] } {
  if (!r || sansChoix(e)) return { reponse: r, pris: [] };
  let change = false;
  const avis = avisDesPointes(r, attendues);
  const pointes: ObservationsFacade['calage']['pointes'][number][] = [];
  let manquante = 0;
  avis.forEach((a, i) => {
    if (a.avis === 'manquante') {
      const s = sourceDe(e, 'pointe-attendue:' + manquante++, 'pointe', false, 'calcul'), v = s.choisie?.valeur;
      if (s.source === 'manuel' && v && fini(v.u) && fini(v.v)) { pointes.push({ u: v.u, v: v.v, confiance: 'forte' }); change = true; }
      return;
    }
    const p = r.calage.pointes[i];
    if (!p) return;
    const s = sourceDe(e, 'pointe:' + i, 'pointe', true, a.avis === 'en-plus' ? 'claude' : 'calcul'), v = s.choisie?.valeur;
    if (s.source === 'calcul' && a.avis === 'en-plus') { change = true; return; }
    if (s.source === 'manuel' && v && fini(v.u) && fini(v.v)) { pointes.push({ ...p, u: v.u, v: v.v }); change = true; return; }
    pointes.push(p);
  });
  let forme = r.forme;
  const sf = sourceDe(e, 'forme', 'forme', true, null), vf = sf.choisie?.valeur;
  if (sf.source === 'calcul') { forme = { silhouette: 'indetermine', bout: 'indetermine' }; change = true; }
  else if (sf.source === 'manuel' && vf) {
    forme = { silhouette: SILHOUETTES.includes(vf.silhouette as SilhouetteFacade) ? (vf.silhouette as SilhouetteFacade) : r.forme.silhouette, bout: BOUTS.includes(vf.bout as BoutVu) ? (vf.bout as BoutVu) : r.forme.bout };
    change = true;
  }
  const corps = r.calage.corps.flatMap((x, k) => {
    const s = sourceDe(e, 'corps:' + k, 'corps', true, null), v = s.choisie?.valeur;
    if (s.source === 'calcul') { change = true; return []; }
    if (s.source === 'manuel' && v && fini(v.u0) && fini(v.u1) && v.u1 > v.u0) { change = true; return [{ ...x, debut: v.u0, fin: v.u1 }]; }
    return [x];
  });
  const pris: { element: 'cheminee' | 'lucarne'; u: number }[] = [];
  const elements = r.elements.flatMap((x, i) => {
    const s = sourceDe(e, 'element-toit:' + i, 'element-toit', true, null), v = s.choisie?.valeur;
    if (s.source === 'calcul') { change = true; return []; }
    if (s.source === 'manuel' && v && fini(v.u)) { const y = { ...x, u: v.u, element: v.element === 'lucarne' || v.element === 'cheminee' ? v.element : x.element }; pris.push({ element: y.element, u: y.u }); change = true; return [y]; }
    if (s.source === 'claude' && (s.choisie || s.forcee)) pris.push({ element: x.element, u: x.u });
    return [x];
  });
  if (!change && !pris.length) return { reponse: r, pris: [] };
  return { reponse: { ...r, forme, elements, calage: { ...r.calage, pointes, corps } }, pris };
}

/** Un choix relu d'un cas (le fichier du serveur) : sa cle, sa source et sa date ; sa valeur, des nombres, des mots, vrai ou faux. */
function lireUnChoix(brut: unknown): ChoixSource | null {
  const c = brut as Partial<ChoixSource> | null;
  if (!c || typeof c.cle !== 'string' || !c.cle || typeof c.le !== 'string' || (c.source !== 'calcul' && c.source !== 'claude' && c.source !== 'manuel')) return null;
  const valeur = c.valeur && typeof c.valeur === 'object' ? Object.fromEntries(Object.entries(c.valeur).filter(([, v]) => v === null || typeof v === 'string' || typeof v === 'boolean' || fini(v))) : null;
  return { cle: c.cle, source: c.source, le: c.le, ...(valeur ? { valeur } : {}) };
}

/** Les choix d'un cas, relus : un choix illisible est laisse de cote, un seul par cle (le dernier). */
export function lireChoix(brut: unknown): ChoixSource[] {
  if (!Array.isArray(brut)) return [];
  const lus = brut.map(lireUnChoix).filter((x): x is ChoixSource => x !== null);
  return lus.filter((x, k) => !lus.slice(k + 1).some((y) => y.cle === x.cle));
}

/** Les etapes ou un forcage de Claude a un sens : celles qui montrent ou consomment une lecture de Claude. */
export const ETAPES_FORCABLES: readonly IdEtape[] = [...new Set(Object.values(FAMILLES_CLAUDE).flatMap((d) => [d.montreeA, ...d.consommePar]))];

/** Les forcages d'un cas, relus : Claude pour une etape, ou pour toutes. */
export function lireForcages(brut: unknown): ForcageSource[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((x): ForcageSource[] => {
    const f = x as { etape?: unknown; toutes?: unknown; source?: unknown; le?: unknown } | null;
    if (!f || f.source !== 'claude' || typeof f.le !== 'string') return [];
    if (f.toutes === true) return [{ toutes: true, source: 'claude', le: f.le }];
    const etape = f.etape as IdEtape;
    return typeof f.etape === 'string' && ETAPES_FORCABLES.includes(etape) ? [{ etape, source: 'claude', le: f.le }] : [];
  });
}

/** Le choix d'un element pose (ou retire, `source` null : la source du moteur revient), dans une liste de choix. */
export function avecLeChoix(choix: readonly ChoixSource[] | undefined, cle: string, source: SourceElement | null, le: string, valeur?: ValeurElement): ChoixSource[] {
  const reste = (choix ?? []).filter((x) => x.cle !== cle);
  return source ? [...reste, { cle, source, le, ...(valeur ? { valeur } : {}) }] : reste;
}

/** Le forcage de Claude pose ou retire, pour une etape ou pour toutes ; un forcage « toutes » ne remplace pas ceux des etapes. */
export function avecLeForcage(forcages: readonly ForcageSource[] | undefined, cible: { etape: IdEtape } | { toutes: true }, oui: boolean, le: string): ForcageSource[] {
  const vise = (x: ForcageSource) => ('toutes' in cible ? 'toutes' in x : !('toutes' in x) && x.etape === cible.etape);
  const reste = (forcages ?? []).filter((x) => !vise(x));
  return oui ? [...reste, 'toutes' in cible ? { toutes: true, source: 'claude', le } : { etape: cible.etape, source: 'claude', le }] : reste;
}
