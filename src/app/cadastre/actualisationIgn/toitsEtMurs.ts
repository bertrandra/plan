// L actualisation IGN : la couverture, les volumes, les toits lus au LiDAR et la couleur des murs des batiments relus.
// Un morceau de app/cadastre/actualisationIgn.ts, qui le reexporte : le reste du programme importe depuis lui.

import { etape, type ContexteActualisation } from './progression.js';
import { volumesParDefaut } from '../../../model/volumesToit.js';
import { couleursToitsDepuisOrtho } from '../../../render/couleurToitOrtho.js';
import { toitsDepuisLidar, texteBilanToitsLidar } from '../../toits/toitsLidar.js';
import { couleursMursDepuisPhotos, texteBilanCouleursMurs } from '../../../render/couleurMurPhoto.js';
import { materiauMurs } from '../../../model/couleurMur.js';
import { estVerifieSurPlace } from '../../../model/toitVerifie.js';
import type { ProjecteurLocal } from '../../../geo/projection.js';
import type { ObjetBrut, PtBrut, Toit, VolumeToit } from '../../../model/types.js';
import type { OptionsActualisation } from '../optionsActualisation.js';
import { champsBatiment } from '../../../model/champsFonction.js';

/**
 * La couverture des toits, lue sur l'orthophoto (MD/spec-toit-ign.md §6.1) : une couleur choisie par
 * l'utilisateur n'est pas touchee ; un WMTS injoignable laisse les toits tels quels.
 */
async function couleursDesToits(objets: ObjetBrut[], proj: ProjecteurLocal, bilan: string[]): Promise<void> {
  etape('la couleur des toits sur l’orthophoto…');
  const c = await couleursToitsDepuisOrtho(objets, proj).catch(() => null);
  if(!c || !(c.lus + c.replis)) return;
  bilan.push(c.lus + ' couleur(s) de toit lue(s) sur l\'orthophoto' +
    (c.replis ? ', ' + c.replis + ' couverture(s) rouge, brune ou grise faute de photo lisible' : ''));
}

/**
 * Un toit recalcule sur la parcelle du projet retrouve ses volumes par defaut, et perd son toit
 * mesure, qui suivait l'ancien contour (le LiDAR relit les deux ensuite) ; sinon rien a ecrire.
 */
export function volumesRecalcules(o: { batiment?: { toit?: Toit | null } | null; bdtopo?: unknown }, pts: PtBrut[], toit: Toit | undefined): VolumeToit[] | null | undefined {
  if (!toit || toit === o.batiment?.toit || (o.bdtopo as { surParcellePrincipale?: unknown } | undefined)?.surParcellePrincipale !== true) return undefined;
  return volumesParDefaut(pts, toit);
}

/**
 * Les batiments verifies sur place que cette actualisation garde tels quels : tous, sauf si
 * l'utilisateur a demande de les recalculer. Avec eux, les identifiants BD TOPO qu'ils portent : un
 * batiment frais de la parcelle qui les porte n'est pas recree a cote d'eux.
 */
export function batimentsGardes(objets: readonly ObjetBrut[], options: OptionsActualisation): { garde: (o: ObjetBrut) => boolean; ids: ReadonlySet<string> } {
  const garde = (o: ObjetBrut) => o.batiment?.toitFige === true || (options.verifies !== 'relire' && estVerifieSurPlace(o.batiment));
  const ids = new Set(objets.filter(garde).map(o => (o.bdtopo as { id?: string } | null | undefined)?.id).filter((id): id is string => !!id));
  return { garde, ids };
}

/** Ce qu'une lecture poserait sur un batiment garde (couleur du toit, couleur des murs), remis apres elle : rend la remise. */
function figer(o: ObjetBrut): () => void {
  const toit = structuredClone(o.batiment?.toit), couleurMurs = structuredClone(o.batiment?.couleurMurs);
  return () => {
    if (toit === undefined) delete o.batiment?.toit; else champsBatiment(o).toit = toit;
    if (couleurMurs === undefined) delete o.batiment?.couleurMurs; else champsBatiment(o).couleurMurs = couleurMurs;
  };
}

/**
 * La couverture des toits, leur forme, puis la couleur des murs, qui lit la hauteur a l'egout corrigee
 * par le LiDAR. Un batiment garde (verifie sur place) ressort tel qu'il est entre.
 */
export async function toitsEtMurs(objets: ObjetBrut[], proj: ProjecteurLocal, bilan: string[], ctx: ContexteActualisation, options: OptionsActualisation): Promise<void> {
  const remises = objets.filter(batimentsGardes(objets, options).garde).map(figer);
  await couleursDesToits(objets, proj, bilan);
  await formesDesToits(objets, proj, bilan, ctx, options.verifies);
  await couleursDesMurs(objets, proj, bilan, ctx);
  remises.forEach(remettre => remettre());
}

/**
 * La couleur des murs (render/couleurMurPhoto.ts) : lue sur les photos de rue, sinon le materiau des
 * fichiers fonciers, lu avec le batiment ; un service muet laisse les couleurs en place.
 */
async function couleursDesMurs(objets: ObjetBrut[], proj: ProjecteurLocal, bilan: string[], ctx: ContexteActualisation): Promise<void> {
  etape('la couleur des murs sur les photos de rue…');
  const b = await (ctx.couleursMurs ?? couleursMursDepuisPhotos)(objets, proj).catch(() => null);
  const materiaux = objets.filter((o) => o.fonction === 'batiment' && materiauMurs((o.bdtopo as { materiauxMurs?: unknown } | null | undefined)?.materiauxMurs)).length;
  const texte = texteBilanCouleursMurs(b, materiaux);
  if (texte) bilan.push(texte);
}

/** La forme des toits, ajustee sur le LiDAR HD (app/toits/toitsLidar.ts) : un service muet laisse les toits BD TOPO. */
async function formesDesToits(objets: ObjetBrut[], proj: ProjecteurLocal, bilan: string[], ctx: ContexteActualisation, verifies: OptionsActualisation['verifies']): Promise<void> {
  etape('la forme des toits sur le LiDAR HD…');
  const b = await (ctx.toitsLidar ?? toitsDepuisLidar)(objets, proj, { verifies: verifies ?? 'garder' }).catch(() => null);
  const texte = b && texteBilanToitsLidar(b);
  if(texte) bilan.push(texte);
}
