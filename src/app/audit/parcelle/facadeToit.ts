// Les propositions du toit lu sur une facade (lot L2 de MD/spec-lecture-ia-elargie.md §5.1, points 4 et 5) : ce que la troisieme requete
// de la lecture d'une facade lit du toit, et qui ne passe pas par l'arbitrage de la couverture (constats/vus.ts, constatsToitLu).
// - Une fenetre de toit ou un champ de panneaux : une proposition de corps, comme une cheminee vue sur la ligne du haut (formeFacades.ts).
//   La regle (facade/regles/facades/toitLu.ts) l'adresse au corps par son mur ; le moteur des toits la pose sur le pan de ce mur
//   (corpsSousContrainte) ; l'effet n'ajoute que ce que le moteur a pose. Decochee (decision 2).
// - Le faitage et la gouttiere : les bords du corps de ce mur, decoches.
// - Le debord : une alerte seulement, dite sur l'ecran de la facade (lignesToitLu) ; le toit garde le sien. Pur.

import { corpsProposesSousFait, corpsSousContrainte } from '../../../facade/regles/toits/faits.js';
import { murDuCorps } from '../../../facade/regles/toits/murDuCorps.js';
import { alerteDebord, bordsLus, direBords, direToitLu, elementsToitProposes } from '../../../facade/regles/facades/toitLu.js';
import { observationsDuRun } from '../../../facade/regles/facades/ia.js';
import { ecrivainPeut } from '../../../model/protections.js';
import { faitDuBatiment } from '../../../regles/toits/faits.js';
import { facadesDuContour, type Facade } from '../../../geometry/cotesVusDeDehors.js';
import type { ObservationsFacade, RunEnregistre } from '../../../regles/facades/observations.js';
import type { IndiceProposition, Proposition } from '../../../regles/decisions.js';
import type { CorpsToit, ObjetPlan, PtBrut, ToitMesure } from '../../../model/types.js';

/** Pourquoi une fenetre de toit ou un panneau arrive decoche. */
const RESERVE_ELEMENT = 'Un élément du toit lu sur la photo se confirme toujours : cochez-le si la photo le montre bien. Le moteur des toits le pose sur le pan de ce mur, à la taille courante ; ce que le toit porte déjà ne bouge pas.';
/** Pourquoi le faitage et la gouttiere arrivent decoches. */
const RESERVE_BORDS = 'Lu sur la photo de la façade : cochez-le s’il y est bien. Il ne change que le dessin du toit.';

const NOMS: Readonly<Record<'fenetre-toit' | 'solaire', [string, string]>> = { 'fenetre-toit': ['fenêtre de toit', 'fenêtres de toit'], solaire: ['champ de panneaux solaires', 'champs de panneaux solaires'] };
const f2 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

/** Ce que la facade d'un batiment donne aux propositions du toit lu. */
interface FacadeToitLue {
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
  indice: IndiceProposition;
}

/** Les fenetres de toit et panneaux que le moteur pose d'apres une facade lue : une proposition par element qu'il a pose. */
export function propositionsElementsToit(l: FacadeToitLue): Proposition[] {
  const out: Proposition[] = [];
  for (const p of elementsToitProposes(l.obs, l.facade, l.facade.hauteur)) {
    const vu = p.observation.elementsToitDesMurs[0];
    const k = murDuCorps(l.corps, vu.mur.gauche, vu.mur.droite)?.corps;
    const relus = corpsSousContrainte({ observation: p.observation, application: 'contrainte' }, l.corps, l.mesure, l.pts);
    const avant = k === undefined ? undefined : l.corps[k], apres = k === undefined ? undefined : relus?.[k];
    if (k === undefined || !avant || !apres || !relus || 'refus' in corpsProposesSousFait(faitDuBatiment(l.o), relus, l.pts)) continue;
    // Le moteur n'ajoute que des elements apres ceux du corps : rien de plus, il ne l'a pas pose (pan trop etroit, deja la, toit plat).
    const elements = (apres.elementsToit ?? []).slice(avant.elementsToit?.length ?? 0);
    const e = elements[0];
    if (!e) continue;
    const n = (avant.elementsToit ?? []).filter((x) => x.type === p.element).length;
    out.push({
      id: l.cle + ':elementToit:' + l.facade.cote + ':' + k + ':' + p.element + ':' + Math.round(p.u0 * 100), cible: { type: 'batiment', cle: l.cle },
      objet: 'Toit de ' + l.nom + ', corps ' + (k + 1) + ' (vu sur la ' + l.mur + ')', source: 'claude',
      avant: (n ? n + ' ' + NOMS[p.element][n > 1 ? 1 : 0] : 'aucun' + (p.element === 'fenetre-toit' ? 'e ' : ' ') + NOMS[p.element][0]) + ' sur ce pan',
      apres: 'Une ' + (p.element === 'fenetre-toit' ? 'fenêtre de toit' : 'rangée de panneaux solaires') + ' à ' + f2(e.sM) + ' m le long du faîtage, ' + f2(e.dM) + ' m de l’égout, posée par le moteur des toits sur ce pan',
      indices: [l.indice],
      confiance: null,
      remplaceChoix: ecrivainPeut(l.o, 'audit', 'elements') ? null : 'éléments du toit posés à la main',
      reserve: RESERVE_ELEMENT,
      effet: { type: 'elementsToitDuToit', corps: k, elements, vu },
    });
  }
  return out;
}

