// Le run d'une facade par Claude dans l'audit de la parcelle (MD/spec-facade-calage-audit.md §8, lot F3) : trois passes par facade
// mesuree (`facades.ia.passes`, decision du 29 octobre 2026), votees par le moteur, dans le meme batch que l'analyse des maisons
// (aucun delai de plus), avec le prompt, le schema et le modele de l'usage `facade` (le serveur les choisit). Le meme run que la
// calibration et le releve (app/releve/runFacade.ts) : meme contenu, meme reponse enregistree (versions, modele, tokens, cout). Le vote
// ne coche rien : une boite n'est cochee que si la detection la retrouve. L'escalade, a la demande, part du meme contenu
// (`contenuDeLaFacade`).
//
// Claude propose, le moteur decide (decision du proprietaire) : la reponse n'est lue que par les regles des facades
// (facade/regles/facades/ia.ts, `accorderOuvertures`) ; le resultat est garde dans la capture, et les propositions se recalculent
// ensuite sans image (propositionsClaude.ts, `propositionsAccords`). Chaque facade photographiee est lue (decision D11 : pendant les
// premiers audits, toutes, pour mesurer l'apport de Claude) ; une facade sans releve mesure n'a pas de requete.
//
// La lecture enrichie (lot L1, usage `facade-enrichie`, decision du proprietaire du 30 octobre 2026) part dans le meme batch, sur le
// meme contenu, en autant de passes : ses requetes ne prennent que la place que les runs laissent, et sa reponse s'enregistre avec le
// run (`enrichie`), sans rien changer a ce que le run lit.

import { contenuRunFacade, enrichieDesResultats, runDesResultats } from '../../releve/runFacade.js';
import type { BlocAnalyse } from '../../../io/analyseClaude.js';
import { texteRunFacade, type RunEnregistre } from '../../../regles/facades/observations.js';
import { accorderOuvertures, observationsDuRun, passesDeProduction, texteAccord } from '../../../facade/regles/facades/ia.js';
import { cartesAretes } from '../../../facade/detection/recalageIa.js';
import { descentesRetrouvees } from '../../../facade/regles/facades/modenature.js';
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
import type { ImageDuRun } from '../../../facade/releve/imageDuRun.js';

/**
 * L'image d'une facade pour son run, et sa taille avant reduction (la reponse enregistree la garde) ; `egoutPart` : l'egout sur elle, en
 * part de sa hauteur depuis le bas, quand elle montre aussi la bande au-dessus de lui (lot F7).
 */
export interface ImageRunFacade { image: Pick<ImageAnalyse, 'base64' | 'mediaType'>; largeur: number; hauteur: number; egoutPart?: number }

/**
 * Qui dessine l'image du run d'une facade de l'audit : la photo du releve redressee jusqu'au haut de la facade (`imageRun` de la mesure,
 * lot F7), sinon (une mesure relue d'un fichier) le mur seul, decoupe dans la texture de son releve mesure.
 */
export interface FabriqueImageRunFacade { elevation(r: ReleveFacade, imageRun: ImageDuRun | null): Promise<ImageRunFacade | null> }

/** L'identifiant d'une passe du run d'une facade (`[A-Za-z0-9_-]`) : le rang du batiment, le cote, la passe ; `e` pour la lecture enrichie. */
const idRunFacade = (rang: number, cote: number, passe: number, enrichie = false): string => 'b' + rang + '-f' + cote + (enrichie ? '-e' : '-p') + passe;

/** Ce que le run d'une facade envoie : son contenu (l'elevation, le texte) et la taille de l'image. Null sans releve mesure ou sans image. */
export async function contenuDeLaFacade(e: EntreesPropositions, cle: string, cote: number, nom: string, fab: FabriqueImageRunFacade): Promise<{ contenu: BlocAnalyse[]; image: { largeur: number; hauteur: number } } | null> {
  const b = e.liste.batiments.find((x) => x.cle === cle);
  const f = b?.facades.find((x) => x.cote === cote);
  const m = e.mesures.get(cleMesure(cle, cote));
  const r = m?.releve;
  if (!f || !m || !r) return null;
  const img = await fab.elevation(r, m.imageRun ?? null);
  if (!img) return null;
  const vu = e.capture.batiments[cle]?.vu;
  const parement = vu?.murs ? libelleDe(MATERIAUX_MURS_VUS, vu.murs).toLowerCase() : null;
  const etiquette = (b ? etiquetteFacade(b, f) : f.facade.orientation.toLowerCase()) + ' de ' + nom;
  const texte = texteRunFacade({ etiquette, image: img.egoutPart !== undefined ? 'elevationBande' : 'elevation', pointes: m.gabarit ? pointesDuGabarit(m.gabarit) : [], parement, ...(img.egoutPart !== undefined ? { egoutPart: img.egoutPart } : {}) });
  return { contenu: contenuRunFacade(img.image, texte), image: { largeur: img.largeur, hauteur: img.hauteur } };
}

/**
 * Les requetes du run des facades d'un batiment (rang `rang` dans le batch) : `passes` par facade mesuree (le reglage de production),
 * meme contenu, et de quoi relire leurs resultats. Une facade sans releve mesure, dont l'image ne se prepare pas, ou dont les passes ne
 * tiennent plus dans la place du batch, n'en a pas. La facade est deja comptee par la requete de la maison : le run n'en ajoute pas.
 * `enrichies` : les requetes de la lecture enrichie de ces memes facades (lot L1), que l'appelant n'ajoute qu'avec la place qui reste
 * une fois les runs de tous les batiments places (elles ne prennent jamais la place d'un run).
 */
