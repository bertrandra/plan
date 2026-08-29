// Les boutons qui créent, dupliquent, reculent et suppriment un objet (spec §6.4, app/).
//
// Presque tous se contentent d'appeler l'atelier. Les trois qui font autre chose le font pour une
// raison, et elle est écrite en face.

import { showToast, showConfirm } from '../../shell/dialogs.js';
import { centroid } from '../../geometry/basic.js';
import type { Atelier } from '../atelier.js';

export function brancherObjets(a: Atelier): void {
  const surClic = (id: string, action: () => void) => {
    document.getElementById(id).addEventListener('click', action);
  };

  surClic('undoBtn', a.undo);

  // Des flèches explicites, et non `addEventListener('click', a.addNewObject)` : celui-ci passerait
  // l'événement en premier argument — un objet toujours vrai — et le polygone libre naîtrait en
  // mode rectangle.
  surClic('addObjBtn', () => a.addNewObject(false));
  surClic('addRectBtn', () => a.addNewObject(true));
  surClic('addPathBtn', () => a.addNewPath());
  surClic('addCircleBtn', () => a.addNewCircle());
  surClic('addParasolBtn', () => a.addNewParasol());
  surClic('addViewpointBtn', () => a.addNewViewpoint());
  surClic('dupObjBtn', () => a.duplicateSelectedObject());
  surClic('delObjBtn', () => a.deleteSelectedObject());

  /**
   * Reculer d'un cran. Le double-clic sur la forme fait la même chose, mais c'est un geste fragile
   * au doigt sur une petite forme : le bouton le rend fiable, et surtout découvrable.
   *
   * Il dit aussi quand il ne se passe rien — « déjà au fond de sa priorité » — parce qu'un bouton
   * qui ne réagit pas se lit comme un bouton cassé.
   */
  surClic('backObjBtn', () => {
    const obj = a.objByKey(a.etat.selectedKey);
    if (!obj) { showToast('Selectionne d\'abord un objet.'); return; }
    if (obj.key === 'parcelle') { showToast('La parcelle reste toujours au fond.'); return; }
    a.pushHistory();
    const avant = a.etat.objects.indexOf(obj);
    a.sendObjectBackward(obj);
    if (a.etat.objects.indexOf(obj) === avant) showToast('Deja au fond de sa priorite d\'affichage.');
  });

  /**
   * Remettre un objet à sa place du chargement — sa place, pas sa forme.
   *
   * On translate donc l'objet par l'écart entre les deux centroïdes, au lieu de recopier les points
   * d'origine : un objet déplacé *et* redimensionné garde ce qu'on lui a fait, et retrouve seulement
   * sa position. Un objet créé après le chargement n'a pas de référence, et le bouton le dit.
   */
  surClic('resetPosBtn', () => {
    const obj = a.objByKey(a.etat.selectedKey);
    if (!obj) { showToast('Selectionne d\'abord un objet.'); return; }
    const init = a.initialState().find(o => o.key === a.etat.selectedKey);
    if (!init) { showToast('Aucune position initiale enregistree pour cet objet (il a ete cree apres le chargement).'); return; }
    a.pushHistory();
    if (obj.type === 'circle') {
      obj.center = { ...init.center };
    } else {
      const initC = centroid(init.pts);
      const curC = centroid(obj.pts);
      const d = { x: initC.x - curC.x, y: initC.y - curC.y };
      obj.pts.forEach(p => { p.x += d.x; p.y += d.y; });
    }
    a.render();
  });

  /**
   * Tout réinitialiser, par le même mécanisme que l'annulation : on repose l'instantané pris au
   * chargement.
   *
   * L'approche précédente — recopier quelques champs choisis sur les objets encore présents —
   * laissait silencieusement en place l'élévation, l'altitude, les textures, la construction, la
   * clôture, le parasol et les coordonnées GPS ; elle ne retirait jamais un objet ajouté depuis, et
   * n'en ramenait jamais un supprimé. Les cotes reviennent aussi : « réinitialiser » veut dire
   * réinitialiser.
   *
   * D'où la confirmation : ce bouton efface d'un clic tout le travail fait depuis le chargement.
   */
  surClic('resetBtn', () => {
    showConfirm('Reinitialiser tout le plan ? Les objets et les mesures reviennent a leur etat du chargement (annulable par Ctrl+Z).', () => {
      a.pushHistory();
      a.restoreState({ objects: a.initialState(), measures: a.initialMeasures() });
    });
  });
}
