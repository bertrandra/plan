// Ce que l'on montre du plan : nord, voisinage, grille, fond orthophoto (spec §6.4, app/).
//
// Ces cases ne changent aucune donnée du projet — elles changent ce qu'on en voit. Deux d'entre
// elles ont pourtant des conséquences qui dépassent le dessin, et c'est ce qui les rend
// intéressantes : masquer le voisinage peut retirer de l'écran l'objet en cours d'édition, et la 3D
// se construit à partir des objets visibles, donc elle se **reconstruit** au lieu de se redessiner.

import { ortho, basculerOrthophoto, placerOrthophoto, enregistrerConfigOrtho, syncControlesOrtho } from '../../render/ortho.js';
import { vue3d } from '../../three/etat3d.js';
import type { Atelier } from '../atelier.js';

/** Ce que les commandes d'affichage doivent pouvoir déclencher, en plus de l'atelier. */
export interface ContexteAffichage {
  /** Range l'état d'affichage sur la parcelle, pour qu'il se sauvegarde avec le projet. */
  enregistrerAffichage: () => void;
  /** Remet le bouton de grille en accord avec l'état. */
  syncBasculeGrille: () => void;
  /** Le contexte que réclame le fond orthophoto. */
  ctxOrtho: () => Parameters<typeof placerOrthophoto>[0];
  /** Reconstruit la scène 3D — nécessaire quand la liste des objets visibles change. */
  buildThreeScene: (obj) => void;
}

export function brancherAffichage(a: Atelier, ctx: ContexteAffichage): void {
  const el = (id: string) => document.getElementById(id) as HTMLInputElement;

  el('chkNorth').addEventListener('change', e => {
    a.etat.showNorth = (e.target as HTMLInputElement).checked;
    a.render();
  });

  el('chkVoisinage').addEventListener('change', function () {
    a.etat.voisinageVisible = this.checked;
    // Editer un objet qu'on vient de masquer n'aurait pas de sens : la selection revient sur la
    // parcelle, ou a defaut sur le premier objet reste visible.
    if (!a.etat.voisinageVisible) {
      const sel = a.etat.objects.find(o => o.key === a.etat.selectedKey);
      if (sel && sel.voisinage) {
        const repli = a.etat.objects.find(o => o.key === 'parcelle') || a.etat.objects.find(o => !o.voisinage);
        a.etat.selectedKey = repli ? repli.key : null;
        a.etat.highlight = { type: null, index: null };
      }
    }
    ctx.enregistrerAffichage();
    a.rebuildSelector();
    a.render();
    // La 3D batit sa scene a partir des objets visibles : il faut la reconstruire, pas seulement
    // la redessiner.
    if (vue3d.scene) ctx.buildThreeScene(a.etat.objects.find(o => o.key === a.etat.terrasseSelectedKey) || null);
  });

  el('gridBtn').addEventListener('click', () => {
    a.etat.grilleVisible = !a.etat.grilleVisible;
    ctx.syncBasculeGrille();
    ctx.enregistrerAffichage();
    a.render();
  });

  // `void` : la bascule télécharge des tuiles, donc elle est asynchrone. Rien n'attend son résultat
  // — c'est elle qui redessine quand elle a fini.
  el('chkOrtho').addEventListener('change', e => {
    void basculerOrthophoto((e.target as HTMLInputElement).checked, ctx.ctxOrtho());
  });

  el('orthoOpacite').addEventListener('input', function () {
    ortho.opacite = parseInt(this.value, 10) / 100;
    document.getElementById('orthoOpaciteTexte').textContent = this.value + ' %';
    // L'opacite de la photo est portee par les tuiles : il faut les reposer.
    if (ortho.actif) placerOrthophoto(ctx.ctxOrtho());
    enregistrerConfigOrtho(ctx.ctxOrtho());
  });

  el('orthoParcelleOpacite').addEventListener('input', function () {
    ortho.parcelleOpacite = parseInt(this.value, 10) / 100;
    document.getElementById('orthoParcelleOpaciteTexte').textContent = this.value + ' %';
    // Celle-ci ne touche pas aux tuiles : `render()` reapplique l'opacite effective sur les
    // terrains, et cela suffit.
    if (ortho.actif) a.render();
    enregistrerConfigOrtho(ctx.ctxOrtho());
  });

  el('orthoParcelleDefaut').addEventListener('click', () => {
    ortho.parcelleOpacite = 0.15;
    syncControlesOrtho();
    if (ortho.actif) a.render();
    enregistrerConfigOrtho(ctx.ctxOrtho());
  });
}
