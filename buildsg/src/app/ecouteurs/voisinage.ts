// Supprimer le voisinage d'un coup (menu Fichier, app/).
//
// Le voisinage — tout objet marque `voisinage`, qu'il vienne du voisinage etendu de l'import ou de
// « Ajouter le voisinage » de l'actualisation IGN — se masque d'un geste (Affichage › Voisinage).
// Le masquer ne l'enleve pas du document : un voisinage de 200 m, c'est un millier d'objets, assez
// pour que la plateforme refuse le projet. Cette commande les retire tous, avec les cotes qui s'y
// appuyaient. C'est une modification du projet : annulable d'un Ctrl+Z, refusee en lecture seule,
// et confirmee d'abord.

import { PERMISSION_ECRITURE } from '../acces.js';
import { showConfirm, showToast } from '../../shell/dialogs.js';
import { serializeObjects, serializeMeasures } from '../../io/serialisation.js';
import { vue3d } from '../../three/etat3d.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ObjetPlan } from '../../model/types.js';

/** Ce que la suppression demande en plus de l'atelier : la 3D se batit sur les objets presents. */
export interface ContexteVoisinage {
  buildThreeScene: (obj: ObjetPlan | null) => void;
}

/** « 1 176 objets » : le compte a annoncer, accorde. */
const compte = (n: number) => n.toLocaleString('fr-FR') + (n > 1 ? ' objets' : ' objet');

export function brancherVoisinage(a: Atelier, ctx: ContexteVoisinage, cmd: RegistreCommandes): void {
  const duVoisinage = () => a.etat.objects.filter(o => o.voisinage);

  /** Retire le voisinage et les cotes qui s'y appuient, en une etape d'annulation. */
  function supprimer(): number {
    const partants = new Set(duVoisinage().map(o => o.key));
    if (!partants.size) return 0;
    a.pushHistory();
    const restants = a.etat.objects.filter(o => !partants.has(o.key));
    const mesures = a.etat.measures.filter(m => !partants.has(m.refObjKey) && !partants.has(m.targetObjKey));
    const selection = a.etat.selectedKey;
    a.restoreState({ objects: serializeObjects(restants), measures: serializeMeasures(mesures) });
    if (selection && partants.has(selection)) a.etat.selectedKey = a.etat.objects.find(o => o.key === 'parcelle')?.key ?? null;
    a.markDirty();
    a.rebuildSelector();
    a.render();
    if (vue3d.scene) ctx.buildThreeScene(a.etat.objects.find(o => o.key === a.etat.terrasseSelectedKey) || null);
    return partants.size;
  }

  cmd.declarer({
    id: 'projet.supprimerVoisinage', libelle: 'Supprimer le voisinage', groupe: 'projet',
    permission: PERMISSION_ECRITURE,
    actif: () => a.etat.objects.some(o => o.voisinage),
    executer: () => {
      const n = duVoisinage().length;
      if (!n) return;
      showConfirm('Supprimer tout le voisinage : ' + compte(n) + ' (parcelles, bâtiments, végétation) ? Les cotes qui s’y appuient partent avec. Ctrl+Z les rend.', () => {
        const retires = supprimer();
        showToast('Voisinage supprimé : ' + compte(retires) + '.');
      });
    }
  });
}

