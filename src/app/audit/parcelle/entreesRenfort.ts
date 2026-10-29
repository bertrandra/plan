// Le renfort de Claude dans l'audit de la parcelle (MD/spec-facades-calage-detection.md §12 bis,
// « Quand » : avec le batch de la phase 2, sans delai de plus ; lot L18). Pendant les premiers
// audits, chaque facade relevee par les mesures du telephone recoit le renfort, signal ou non, pour
// mesurer son apport (decision D11) : trois requetes par facade, dans le meme batch que l'analyse de
// la maison, avec leur propre prompt et leur propre schema (choisis par le serveur, usage `renfort`).
//
// A la lecture des resultats, les graines sont recalees sur l'elevation de la facade (decodee de sa
// texture) et le resultat est garde dans la capture : les propositions se recalculent ensuite sans
// image (propositionsClaude.ts, `propositionsRenfort`).

import { PASSES_RENFORT, estReponseRenfort, signauxRenfort, texteRenfort, voterRenfort, RENFORT_A_CHAQUE_FACADE, type ReponseRenfort } from '../../../facade/detection/renfort.js';
import { appliquerRenfort, cartesAretes, texteBilan } from '../../../facade/detection/renfortRecalage.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import { etiquetteFacade } from './liste.js';
import type { BlocAnalyse, RequeteAnalyse, ResultatBatch } from '../../../io/analyseClaude.js';
import type { BatchAnalyse, RenfortFacadeCapture } from '../../../model/auditParcelle.js';
import type { PhotoCas } from '../../../model/audit.js';
import type { P2, Image } from '../../../facade/vision/homographie.js';
import type { ReleveFacade } from '../../../model/types.js';
import type { MesureFacade } from './mesures.js';

interface ImageRenfort { base64: string; mediaType: 'image/jpeg' | 'image/png' }

/**
 * Le contenu d'une requete du renfort : la photo et sa grille (image 1), l'elevation graduee (image 2), puis le texte. Les trois
 * passes recoivent exactement ce contenu. (Venu du releve, qui passe au run d'une facade au lot F2 : seul l'audit a encore le
 * renfort a trois passes, jusqu'a ce qu'il passe a son tour par l'enchainement, lot F3.)
 */
function contenuRenfort(photo: ImageRenfort, elevation: ImageRenfort, texte: string): BlocAnalyse[] {
  const bloc = (i: ImageRenfort): BlocAnalyse => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } });
  return [bloc(photo), { type: 'text', text: 'Image 1 : la photo de la façade, avec la grille de repères (colonnes et lignes de 0 à 10) et le quadrilatère du mur selon Plan.' },
    bloc(elevation), { type: 'text', text: 'Image 2 : l’élévation redressée du mur, graduée en mètres, ouvertures détectées par Plan numérotées.' }, { type: 'text', text: texte }];
}

/** Les requetes d'une facade, une par passe : `prefixe-p1` a `prefixe-p3`. La facade est deja comptee par la requete de la maison. */
function requetesRenfort(prefixe: string, contenu: BlocAnalyse[]): RequeteAnalyse[] {
  return Array.from({ length: PASSES_RENFORT }, (_, i) => ({ id: prefixe + '-p' + (i + 1), passe: (i + 1) as 1 | 2 | 3, usage: 'renfort' as const, facades: 0, contenu }));
}

/** Qui dessine les deux images du renfort d'une facade de l'audit : la photo du releve et sa grille, l'elevation graduee. */
export interface FabriqueImagesRenfortAudit {
  photo(p: PhotoCas, coins: readonly P2[], coinsTrouves: boolean): Promise<ImageRenfort | null>;
  elevation(r: ReleveFacade): Promise<ImageRenfort | null>;
}

/** L'identifiant des requetes du renfort d'une facade (`[A-Za-z0-9_-]`) : le rang du batiment et le cote. */
export const prefixeRenfort = (rang: number, cote: number): string => 'b' + rang + '-f' + cote;

/** Faut-il le renfort sur cette facade ? A chaque facade pendant les premiers audits, sinon sur signal. */
export function renfortUtile(m: MesureFacade): boolean {
  if (!m.releve) return false;
  if (RENFORT_A_CHAQUE_FACADE) return true;
  return signauxRenfort({ calage: { note: m.confiance ?? 0, trouve: m.coinsTrouves, sources: m.releve.calage?.photos[0]?.sourceCoins ?? [] }, ouvertures: m.releve.ouvertures, largeurM: m.releve.largeur }).length > 0;
}

/**
 * Les requetes du renfort des facades d'un batiment (rang `rang` dans le batch), et de quoi relire
 * leurs resultats. Une facade sans releve mesure, ou dont une image ne se prepare pas, n'en a pas.
 */
