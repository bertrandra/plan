// Le bouton qui ouvre le mode Toit (MD/spec-mode-toit-3d.md), a part du panneau du mode : il s'affiche avec la scene, le panneau et
// le catalogue des toits se chargent avec la Vue 3D (AD-10, zones/vue3d/Vue3d.tsx).

import { Icone } from '../icones.js';
import type { RegistreCommandes } from '../../app/commandes.js';

/** Le bouton des commandes de la scene qui ouvre le mode : seulement quand un batiment du projet est selectionne. */
export function BoutonModifierToit({ commandes }: { commandes: RegistreCommandes }) {
  if (!commandes.etat('toit.modifier').utilisable) return null;
  return (
    <button id="terrasse3dModifierToit" data-commande="toit.modifier" type="button" className="bouton3d" aria-label="Modifier la toiture"
      title="Modifier la toiture : choisir une façade, poser des éléments, tout annuler ; rien ne change avant la validation"
      onClick={(e) => { commandes.executer('toit.modifier', e.currentTarget); }}>
      <Icone nom="toit" taille={20} />
    </button>
  );
}