export async function requetesRunsDuBatiment(e: EntreesPropositions, cle: string, nom: string, rang: number, fab: FabriqueImageRunFacade, place = Infinity, passes: 1 | 2 | 3 = passesDeProduction()): Promise<{ requetes: RequeteAnalyse[]; parId: BatchAnalyse['requetes']; enrichies: { requetes: RequeteAnalyse[]; parId: BatchAnalyse['requetes'] }[] }> {
  const requetes: RequeteAnalyse[] = [];
  const parId: BatchAnalyse['requetes'] = {};
  const enrichies: { requetes: RequeteAnalyse[]; parId: BatchAnalyse['requetes'] }[] = [];
  for (const f of e.liste.batiments.find((x) => x.cle === cle)?.facades ?? []) {
    if (requetes.length + passes > place) continue;
    const c = await contenuDeLaFacade(e, cle, f.cote, nom, fab);
    if (!c) continue;
    const enrichie: { requetes: RequeteAnalyse[]; parId: BatchAnalyse['requetes'] } = { requetes: [], parId: {} };
    for (let p = 1; p <= passes; p++) {
      const id = idRunFacade(rang, f.cote, p);
      requetes.push({ id, passe: p as 1 | 2 | 3, usage: 'facade', facades: 0, contenu: c.contenu });
      parId[id] = { cle, passe: p, cote: f.cote, usage: 'facade', image: c.image };
      const ide = idRunFacade(rang, f.cote, p, true);
      enrichie.requetes.push({ id: ide, passe: p as 1 | 2 | 3, usage: 'facade-enrichie', facades: 0, contenu: c.contenu });
      enrichie.parId[ide] = { cle, passe: p, cote: f.cote, usage: 'facade-enrichie' };
    }
    enrichies.push(enrichie);
  }
  return { requetes, parId, enrichies };
}

/**
 * Les runs d'un batch, enregistres facade par facade (`cle#cote`), comme la calibration les garde : les passes d'une facade ensemble,
 * leur nombre celui des requetes envoyees ; une facade sans aucune reponse lisible n'en a pas.
 */
export function rangerRuns(lu: ResultatsBatch, requetes: BatchAnalyse['requetes'], le: Date): Record<string, RunEnregistre> {
  type Groupe = { resultats: ResultatsBatch['resultats']; envoyees: number; image: { largeur: number; hauteur: number } };
  const parFacade = new Map<string, Groupe>(), enrichies = new Map<string, Groupe>();
  const groupe = (m: Map<string, Groupe>, k: string, image?: { largeur: number; hauteur: number }): Groupe => {
    const g = m.get(k) ?? { resultats: [], envoyees: 0, image: image ?? { largeur: 0, hauteur: 0 } };
    m.set(k, g);
    return g;
  };
  for (const q of Object.values(requetes)) {
    if (q.cote === undefined) continue;
    if (q.usage === 'facade') groupe(parFacade, cleMesure(q.cle, q.cote), q.image).envoyees++;
    else if (q.usage === 'facade-enrichie') groupe(enrichies, cleMesure(q.cle, q.cote)).envoyees++;
  }
  for (const r of lu.resultats) {
    const q = requetes[r.id];
    if (q?.cote === undefined) continue;
    const m = q.usage === 'facade' ? parFacade : q.usage === 'facade-enrichie' ? enrichies : null;
    m?.get(cleMesure(q.cle, q.cote))?.resultats.push(r);
  }
  const passes = (g: Groupe) => Math.min(3, Math.max(1, g.envoyees)) as 1 | 2 | 3;
  const out: Record<string, RunEnregistre> = {};
  for (const [k, g] of parFacade) {
    const r0 = g.resultats[0];
    if (!r0) continue;
    // Le modele et les versions du run sont les siens (l'usage `facade`), pas ceux de l'analyse des maisons du meme batch.
    const run = runDesResultats({ modele: r0.modele ?? lu.modele, prompt: r0.prompt ?? lu.prompt, schema: r0.schema ?? lu.schema, resultats: g.resultats }, passes(g), g.image, le);
    // La lecture enrichie de la meme facade (lot L1), quand elle est partie : ses passes lisibles, ou ce qui l'a empechee.
    const e = enrichies.get(k);
    if (run) out[k] = e ? { ...run, enrichie: enrichieDesResultats({ modele: lu.modele, prompt: lu.prompt, schema: lu.schema, resultats: e.resultats }, passes(e), le) } : run;
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
    const cartes = mur ? cartesAretes(mur, mur.largeur / r.largeur) : null;
    const a = accorderOuvertures({ ouvertures: r.ouvertures, decochees: m?.devinees ?? [], observations: obs, cartes, largeurM: r.largeur, hauteurM: r.hauteur });
    // Des boites toutes retrouvees, sans detail de plus, ne changent rien au releve : il n'y a rien a proposer.
    const change = a.bilan.devineesConfirmees + a.bilan.seules + a.bilan.detailsAjoutes > 0;
    // Les descentes que Claude voit, retenues seulement la ou la detection voit une verticale (lot L1, regle des descentes).
    const descentes = descentesRetrouvees(obs.modenature?.descentes ?? [], cartes, r.largeur);
    out[cle] = { ouvertures: a.ouvertures, decochees: a.decochees, bilan: { ...a.bilan }, resume: change ? texteAccord(a.bilan) : null, confiance: CONFIANCE_DU_RUN[obs.confiance], ...(descentes.length ? { descentes } : {}) };
  }
  return out;
}