/** Le faitage et la gouttiere lus sur une facade : une proposition pour le corps de son mur, quand ils different des siens. */
export function propositionBords(l: FacadeToitLue): Proposition | null {
  const k = murDuCorps(l.corps, l.facade.gauche, l.facade.droite)?.corps;
  const c = k === undefined ? undefined : l.corps[k];
  const b = bordsLus(l.obs, c);
  if (k === undefined || !c || !b) return null;
  const avant = direBords({ ...(c.bords?.faitage ? { faitage: c.bords.faitage } : {}), ...(c.bords?.gouttiere ? { gouttiere: c.bords.gouttiere } : {}) });
  return {
    id: l.cle + ':bords:' + l.facade.cote + ':' + k, cible: { type: 'batiment', cle: l.cle },
    objet: 'Toit de ' + l.nom + ', corps ' + (k + 1) + ' (vu sur la ' + l.mur + ')', source: 'claude',
    avant: avant || 'ni faîtage ni gouttière dessinés', apres: direBords(b) + ', lus par Claude',
    indices: [l.indice], confiance: null,
    remplaceChoix: ecrivainPeut(l.o, 'audit', 'elements') ? null : 'éléments du toit posés à la main',
    reserve: RESERVE_BORDS,
    effet: { type: 'bordsDuToit', corps: k, bords: b },
  };
}

/**
 * Ce que le toit lu dit de plus, en lignes pour l'ecran de la facade : ce que Claude y voit, l'alerte du debord (sans case), et un
 * signal quand la lecture du toit a echoue (le run et la lecture enrichie restent entiers). Vide sans lecture du toit.
 */
function lignesToitLu(run: RunEnregistre | null, corps: CorpsToit | null): { texte: string; signal?: true }[] {
  if (!run?.toit) return [];
  if (run.toit.erreur) return [{ texte: run.toit.erreur + ' La façade est proposée sans ce qu’elle montre du toit (couverture, faîtage, fenêtres de toit).', signal: true }];
  const obs = observationsDuRun(run);
  const out: { texte: string; signal?: true }[] = [];
  const dit = direToitLu(obs);
  if (dit) out.push({ texte: 'Toit lu par Claude : ' + dit + '.' });
  const alerte = alerteDebord(obs, corps);
  if (alerte) out.push({ texte: alerte, signal: true });
  return out;
}

/** Les lignes du toit lu d'une facade (`cle`, `cote`) de l'audit : le corps de son mur est celui que l'alerte du debord compare. */
export function lignesToitDeLaFacade(run: RunEnregistre | null, objets: readonly ObjetPlan[], cle: string, cote: number): { texte: string; signal?: true }[] {
  const o = objets.find((x) => x.key === cle);
  const pts = o && 'pts' in o && Array.isArray(o.pts) ? (o.pts as PtBrut[]) : null;
  const corps = o?.batiment?.corpsToit ?? [];
  const f = pts && pts.length > 2 ? facadesDuContour(pts, 0).find((x) => x.cote === cote) : undefined;
  const k = f && corps.length ? murDuCorps(corps, f.gauche, f.droite)?.corps : undefined;
  return lignesToitLu(run, k === undefined ? null : corps[k] ?? null);
}
