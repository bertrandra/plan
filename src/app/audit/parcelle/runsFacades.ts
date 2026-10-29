// Le run d'une facade par Claude dans l'audit de la parcelle (MD/spec-facade-calage-audit.md §8, lot F3) : une requete par facade
// mesuree, dans le meme batch que l'analyse des maisons (aucun delai de plus), avec le prompt, le schema et le modele de l'usage
// `facade` (le serveur les choisit). Le meme run que la calibration et le releve (app/releve/runFacade.ts) : meme contenu, meme
// reponse enregistree (versions, modele, tokens, cout). Il remplace le renfort a trois passes votees : un run, pas de vote ; la
// protection contre l'invention passe par l'accord avec la detection.
//
// Claude propose, le moteur decide (decision du proprietaire) : la reponse n'est lue que par les regles des facades
// (facade/regles/facades/ia.ts, `accorderOuvertures`) ; le resultat est garde dans la capture, et les propositions se recalculent
// ensuite sans image (propositionsClaude.ts, `propositionsAccords`). Chaque facade photographiee est lue (decision D11 : pendant les
// premiers audits, toutes, pour mesurer l'apport de Claude) ; une facade sans releve mesure n'a pas de requete.

import { contenuRunFacade, runDesResultats } from '../../releve/runFacade.js';
import { texteRunFacade, type RunEnregistre } from '../../../regles/facades/observations.js';
import { accorderOuvertures, observationsDuRun, texteAccord } from '../../../facade/regles/facades/ia.js';
import { cartesAretes } from '../../../facade/detection/recalageIa.js';
import { pointesDuGabarit } from '../../../facade/gabaritMur.js';
import { MATERIAUX_MURS_VUS, libelleDe } from '../../../model/ceQueJeVois.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import { etiquetteFacade } from './liste.js';
import type { RequeteAnalyse, ResultatsBatch } from '../../../io/analyseClaude.js';
import type { AccordFacadeCapture, BatchAnalyse } from '../../../model/auditParcelle.js';
import type { ImageAnalyse } from '../../../render/imagesAnalyse.js';
import type { Image } from '../../../facade/vision/homographie.js';
import type { ReleveFacade } from '../../../model/types.js';
import type { MesureFacade } from './mesures.js';

/** L'image d'une facade pour son run, et sa taille avant reduction (la reponse enregistree la garde). */
export interface ImageRunFacade { image: Pick<ImageAnalyse, 'base64' | 'mediaType'>; largeur: number; hauteur: number }

/** Qui dessine l'image du run d'une facade de l'audit : l'elevation du mur, decoupee dans la texture de son releve mesure. */
export interface FabriqueImageRunFacade { elevation(r: ReleveFacade): Promise<ImageRunFacade | null> }

/** L'identifiant de la requete du run d'une facade (`[A-Za-z0-9_-]`) : le rang du batiment, le cote, la passe unique. */
const idRunFacade = (rang: number, cote: number): string => 'b' + rang + '-f' + cote + '-p1';

/**
 * Les requetes du run des facades d'un batiment (rang `rang` dans le batch), une par facade mesuree, et de quoi relire leurs
 * resultats. Une facade sans releve mesure, ou dont l'image ne se prepare pas, n'en a pas. La facade est deja comptee par la requete
 * de la maison : le run n'en ajoute pas au journal.
 */
export async function requetesRunsDuBatiment(e: EntreesPropositions, cle: string, nom: string, rang: number, fab: FabriqueImageRunFacade, place = Infinity): Promise<{ requetes: RequeteAnalyse[]; parId: BatchAnalyse['requetes'] }> {
  const requetes: RequeteAnalyse[] = [];
  const parId: BatchAnalyse['requetes'] = {};
  const b = e.liste.batiments.find((x) => x.cle === cle);
  const vu = e.capture.batiments[cle]?.vu;
  const parement = vu?.murs ? libelleDe(MATERIAUX_MURS_VUS, vu.murs).toLowerCase() : null;
  for (const f of b?.facades ?? []) {
    const m = e.mesures.get(cleMesure(cle, f.cote));
    const r = m?.releve;
    if (!m || !r || requetes.length >= place) continue;
    const img = await fab.elevation(r);
    if (!img) continue;
    const etiquette = (b ? etiquetteFacade(b, f) : f.facade.orientation.toLowerCase()) + ' de ' + nom;
    const texte = texteRunFacade({ etiquette, image: 'elevation', pointes: m.gabarit ? pointesDuGabarit(m.gabarit) : [], parement });
    const id = idRunFacade(rang, f.cote);
    requetes.push({ id, passe: 1, usage: 'facade', facades: 0, contenu: contenuRunFacade(img.image, texte) });
    parId[id] = { cle, passe: 1, cote: f.cote, usage: 'facade', image: { largeur: img.largeur, hauteur: img.hauteur } };
  }
  return { requetes, parId };
}

