// Les commandes du catalogue du toit (palette, groupe « Toit ») : poser un geste sur un batiment, et
// allumer ou couper les « Regles » (la lecture automatique du toit).
//
// `toit.regles` : une bascule. Allumee, le toit se lit tout seul (LiDAR, faits, profils) ; coupee, le
// batiment est fige (`toitFige`) et rien ne le reecrit. Sur une parcelle, elle porte sur tous les
// batiments de la parcelle du projet. Rallumer reprend la lecture et perd ce que la personne avait
// regle : c'est une modification du projet, annulable.
// `toit.poser` : le geste du catalogue (facade/regles/toits/gestes.ts), nomme par `data-piece` sur le
// bouton qui l'a declenche. Il fige le toit : poser un geste, c'est decider.

import { PERMISSION_ECRITURE } from '../acces.js';
import { estBatiment, parcelleDuProjet, surParcelleDuProjet } from '../../model/fonctions.js';
import { appliquerPiece, raisonIndisponible, reprendreLectureAuto } from '../../facade/regles/toits/gestes.js';
import { showToast } from '../../shell/dialogs.js';
import { vue3d } from '../../three/etat3d.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ObjetPlan } from '../../model/types.js';

export interface ContexteToitCatalogue {
  buildThreeScene: (obj: ObjetPlan | null) => void;
  /** Redessine les zones : la palette lit l'etat des Regles. */
  rafraichir: () => void;
}

/** Les batiments que la palette regle : celui qui est selectionne, ou ceux de la parcelle selectionnee. */
export function batimentsVises(objets: ObjetPlan[], cle: string | null | undefined): ObjetPlan[] {
  const o = objets.find((x) => x.key === cle);
  if (!o) return [];
  if (estBatiment(o)) return [o];
  const p = parcelleDuProjet(objets);
  return p && o.key === p.key ? objets.filter((x) => estBatiment(x) && surParcelleDuProjet(x)) : [];
}

/** Les « Regles » sont allumees quand aucun des batiments vises n'est fige. */
export const reglesAllumees = (batiments: ObjetPlan[]): boolean => batiments.length > 0 && batiments.every((b) => !b.toitFige);

export function brancherToitCatalogue(a: Atelier, ctx: ContexteToitCatalogue, cmd: RegistreCommandes): void {
  const vises = () => batimentsVises(a.etat.objects, a.etat.selectedKey);
  const reconstruire = () => {
    if (vue3d.scene) ctx.buildThreeScene(a.etat.objects.find((o) => o.key === a.etat.terrasseSelectedKey) || null);
  };

  cmd.declarer({
    id: 'toit.regles', libelle: 'Règles', groupe: 'toit',
    description: 'Allume ou coupe la lecture automatique du toit : coupée, le bâtiment reste comme vous l’avez réglé ; rallumée, Plan relit le toit (LiDAR, faits, profils) et remplace ce que vous aviez réglé',
    permission: PERMISSION_ECRITURE,
    actif: () => vises().length > 0,
    executer: () => {
      const l = vises();
      if (!l.length) return;
      const allumer = !reglesAllumees(l);
      a.pushHistory();
      for (const b of l) {
        if (allumer) reprendreLectureAuto(b);
        else b.toitFige = true;
      }
      a.markDirty();
      a.render();
      reconstruire();
      ctx.rafraichir();
      showToast(allumer ? 'Règles allumées : le toit sera relu.' : 'Règles coupées : le toit reste tel que vous le réglez.');
    }
  });

  cmd.declarer({
    id: 'toit.poser', libelle: 'Poser sur le toit', groupe: 'toit',
    description: 'Pose sur le bâtiment sélectionné la forme de toit, l’élément du toit ou l’élément de façade choisi dans le catalogue ; coupe les règles pour ce bâtiment ; Ctrl+Z revient en arrière',
    permission: PERMISSION_ECRITURE,
    actif: () => { const o = vises()[0]; return vises().length === 1 && !!o; },
    executer: (source) => {
      const id = source?.dataset.piece;
      const o = vises()[0];
      if (!id || vises().length !== 1 || !o) return;
      const raison = raisonIndisponible(o, id);
      if (raison) { showToast(raison); return; }
      a.pushHistory();
      if (!appliquerPiece(o, id)) return;
      a.markDirty();
      a.render();
      reconstruire();
      ctx.rafraichir();
    }
  });
}
