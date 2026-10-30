// Les propositions de la facade enrichie (lot L1 de MD/spec-lecture-ia-elargie.md §5.1, points 4 et 5) : ce que le run d'une facade
// lit et qui ne va pas dans la Facade elle-meme.
// - Les saillies (bow-window, galerie, auvent, appentis) : une proposition de corps, comme une forme de toit (formeFacades.ts). La regle
//   des saillies (facade/regles/facades/saillies.ts) l'adresse au corps du troncon par son mur ; le moteur des toits la pose
//   (corpsSousContrainte) ; l'effet n'ajoute que le corps que le moteur a rendu. Decochee (decision 2), sa profondeur dite par defaut.
// - Le perron, l'unite exterieure, la boite aux lettres : des objets du plan (un equipement qui ne charge rien), proposes contre le mur,
//   decoches ; un equipement de meme nature deja la, a moins d'un metre, ne se propose pas (il s'observe).
// - Le store, la modenature et l'etat du mur vont dans la Facade a sa validation (facadeValidee.ts) ; les decroches sont dits, pas
//   proposes (risque 4). Pur.

import { corpsProposesSousFait, corpsSousContrainte } from '../../../facade/regles/toits/faits.js';
import { constatsDecroches, direSaillie, sailliesProposees } from '../../../facade/regles/facades/saillies.js';
import { detailsDeLIa, direDetailsLus } from '../../../facade/regles/facades/menuiseries.js';
import { direEtat, etatDeLIa } from '../../../facade/regles/facades/etat.js';
import { appendicesDeLIa, direModenature, equipementsLus, modenatureDeLIa, type EquipementLu } from '../../../facade/regles/facades/modenature.js';
import { EQUIPEMENTS_DE_FACADE, equipementDeFacade, libelleEquipement, MARCHES_PERRON } from '../../../model/jardin.js';
import { estOuvrage, EQUIPEMENT } from '../../../model/ouvrages/index.js';
import { faitDuBatiment } from '../../../regles/toits/faits.js';
import { ecrivainPeut } from '../../../model/protections.js';
import type { Facade } from '../../../geometry/cotesVusDeDehors.js';
import type { DiagnosticForme } from '../../../facade/regles/facades/diagnosticForme.js';
import type { ObservationsFacade, RunEnregistre } from '../../../regles/facades/observations.js';
import { observationsDuRun } from '../../../facade/regles/facades/ia.js';
import type { IndiceProposition, Proposition } from '../../../regles/decisions.js';
import type { CorpsToit, ObjetPlan, PtBrut, ToitMesure } from '../../../model/types.js';

/** Pourquoi une saillie arrive decochee. */
const RESERVE_SAILLIE = 'Une saillie lue sur la photo se confirme toujours : cochez-la si la photo la montre bien. Le moteur des toits la pose sur ce corps, à la profondeur courante de son genre (une vue de face ne la montre pas) ; réglez-la ensuite au Mode Toit.';
/** Pourquoi un equipement de la facade arrive decoche. */
const RESERVE_EQUIPEMENT = 'Lu sur la photo de la façade : cochez-le s’il y est bien. Sa profondeur ne se lit pas sur une vue de face ; il ne charge aucune terrasse.';

const f2 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
const cm = (v: number) => Math.round(v * 100) / 100;

/** Ce que la facade d'un batiment donne aux propositions enrichies. */
interface FacadeLue {
  o: ObjetPlan;
  nom: string;
  cle: string;
  facade: Facade;
  /** « façade sud » */
  mur: string;
  corps: CorpsToit[];
  mesure: ToitMesure;
  pts: PtBrut[];
  obs: ObservationsFacade;
  diagnostic: DiagnosticForme | null;
  indice: IndiceProposition;
}

/** Les saillies que le moteur pose d'apres une facade lue : une proposition par saillie que la regle adresse a un corps. */
export function propositionsSaillies(l: FacadeLue): Proposition[] {
  if (!l.diagnostic) return [];
  const out: Proposition[] = [];
  for (const p of sailliesProposees(l.obs, l.diagnostic.troncons, l.facade, l.facade.hauteur, [])) {
    const relus = corpsSousContrainte({ observation: p.observation, application: 'contrainte' }, l.corps, l.mesure, l.pts);
    // Le moteur ajoute la saillie apres les corps d'avant : rien de plus, il ne l'a pas posee (deja la, trop etroite).
    const neuf = relus && relus.length > l.corps.length ? relus[relus.length - 1] : undefined;
    if (!relus || !neuf?.saillie || 'refus' in corpsProposesSousFait(faitDuBatiment(l.o), relus, l.pts)) continue;
    const vu = p.observation.sailliesDesMurs[0];
    out.push({
      id: l.cle + ':saillie:' + l.facade.cote + ':' + p.saillie.genre + ':' + Math.round(p.u0 * 100), cible: { type: 'batiment', cle: l.cle },
      objet: 'Toit de ' + l.nom + ', corps ' + (neuf.saillie.hote + 1) + ' (vu sur la ' + l.mur + ')', source: 'claude',
      avant: 'rien de posé à cet endroit du mur',
      apres: direSaillie(p) + ', posée par le moteur des toits',
      indices: [l.indice],
      confiance: null,
      remplaceChoix: ecrivainPeut(l.o, 'audit', 'elements') ? null : 'éléments du toit posés à la main',
      reserve: RESERVE_SAILLIE,
      effet: { type: 'saillieDuToit', corps: neuf, vu },
    });
  }
  return out;
}

