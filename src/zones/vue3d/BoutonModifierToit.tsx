// Le bouton qui ouvre le mode Toit (MD/spec-mode-toit-3d.md), a part du panneau du mode : il s'affiche avec la scene, le panneau et
// le catalogue des toits se chargent avec la Vue 3D (AD-10, zones/vue3d/Vue3d.tsx).

import { Icone } from '../icones.js';
import { showToast } from '../../shell/dialogs.js';
import type { RegistreCommandes } from '../../app/commandes.js';

/**
 * Le bouton des commandes de la scene qui ouvre le mode : quand un batiment du projet est selectionne. Le batiment d'un voisin le
 * montre grise, avec la raison : dans l'infobulle et, au doigt (pas d'infobulle), dans un message au toucher. Sinon, il s'efface.
 */
export function BoutonModifierToit({ commandes }: { commandes: RegistreCommandes }) {
  const e = commandes.etat('toit.modifier');
  if (!e.utilisable) {
    if (e.raison !== 'contexte' || !('message' in e)) return null;
    const message = e.message;
    return (
      <button id="terrasse3dModifierToit" data-commande="toit.modifier" type="button" className="bouton3d" aria-label="Modifier la toiture"
        aria-disabled="true" title={message} onClick={() => { showToast(message); }}>
        <Icone nom="toit" taille={20} />
      </button>
    );
  }
  return (
    <button id="terrasse3dModifierToit" data-commande="toit.modifier" type="button" className="bouton3d" aria-label="Modifier la toiture"
      title="Modifier la toiture : choisir une façade, poser des éléments, tout annuler ; rien ne change avant la validation"
      onClick={(ev) => { commandes.executer('toit.modifier', ev.currentTarget); }}>
      <Icone nom="toit" taille={20} />
    </button>
  );
}
