// L actualisation IGN : la couverture, les volumes, les toits lus au LiDAR et la couleur des murs des batiments relus ; et ce
// qu'elle garde tel quel (batiments verifies sur place, objets retouches a la main).
// Un morceau de app/cadastre/actualisationIgn.ts, qui le reexporte : le reste du programme importe depuis lui.

import { etape, type ContexteActualisation } from './progression.js';
import { volumesParDefaut } from '../../../model/volumesToit.js';
import { couleursToitsDepuisOrtho } from '../../../render/couleurToitOrtho.js';
import { toitsDepuisLidar, texteBilanToitsLidar } from '../../toits/toitsLidar.js';
import { couleursMursDepuisPhotos, texteBilanCouleursMurs } from '../../../render/couleurMurPhoto.js';
import { materiauMurs } from '../../../model/couleurMur.js';
import { peutEcrire, type ContexteEcriture } from '../../../model/protections.js';
import { estRetoucheMain, libelleReprendre } from '../../../model/retouche.js';
import type { ProjecteurLocal } from '../../../geo/projection.js';
import type { ObjetBrut, ObjetPlan, PtBrut, Toit, VolumeToit } from '../../../model/types.js';
import type { OptionsActualisation } from '../optionsActualisation.js';

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
 * Les objets que cette actualisation garde tels quels : les batiments verifies sur place, sauf si
 * l'utilisateur a demande de les recalculer, et les objets retouches a la main (parcelle comprise,
 * model/retouche.ts), sauf ceux dont il reprend la version de l'IGN. Avec eux, les identifiants BD TOPO
 * qu'ils portent : un batiment frais de la parcelle qui les porte n'est pas recree a cote d'eux.
 */
export function batimentsGardes(objets: readonly ObjetBrut[], options: OptionsActualisation): { garde: (o: ObjetBrut) => boolean; ids: ReadonlySet<string> } {
  // Garde entier : l'actualisation n'a pas le droit d'en ecrire le contour (model/protections.ts).
  const garde = (o: ObjetBrut) => !peutEcrire(o, 'ign', 'contour', contexteActualisation(o, options));
  const ids = new Set(objets.filter(garde).map(o => (o.bdtopo as { id?: string } | null | undefined)?.id).filter((id): id is string => !!id));
  return { garde, ids };
}

/** Ce que la personne a demande a cette actualisation pour cet objet : « Recalculer aussi » les verifies, reprendre la version de l'IGN. */
export function contexteActualisation(o: ObjetBrut, options: OptionsActualisation): ContexteEcriture {
  return { relireVerifies: options.verifies === 'relire', reprendreIgn: (options.reprendre ?? []).includes(o.key as string) };
}

/**
 * Les objets venus du cadastre ou de l'IGN que la personne a retouches a la main (model/retouche.ts) : l'actualisation les garde
 * tels quels, sauf ceux dont elle coche « Reprendre la version de l'IGN ». La parcelle du projet d'abord, puis l'ordre du plan.
 */
export function objetsRetouches(objets: readonly ObjetPlan[]): { cle: string; libelle: string }[] {
  return objets.filter(estRetoucheMain).sort((a, b) => Number(b.key === 'parcelle') - Number(a.key === 'parcelle'))
    .map(o => ({ cle: o.key, libelle: libelleReprendre(o) }));
}

/** Un objet repris a sa source perd le marque de sa retouche (un objet frais n'en a pas). */
export function sansRetouche<T extends ObjetBrut>(o: T): T {
  if (!estRetoucheMain(o)) return o;
  const copie = { ...o };
  delete copie.retoucheMain;
  return copie;
}

/**
 * Ce que les lectures qui suivent poseraient sur un batiment garde (couleur du toit, forme lue au LiDAR, couleur des murs), remis
 * apres elles : rend la remise. L'actualisation n'a le droit de rien ecrire sur lui (model/protections.ts) : il ressort tel que la
 * personne l'a laisse, son toit et sa hauteur compris.
 */
function figer(o: ObjetBrut): () => void {
  const batiment = structuredClone(o.batiment), elevation = o.elevation;
  return () => { if (batiment === undefined) delete o.batiment; else o.batiment = batiment; if (elevation === undefined) delete o.elevation; else o.elevation = elevation; };
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
