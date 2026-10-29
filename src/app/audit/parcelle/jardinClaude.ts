// La lecture du jardin par Claude dans l'audit de la parcelle (lot L3 de la lecture IA elargie) : UNE requete par parcelle, dans le
// meme batch que l'analyse des maisons (aucun delai de plus), avec le prompt, le schema et le modele de l'usage `jardin` (Haiku par
// defaut ; le serveur les choisit). L'image est l'orthophoto recadree sur la parcelle (render/imagesAnalyse.ts, `dessinerOrthoJardin`),
// et les photos de la cloture et du portail de la capture, s'il y en a, l'accompagnent.
//
// Ce qui revient est ENREGISTRE (src/regles/jardin/observations.ts, `RunJardin`) avec ce qui l'a produit : la reponse brute, les
// versions du prompt et du schema, le modele, les tokens et le cout, l'image exacte envoyee et son cadrage. Les propositions se
// recalculent ensuite sans reseau (app/regles/jardin.ts) : le moteur relit la reponse a chaque calcul.

import { lireObservationsJardin, texteJardin, type RunJardin } from '../../../regles/jardin/observations.js';
import { empreinteReglagesJardin } from '../../../regles/jardin/reglages.js';
import { REGLAGES_JARDIN } from '../../regles/jardin.js';
import { estBati, estTerrain, parcelleDuProjet } from '../../../model/fonctions.js';
import { estOuvrage, LIBELLES, AUTRE, LIMITE, POINT_DE_VUE } from '../../../model/ouvrages/index.js';
import type { BlocAnalyse, RequeteAnalyse, ResultatsBatch } from '../../../io/analyseClaude.js';
import type { BatchAnalyse } from '../../../model/auditParcelle.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';
import type { ImageAnalyse } from '../../../render/imagesAnalyse.js';
import type { PhotoCas } from '../../../model/audit.js';
import type { EntreesPropositions } from './propositions.js';
import { ortho } from '../../../render/ortho.js';
import { dessinerOrthoJardin, reduirePhotoAnalyse } from '../../../render/imagesAnalyse.js';

/** L'identifiant de la requete du jardin dans le batch (`[A-Za-z0-9_-]`). */
const ID_REQUETE_JARDIN = 'jardin-p1';
/** Les photos de la cloture et du portail jointes, au plus : elles aident a reconnaitre, la photo aerienne place. */
const PHOTOS_JARDIN_MAX = 4;

/** Qui dessine les images du jardin : le navigateur, ou un simulacre dans les tests. */
export interface FabriqueImagesJardin {
  /** L'orthophoto recadree sur la parcelle, les batiments traces, et son cadrage ; null sans tuile. */
  ortho(parcelle: readonly PtBrut[], batiments: readonly (readonly PtBrut[])[]): Promise<{ image: Pick<ImageAnalyse, 'base64' | 'mediaType' | 'largeur' | 'hauteur'>; cadrage: RunJardin['cadrage'] } | null>;
  /** Une photo de la capture, reduite ; null si elle ne se lit pas. */
  photo(p: PhotoCas): Promise<{ base64: string; mediaType: 'image/jpeg' | 'image/png' } | null>;
}

/** Ce que le plan porte deja dans le jardin, en clair et compte par sorte : « 2 arbres, 1 chemin ». */
function dejaDansLeJardin(objets: readonly ObjetPlan[]): string[] {
  const n = new Map<string, number>();
  for (const o of objets) {
    if (estTerrain(o) || estBati(o) || o.voisinage || !o.fonction || [AUTRE, LIMITE, POINT_DE_VUE].some((ouv) => estOuvrage(o, ouv))) continue;
    const nom = (LIBELLES[o.fonction] ?? o.fonction).toLowerCase();
    n.set(nom, (n.get(nom) ?? 0) + 1);
  }
  return [...n].map(([nom, k]) => k + ' ' + nom + (k > 1 && !nom.endsWith('s') ? 's' : ''));
}

/**
 * La requete de la lecture du jardin, et ce qu'il faut garder pour enregistrer sa reponse ; null sans parcelle du projet ou sans
 * orthophoto sous elle (rien a regarder).
 */
export async function preparerJardin(e: EntreesPropositions, fab: FabriqueImagesJardin): Promise<{ requete: RequeteAnalyse; envoi: NonNullable<BatchAnalyse['jardin']> } | null> {
  const parcelle = parcelleDuProjet(e.objets as ObjetPlan[]);
  if (!parcelle || parcelle.type !== 'polygon' || parcelle.pts.length < 3) return null;
  const batiments = e.liste.batiments.flatMap((b) => { const o = e.objets.find((x) => x.key === b.cle); return o && o.type === 'polygon' ? [o.pts] : []; });
  const ortho = await fab.ortho(parcelle.pts, batiments);
  if (!ortho) return null;
  const contenu: BlocAnalyse[] = [{ type: 'image', source: { type: 'base64', media_type: ortho.image.mediaType, data: ortho.image.base64 } }];
  let photos = 0;
  for (const p of [...e.capture.cloture.photos, ...e.capture.portail.photos]) {
    if (photos >= PHOTOS_JARDIN_MAX) break;
    const img = await fab.photo(p);
    if (!img) continue;
    contenu.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
    photos++;
  }
  const texte = texteJardin({ coteM: ortho.cadrage.coteM, dejaLa: dejaDansLeJardin(e.objets), photos });
  contenu.push({ type: 'text', text: texte });
  return {
    requete: { id: ID_REQUETE_JARDIN, passe: 1, usage: 'jardin', facades: 0, contenu },
    envoi: { image: { ...ortho.image }, cadrage: ortho.cadrage, photos, texte, reglages: empreinteReglagesJardin(REGLAGES_JARDIN) },
  };
}

/** La lecture enregistree d'un batch : sa requete reussie et lisible, avec ce qui l'a produite ; null sinon. */
export function runJardinDesResultats(lu: Pick<ResultatsBatch, 'modele' | 'prompt' | 'schema' | 'resultats'>, envoi: NonNullable<BatchAnalyse['jardin']>, le: Date): RunJardin | null {
  const r = lu.resultats.find((x) => x.id === ID_REQUETE_JARDIN && x.statut === 'reussi' && lireObservationsJardin(x.sortie));
  if (!r) return null;
  const t = r.tokens;
  return {
    le: le.toISOString(), modele: r.modele ?? lu.modele, prompt: r.prompt ?? lu.prompt, schema: r.schema ?? lu.schema, sortie: r.sortie,
    cout: typeof r.cout === 'number' ? r.cout : null,
    tokens: { entree: (t?.entree ?? 0) + (t?.ecritureCache ?? 0) + (t?.lectureCache ?? 0), sortie: t?.sortie ?? 0 },
    ...envoi,
  };
}

/** Les images du jardin dans le navigateur : les tuiles du fond orthophoto deja chargees, et les photos reduites. */
export function fabriqueJardinNavigateur(): FabriqueImagesJardin {
  return {
    ortho: (parcelle, batiments) => dessinerOrthoJardin([...ortho.tuiles, ...ortho.tuilesLarges], parcelle, batiments),
    photo: (p) => reduirePhotoAnalyse(p.base64),
  };
}