/** L'emprise d'un equipement contre le mur, de `x0` a `x1` metres depuis sa gauche, sur `profondeur` metres vers dehors. */
function contreLeMur(f: Facade, x0: number, x1: number, profondeur: number): PtBrut[] {
  const u = { x: (f.droite.x - f.gauche.x) / f.largeur, y: (f.droite.y - f.gauche.y) / f.largeur };
  const p = (x: number, d: number) => ({ x: cm(f.gauche.x + u.x * x + f.normale.x * d), y: cm(f.gauche.y + u.y * x + f.normale.y * d) });
  return [p(x0, 0), p(x1, 0), p(x1, profondeur), p(x0, profondeur)];
}

/** L'equipement neuf d'une lecture, et ce qu'il dit : sa place contre le mur, sa taille courante. */
function equipement(l: FacadeLue, a: EquipementLu): { objet: ObjetPlan; apres: string } {
  const L = l.facade.largeur, milieu = ((a.u0 + a.u1) / 2) * L;
  const cle = l.cle + ':' + l.facade.cote + ':' + a.nature + ':' + Math.round(a.u0 * 100);
  if (a.nature === 'perron') {
    const marches = Math.min(MARCHES_PERRON.max, a.marches ?? MARCHES_PERRON.defaut);
    const d = EQUIPEMENTS_DE_FACADE.perron;
    const largeur = Math.max(0.9, (a.u1 - a.u0) * L);
    const x0 = Math.max(0, milieu - largeur / 2), x1 = Math.min(L, milieu + largeur / 2);
    return { objet: equipementDeFacade(cle, contreLeMur(l.facade, x0, x1, d.profondeurM), 'perron', cm(marches * d.hauteurMarcheM)), apres: 'Perron de ' + marches + ' marche' + (marches > 1 ? 's' : '') + ', ' + f2(x1 - x0) + ' m de large et ' + f2(d.profondeurM) + ' m de profondeur par défaut' };
  }
  const d = EQUIPEMENTS_DE_FACADE[a.nature];
  const x0 = Math.max(0, milieu - d.largeurM / 2), x1 = Math.min(L, x0 + d.largeurM);
  return { objet: equipementDeFacade(cle, contreLeMur(l.facade, x0, x1, d.profondeurM), a.nature, d.hauteurM), apres: libelleEquipement(a.nature) + ' contre le mur, à ' + f2(milieu) + ' m de son bord gauche' };
}

/** Deux equipements de meme nature dont les centres sont a moins de cela sont le meme : celui qui est la ne se propose pas. */
const MEME_EQUIPEMENT_M = 1;
const centre = (pts: readonly PtBrut[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

/** Le perron, l'unite exterieure et la boite aux lettres lus sur une facade : des objets neufs, proposes contre le mur. */
export function propositionsEquipements(l: FacadeLue, objets: readonly ObjetPlan[]): Proposition[] {
  const out: Proposition[] = [];
  for (const a of equipementsLus(l.obs)) {
    const { objet, apres } = equipement(l, a);
    const c = centre((objet as { pts: PtBrut[] }).pts);
    const deja = objets.some((x) => estOuvrage(x, EQUIPEMENT) && x.nature === a.nature && 'pts' in x && Array.isArray(x.pts) && x.pts.length > 2 && Math.hypot(centre(x.pts as PtBrut[]).x - c.x, centre(x.pts as PtBrut[]).y - c.y) < MEME_EQUIPEMENT_M);
    if (deja || objets.some((x) => x.key === objet.key)) continue;
    out.push({
      id: 'facade:' + objet.key, cible: { type: 'parcelle' }, objet: libelleEquipement(a.nature) + ' (' + l.mur + ' de ' + l.nom + ')', source: 'claude',
      avant: 'rien', apres, indices: [l.indice], confiance: null, remplaceChoix: null, reserve: RESERVE_EQUIPEMENT,
      effet: { type: 'ajoutObjet', objet },
    });
  }
  return out;
}

/**
 * Ce que le run d'une facade lit de plus que ses ouvertures (lot L1), en lignes pour l'ecran de la facade (É7 et É9) : les menuiseries et
 * les garde-corps, la modenature et les stores, les decroches (a retoucher a la main), et l'etat du mur, signale sans case. La hauteur
 * du mur sert a la modenature dite (`egoutM`). Vide quand le run n'en dit rien.
 */
export function lignesFacadeEnrichie(run: RunEnregistre | null, mur: { largeurM: number; egoutM: number }): { texte: string; signal?: true }[] {
  const obs = run ? observationsDuRun(run) : null;
  if (!obs) return [];
  const out: { texte: string; signal?: true }[] = [];
  const details = obs.ouvertures.map((o) => detailsDeLIa(o.lus, { y: o.v0 * mur.egoutM }, mur.egoutM));
  const menuiseries = direDetailsLus(details);
  if (menuiseries) out.push({ texte: 'Lu par Claude : ' + menuiseries + '.' });
  const appendices = appendicesDeLIa(obs, mur);
  const modenature = direModenature(modenatureDeLIa(obs, mur, obs.modenature?.descentes ?? null), appendices.length);
  if (modenature) out.push({ texte: 'Modénature lue : ' + modenature + ' ; elle s’écrit avec la façade validée.' });
  for (const c of constatsDecroches(obs)) out.push({ texte: c });
  const etat = direEtat(etatDeLIa(obs, ''));
  if (etat) out.push({ texte: etat, signal: true });
  return out;
}
