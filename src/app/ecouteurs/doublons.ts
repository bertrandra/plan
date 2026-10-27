// « Fusionner les doublons » : une option globale du projet, dans le menu Fichier et dans le menu Admin
// (io/doublons.ts dit ce qu'est un doublon). Une modification du projet : droit d'ecriture, confirmation,
// un seul pas d'annulation (Ctrl+Z rend les objets retires).

import { PERMISSION_ECRITURE } from '../acces.js';
import { showConfirm, showToast } from '../../shell/dialogs.js';
import { serializeObjects, serializeMeasures } from '../../io/serialisation.js';
import { fusionnerDoublons, nombreDeDoublons, trouverDoublons } from '../../io/doublons.js';
import { vue3d } from '../../three/etat3d.js';
import { cleDuPlan } from '../../ui/clePlan.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ObjetPlan } from '../../model/types.js';

export function brancherDoublons(a: Atelier, ctx: { buildThreeScene: (obj: ObjetPlan | null) => void }, cmd: RegistreCommandes): void {
  const objet = (n: number) => n + (n > 1 ? ' objets' : ' objet');
  // Le menu demande s'il y a des doublons a son ouverture (zones/BarreApplication.tsx) ; ses deux entrees (Fichier, Admin) partagent
  // la recherche d'un meme rendu (ui/clePlan.ts).
  let vu = { cle: '', doublons: false };
  const aDesDoublons = () => {
    const cle = cleDuPlan(a.etat.objects);
    if (vu.cle !== cle) vu = { cle, doublons: trouverDoublons(a.etat.objects).length > 0 };
    return vu.doublons;
  };

  cmd.declarer({
    id: 'projet.doublons', libelle: 'Fusionner les doublons', groupe: 'projet', permission: PERMISSION_ECRITURE,
    actif: aDesDoublons,
    raisonInactive: () => 'Aucun objet en double dans ce projet.',
    executer: () => {
      const groupes = trouverDoublons(a.etat.objects);
      const n = nombreDeDoublons(groupes);
      if (!n) return;
      const noms = groupes.slice(0, 5).map((g) => '« ' + (g.garde.name || g.garde.key) + ' » ×' + (g.doublons.length + 1)).join(', ') + (groupes.length > 5 ? '…' : '');
      showConfirm('Retirer ' + objet(n) + ' en double (' + noms + ') ? Seul le premier de chaque groupe est gardé, les cotes sont reportées sur lui. Ctrl+Z les rend.', () => {
        // Les groupes sont relus : le plan a pu changer pendant la question.
        const courants = trouverDoublons(a.etat.objects);
        if (!courants.length) return;
        a.pushHistory();
        const r = fusionnerDoublons(a.etat.objects, a.etat.measures, courants);
        const selection = a.etat.selectedKey;
        const retirees = new Set(courants.flatMap((g) => g.doublons.map((d) => d.key)));
        const garde = courants.find((g) => g.doublons.some((d) => d.key === selection))?.garde.key;
        a.restoreState({ objects: serializeObjects(r.objets), measures: serializeMeasures(r.mesures) });
        if (selection && retirees.has(selection)) a.etat.selectedKey = garde ?? a.etat.objects.find((o) => o.key === 'parcelle')?.key ?? null;
        a.markDirty();
        a.rebuildSelector();
        a.render();
        if (vue3d.scene) ctx.buildThreeScene(a.etat.objects.find((o) => o.key === a.etat.terrasseSelectedKey) || null);
        showToast(objet(r.retires) + ' en double retiré' + (r.retires > 1 ? 's' : '') + '.');
      });
    }
  });
}