export async function requetesRenfortDuBatiment(e: EntreesPropositions, cle: string, nom: string, rang: number, fab: FabriqueImagesRenfortAudit, place = Infinity): Promise<{ requetes: RequeteAnalyse[]; parId: BatchAnalyse['requetes'] }> {
  const requetes: RequeteAnalyse[] = [];
  const parId: BatchAnalyse['requetes'] = {};
  const b = e.liste.batiments.find((x) => x.cle === cle);
  for (const f of b?.facades ?? []) {
    const m = e.mesures.get(cleMesure(cle, f.cote));
    const r = m?.releve;
    const photo = m && m.rangReleve !== null ? e.capture.batiments[cle]?.facades[String(f.cote)]?.photos[m.rangReleve] : undefined;
    if (!m || !r || !photo || !renfortUtile(m)) continue;
    if (requetes.length + PASSES_RENFORT > place) break;
    const imgPhoto = await fab.photo(photo, r.calage?.photos[0]?.coins ?? [], m.coinsTrouves);
    const imgElev = await fab.elevation(r);
    if (!imgPhoto || !imgElev) continue;
    const signaux = signauxRenfort({ calage: { note: m.confiance ?? 0, trouve: m.coinsTrouves, sources: r.calage?.photos[0]?.sourceCoins ?? [] }, ouvertures: r.ouvertures, largeurM: r.largeur });
    const etiquette = (b ? etiquetteFacade(b, f) : f.facade.orientation.toLowerCase()) + ' de ' + nom;
    const texte = texteRenfort({ largeurM: r.largeur, hauteurM: r.hauteur, hauteurMesuree: m.hauteurM !== null, ouvertures: r.ouvertures, grille: r.grille ?? null, signaux, coinsTrouves: m.coinsTrouves, etiquette });
    // La facade est deja comptee par la requete de la maison : le renfort n'en ajoute pas au journal.
    for (const q of requetesRenfort(prefixeRenfort(rang, f.cote), contenuRenfort(imgPhoto, imgElev, texte))) {
      requetes.push(q);
      parId[q.id] = { cle, passe: q.passe, cote: f.cote, usage: 'renfort' };
    }
  }
  return { requetes, parId };
}

/** Les reponses du renfort d'un batch, rangees par facade (`cle#cote`), dans l'ordre des passes. */
export function rangerRenfort(resultats: readonly ResultatBatch[], requetes: BatchAnalyse['requetes']): Record<string, ReponseRenfort[]> {
  const out: Record<string, { passe: number; sortie: ReponseRenfort }[]> = {};
  for (const r of resultats) {
    const q = requetes[r.id];
    if (!q || q.usage !== 'renfort' || q.cote === undefined || r.statut !== 'reussi' || !estReponseRenfort(r.sortie)) continue;
    (out[cleMesure(q.cle, q.cote)] ??= []).push({ passe: q.passe, sortie: r.sortie });
  }
  return Object.fromEntries(Object.entries(out).map(([k, l]) => [k, l.sort((a, z) => a.passe - z.passe).map((x) => x.sortie)]));
}

/**
 * Le mur seul d'une texture de releve : la texture couvre `hauteurTexture` metres depuis le sol (le
 * mur, puis la bande au-dessus de l'egout) ; on en garde les `hauteur` metres du bas.
 */
export function murDeLaTexture(t: Image, r: Pick<ReleveFacade, 'hauteur' | 'hauteurTexture'>): Image {
  const ht = r.hauteurTexture && r.hauteurTexture > r.hauteur ? r.hauteurTexture : r.hauteur;
  const y0 = Math.max(0, Math.min(t.hauteur - 1, Math.round(t.hauteur * (1 - r.hauteur / ht))));
  return { largeur: t.largeur, hauteur: t.hauteur - y0, donnees: t.donnees.slice(y0 * t.largeur * 4) };
}

/**
 * Le renfort applique a chaque facade : vote des passes, recalage des graines sur l'elevation
 * (decodee de la texture du releve mesure), resultat pret a proposer. `decoder` rend les pixels d'une
 * image `data:` ; une facade sans texture lisible garde ses graines en pointille, une facade sans
 * releve mesure n'a pas de resultat (l'appelant attend les mesures avant, analyseClaude.ts).
 */
export async function renforcerFacades(parFacade: Record<string, ReponseRenfort[]>, mesures: ReadonlyMap<string, MesureFacade>, decoder: (dataUrl: string) => Promise<Image | null>): Promise<Record<string, RenfortFacadeCapture>> {
  const out: Record<string, RenfortFacadeCapture> = {};
  for (const [cle, reponses] of Object.entries(parFacade)) {
    const m = mesures.get(cle), r = m?.releve;
    if (!r || !reponses.length) continue;
    const texture = r.texture ? await decoder(r.texture).catch(() => null) : null;
    const mur = texture ? murDeLaTexture(texture, r) : null;
    // Les baies devinees du releve : une boite manquee de Claude au meme endroit les confirme, au lieu
    // d'ajouter une seconde baie sur la premiere (le releve fait de meme, zones/releve/aide.ts).
    const res = appliquerRenfort({ ouvertures: r.ouvertures, decochees: m?.devinees ?? [], vote: voterRenfort(reponses), cartes: mur ? cartesAretes(mur, mur.largeur / r.largeur) : null, largeurM: r.largeur, hauteurM: r.hauteur });
    out[cle] = { passes: reponses.length, ouvertures: res.ouvertures, decochees: res.decochees, bilan: { ...res.bilan }, resume: texteBilan(res.bilan) };
  }
  return out;
}
