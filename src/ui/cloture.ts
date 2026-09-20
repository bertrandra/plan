// La cloture de la parcelle : ou elle est rangee, et ses commandes (spec §3.2, ui/).
//
// La cloture est rattachee a **la parcelle**, pas a un etat global de la Vue 3D : elle se
// sauvegarde ainsi avec le projet, comme les champs Texture d'un objet, et non comme une simple
// preference d'affichage qu'on reperdrait a chaque ouverture.

import type { ObjetPlan } from '../model/types.js';

/**
 * La parcelle qui porte la cloture — et aussi le lieu, l'orthophoto et le PLU.
 *
 * **Deux passes plutot qu'un `find()` a deux criteres**, et c'est le piege : depuis l'import
 * cadastre, les parcelles *voisines* sont elles aussi `fonction === 'terrain'`. Un `find()` unique
 * rendrait la premiere du tableau, donc potentiellement une voisine — et la cloture comme la course
 * du soleil se retrouveraient rattachees au terrain d'a cote.
 */
export function trouverParcelleCloture(objets: ObjetPlan[]): ObjetPlan | undefined {
  return objets.find(o => o.key === 'parcelle') || objets.find(o => o.fonction === 'terrain');
}

/**
 * Remet les commandes de la cloture en accord avec ce que porte la parcelle.
 *
 * Hauteur, couleur et choix de texture sont **desactives** quand la cloture ne l'est pas : regler la
 * couleur d'une cloture absente ne veut rien dire, et la case a cocher reste alors la seule action
 * possible.
 */
export function syncClotureControls(parcelleObj: ObjetPlan): void {
  const cb = document.getElementById('terrasse3dCloture') as HTMLInputElement | null;
  if (!cb) return;
  const hInp = document.getElementById('terrasse3dClotureHauteur') as HTMLInputElement;
  const cInp = document.getElementById('terrasse3dClotureCouleur') as HTMLInputElement;
  const vignette = document.getElementById('terrasse3dClotureTexVignette') as HTMLImageElement;
  const nomSpan = document.getElementById('terrasse3dClotureTexNom')!;
  const texBtn = document.getElementById('terrasse3dClotureTexBtn') as HTMLButtonElement;
  const clearBtn = document.getElementById('terrasse3dClotureTexClear')!;
  cb.checked = !!parcelleObj.clotureActive;
  hInp.value = String((parcelleObj.clotureHauteur !== undefined && parcelleObj.clotureHauteur !== null) ? parcelleObj.clotureHauteur : 1.8);
  cInp.value = parcelleObj.clotureCouleur || '#6b4a2a';
  const tex = parcelleObj.clotureTexture;
  vignette.src = tex ? tex.vignette! : '';
  vignette.style.visibility = tex ? 'visible' : 'hidden';
  nomSpan.textContent = tex ? tex.nom : 'Aucune (couleur unie)';
  clearBtn.style.display = tex ? '' : 'none';
  [hInp, cInp, texBtn].forEach(el => { el.disabled = !cb.checked; });
}
