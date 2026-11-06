// Le bouton qui ouvre le mode Toit (MD/spec-mode-toit-3d.md), a part du panneau du mode : il s'affiche avec la scene, le panneau et
// le catalogue des toits se chargent avec la Vue 3D (AD-10, zones/vue3d/Vue3d.tsx).

import { useEffect, useRef } from 'react';
import { Icone } from '../icones.js';
import { showToast } from '../../shell/dialogs.js';
import { prendreFocusDeSortie } from '../../app/toits/modeToit.js';
import type { RegistreCommandes } from '../../app/commandes.js';

/**
 * Le bouton des commandes de la scene qui ouvre le mode. Refuse, il reste grise avec sa raison (audit de la navigation, 6 novembre 2026) :
 * aucun batiment choisi, un batiment voisin, la lecture seule. La raison est dans l'infobulle et, au doigt (pas d'infobulle), dans un
 * message au toucher. Pendant une session (rien a dire), il s'efface ; a la sortie du mode, il reprend le focus.
 */
export function BoutonModifierToit({ commandes }: { commandes: RegistreCommandes }) {
  const e = commandes.etat('toit.modifier');
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (ref.current && prendreFocusDeSortie()) ref.current.focus(); });
  if (!e.utilisable) {
    if (e.raison === 'capacite' || !('message' in e)) return null;
    const message = e.message;
    return (
      <button ref={ref} id="terrasse3dModifierToit" data-commande="toit.modifier" type="button" className="bouton3d" aria-label={'Modifier la toiture — ' + message}
        aria-disabled="true" title={message} onClick={() => { showToast(message); }}>
        <Icone nom="toit" taille={20} />
      </button>
    );
  }
  return (
    <button ref={ref} id="terrasse3dModifierToit" data-commande="toit.modifier" type="button" className="bouton3d" aria-label="Modifier la toiture"
      title="Modifier la toiture : choisir une façade, poser des éléments, tout annuler ; rien ne change avant la validation"
      onClick={(ev) => { commandes.executer('toit.modifier', ev.currentTarget); }}>
      <Icone nom="toit" taille={20} />
    </button>
  );
}