/** Les runs d'un batch, enregistres facade par facade (`cle#cote`), comme la calibration les garde ; une reponse illisible n'en fait pas. */
export function rangerRuns(lu: ResultatsBatch, requetes: BatchAnalyse['requetes'], le: Date): Record<string, RunEnregistre> {
  const out: Record<string, RunEnregistre> = {};
  for (const r of lu.resultats) {
    const q = requetes[r.id];
    if (!q || q.usage !== 'facade' || q.cote === undefined) continue;
    // Le modele et les versions du run sont les siens (l'usage `facade`), pas ceux de l'analyse des maisons du meme batch.
    const run = runDesResultats({ modele: r.modele ?? lu.modele, prompt: r.prompt ?? lu.prompt, schema: r.schema ?? lu.schema, resultats: [r] }, 1, q.image ?? { largeur: 0, hauteur: 0 }, le);
    if (run) out[cleMesure(q.cle, q.cote)] = run;
  }
  return out;
}

/**
 * Le mur seul d'une texture de releve : la texture couvre `hauteurTexture` metres depuis le sol (le mur, puis la bande au-dessus de
 * l'egout) ; on en garde les `hauteur` metres du bas. C'est l'image du run, et celle ou se lisent les aretes de l'accord.
 */
export function murDeLaTexture(t: Image, r: Pick<ReleveFacade, 'hauteur' | 'hauteurTexture'>): Image {
  const ht = r.hauteurTexture && r.hauteurTexture > r.hauteur ? r.hauteurTexture : r.hauteur;
  const y0 = Math.max(0, Math.min(t.hauteur - 1, Math.round(t.hauteur * (1 - r.hauteur / ht))));
  return { largeur: t.largeur, hauteur: t.hauteur - y0, donnees: t.donnees.slice(y0 * t.largeur * 4) };
}

/** La confiance que Claude se donne sur une facade, en part : il dit faible, moyenne ou forte, jamais un nombre. */
const CONFIANCE_DU_RUN = { faible: 0.5, moyenne: 0.75, forte: 0.9 } as const;

/**
 * L'accord du run de chaque facade avec sa detection, par le moteur de regles : ses boites retrouvees par la detection confirment
 * les ouvertures, celles qui recouvrent une baie devinee la confirment, les seules restent decochees, recalees sur les aretes de
 * l'elevation (decodee de la texture du releve mesure, `decoder`). Une facade sans releve mesure, ou sans reponse lisible, n'a pas
 * de resultat (l'appelant attend les mesures avant, analyseClaude.ts).
 */
export async function accorderLesFacades(runs: Record<string, RunEnregistre>, mesures: ReadonlyMap<string, MesureFacade>, decoder: (dataUrl: string) => Promise<Image | null>): Promise<Record<string, AccordFacadeCapture>> {
  const out: Record<string, AccordFacadeCapture> = {};
  for (const [cle, run] of Object.entries(runs)) {
    const m = mesures.get(cle), r = m?.releve, obs = observationsDuRun(run);
    if (!r || !obs) continue;
    const texture = r.texture ? await decoder(r.texture).catch(() => null) : null;
    const mur = texture ? murDeLaTexture(texture, r) : null;
    const a = accorderOuvertures({ ouvertures: r.ouvertures, decochees: m?.devinees ?? [], observations: obs, cartes: mur ? cartesAretes(mur, mur.largeur / r.largeur) : null, largeurM: r.largeur, hauteurM: r.hauteur });
    // Des boites toutes retrouvees, sans detail de plus, ne changent rien au releve : il n'y a rien a proposer.
    const change = a.bilan.devineesConfirmees + a.bilan.seules + a.bilan.detailsAjoutes > 0;
    out[cle] = { ouvertures: a.ouvertures, decochees: a.decochees, bilan: { ...a.bilan }, resume: change ? texteAccord(a.bilan) : null, confiance: CONFIANCE_DU_RUN[obs.confiance] };
  }
  return out;
}
