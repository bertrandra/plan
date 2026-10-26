// Les toits branches sur le plan (app/boot/branchements.ts) : le mode Toit de la Vue 3D (session, Regles, catalogue), la lecture
// des toits en tache de fond et l'essai des faits (`?regles=local`).

import { terrasseCourante } from '../../core/contexteTerrasse.js';
import { brancherToitCatalogue } from '../ecouteurs/toitCatalogue.js';
import { brancherToitsFond } from '../ecouteurs/toitsFond.js';
import { brancherFaitsLocaux } from '../ecouteurs/faitsLocaux.js';
import { vue3d } from '../../three/etat3d.js';
import type { Atelier } from '../atelier.js';
import type { Plan, Tardifs } from './plan.js';
import type { chargements } from './chargements.js';

/** Branche le mode Toit, les toits de fond et l'essai des faits sur le plan assemble. */
export function brancherLesToits(p: Plan, atelier: Atelier, ch: ReturnType<typeof chargements>, tardifs: Tardifs): void {
  const { etat, magasin, commandes } = p;
  brancherToitCatalogue(atelier, {
    // Le batiment retouche se repose seul dans la scene ; faute de mieux, la scene entiere se rebatit, sur la terrasse courante (jamais sur
    // le batiment : passe a `buildThreeScene`, il serait pris pour une terrasse).
    rebatirBatiment: (cle) => { if (vue3d.scene && !tardifs.vues?.remplacerObjets3d([cle])) tardifs.vues?.buildThreeScene(terrasseCourante(etat) || null); },
    rafraichir: () => magasin.notifier(),
    magasin
  }, commandes);
  brancherToitsFond(ch.toitsFond, commandes);
  // L'essai des faits des toits (`?regles=local`, admin) : les toits touches se relisent en tache de fond.
  brancherFaitsLocaux({ objets: () => atelier.etat.objects, relireToits: () => { ch.toitsFond.arreter(); ch.toitsFond.relancer(); } }, commandes);
}
