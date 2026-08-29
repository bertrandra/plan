// La clôture, et les deux listes de points de vue (spec §6.4, app/).
//
// Ces commandes partagent une propriété qui explique leur forme : **elles modifient le projet, pas
// l'affichage**. La clôture est rangée sur la parcelle, comme le lieu et le zonage PLU — elle se
// sauvegarde donc avec le plan, et chaque réglage marque le projet modifié. C'est ce qui les
// distingue des cases de la Vue 3D, qui ne touchent qu'à ce qu'on regarde.
//
// Conséquence pratique : les cinq commandes commencent toutes par chercher la parcelle, et
// s'abstiennent s'il n'y en a pas. Une clôture sans terrain n'a nulle part où se poser.

import { ouvrirSelecteurTexture } from '../../ui/texturePicker.js';

/** Ce que les commandes de clôture et de points de vue déclenchent. */
export interface ContexteCloture {
  /** La parcelle qui porte la clôture, ou `undefined`. */
  trouverParcelle: () => { [k: string]: unknown } | undefined;
  /** Remet les commandes en accord avec ce que porte la parcelle. */
  syncControles: (parcelle) => void;
  /** Reconstruit la scène 3D — la clôture en fait partie. */
  rafraichirApresCloture: () => void;
  markDirty: () => void;
  /** Un objet du plan par sa clé. */
  objByKey: (cle: string) => unknown;
  allerAuPointDeVue: (vp) => void;
  allerAuPointDeVueGlb: (vp) => void;
}

export function brancherCloture(ctx: ContexteCloture): void {
  const el = (id: string) => document.getElementById(id) as HTMLInputElement;

  /**
   * Les deux listes déroulantes se **remettent à vide** après usage : elles servent à déclencher un
   * déplacement, pas à afficher un choix courant. Laisser le point de vue sélectionné donnerait
   * l'impression qu'on y est resté, alors que la caméra a pu bouger depuis.
   */
  const brancherListeDeVues = (id: string, aller: (vp) => void) => {
    el(id).addEventListener('change', function () {
      const vp = ctx.objByKey(this.value);
      this.value = '';
      if (vp) aller(vp);
    });
  };
  brancherListeDeVues('terrasse3dViewSelect', ctx.allerAuPointDeVue);
  brancherListeDeVues('glbViewerViewSelect', ctx.allerAuPointDeVueGlb);

  /** Applique une modification à la parcelle porteuse, ou ne fait rien s'il n'y en a pas. */
  const surParcelle = (modifier: (p) => void, resynchroniser = false) => {
    const p = ctx.trouverParcelle();
    if (!p) return;
    modifier(p);
    ctx.markDirty();
    if (resynchroniser) ctx.syncControles(p);
    ctx.rafraichirApresCloture();
  };

  // Resynchronise : cocher la case active ou grise les trois autres commandes.
  el('terrasse3dCloture').addEventListener('change', function () {
    surParcelle(p => { p.clotureActive = this.checked; }, true);
  });

  /**
   * Hauteur plafonnée par le bas à 0,10 m, et repliée sur 1,80 m si la saisie n'est pas un nombre.
   * Le champ est réécrit avec la valeur retenue : sans cela, `-3` resterait affiché alors que la
   * clôture mesure 0,10 m.
   */
  el('terrasse3dClotureHauteur').addEventListener('change', function () {
    surParcelle(p => {
      p.clotureHauteur = Math.max(0.1, parseFloat(this.value)) || 1.8;
      this.value = String(p.clotureHauteur);
    });
  });

  // `input` et non `change` : la couleur suit le sélecteur en direct.
  el('terrasse3dClotureCouleur').addEventListener('input', function () {
    surParcelle(p => { p.clotureCouleur = this.value; });
  });

  el('terrasse3dClotureTexBtn').addEventListener('click', () => {
    const p = ctx.trouverParcelle();
    if (!p) return;
    ouvrirSelecteurTexture('Clôture', choix => {
      p.clotureTexture = choix;
      ctx.markDirty();
      ctx.syncControles(p);
      ctx.rafraichirApresCloture();
    });
  });

  el('terrasse3dClotureTexClear').addEventListener('click', () => {
    surParcelle(p => { p.clotureTexture = null; }, true);
  });
}
