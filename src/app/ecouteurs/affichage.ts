// Ce que l'on montre du plan : nord, voisinage, grille, fond orthophoto (spec §6.4, app/).
//
// Ces cases ne changent aucune donnée du projet — elles changent ce qu'on en voit. Deux d'entre
// elles ont pourtant des conséquences qui dépassent le dessin, et c'est ce qui les rend
// intéressantes : masquer le voisinage peut retirer de l'écran l'objet en cours d'édition, et la 3D
// se construit à partir des objets visibles, donc elle se **reconstruit** au lieu de se redessiner.

import { ortho, basculerOrthophoto, placerOrthophoto, enregistrerConfigOrtho, syncControlesOrtho } from '../../render/ortho.js';
import { vue3d } from '../../three/etat3d.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ObjetPlan } from '../../model/types.js';

/** Ce que les commandes d'affichage doivent pouvoir déclencher, en plus de l'atelier. */
export interface ContexteAffichage {
  /** Range l'état d'affichage sur la parcelle, pour qu'il se sauvegarde avec le projet. */
  enregistrerAffichage: () => void;
  /** Remet le bouton de grille en accord avec l'état. */
  syncBasculeGrille: () => void;
  /** Le contexte que réclame le fond orthophoto. */
  ctxOrtho: () => Parameters<typeof placerOrthophoto>[0];
  /** Reconstruit la scène 3D — nécessaire quand la liste des objets visibles change. */
  buildThreeScene: (obj: ObjetPlan | null) => void;
}

export function brancherAffichage(a: Atelier, ctx: ContexteAffichage, cmd: RegistreCommandes): void {
  const el = (id: string) => document.getElementById(id) as HTMLInputElement;

  // Chaque bascule est une commande qui inverse l'etat ; la case du panneau et le menu Affichage de
  // la barre d'application (zones/) l'executent tous deux. Une case est tenue en accord avec l'etat
  // par `syncBasculeVoisinage` / `syncControlesOrtho`, donc l'inverser revient a suivre la case.
  cmd.declarer({ id: 'affichage.nord', libelle: 'Flèche Nord', groupe: 'affichage', executer: () => {
    a.etat.showNorth = !a.etat.showNorth;
    el('chkNorth').checked = a.etat.showNorth;
    a.render();
  } });
  el('chkNorth').addEventListener('change', () => cmd.executer('affichage.nord'));

  cmd.declarer({ id: 'affichage.voisinage', libelle: 'Voisinage', groupe: 'affichage', executer: () => {
    a.etat.voisinageVisible = !a.etat.voisinageVisible;
    el('chkVoisinage').checked = a.etat.voisinageVisible;
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
  } });
  el('chkVoisinage').addEventListener('change', () => cmd.executer('affichage.voisinage'));

  cmd.declarer({ id: 'affichage.grille', libelle: 'Grille', groupe: 'affichage', executer: () => {
    a.etat.grilleVisible = !a.etat.grilleVisible;
    ctx.syncBasculeGrille();
    ctx.enregistrerAffichage();
    a.render();
  } });

  // `void` : la bascule télécharge des tuiles, donc elle est asynchrone. Rien n'attend son résultat
  // — c'est elle qui redessine quand elle a fini.
  cmd.declarer({ id: 'affichage.orthophoto', libelle: 'Fond orthophoto', groupe: 'affichage', executer: () => {
    const actif = !ortho.actif;
    el('chkOrtho').checked = actif;
    void basculerOrthophoto(actif, ctx.ctxOrtho());
  } });
  el('chkOrtho').addEventListener('change', () => cmd.executer('affichage.orthophoto'));

  el('orthoOpacite').addEventListener('input', function () {
    ortho.opacite = parseInt(this.value, 10) / 100;
    document.getElementById('orthoOpaciteTexte')!.textContent = this.value + ' %';
    // L'opacite de la photo est portee par les tuiles : il faut les reposer.
    if (ortho.actif) placerOrthophoto(ctx.ctxOrtho());
    enregistrerConfigOrtho(ctx.ctxOrtho());
  });

  el('orthoParcelleOpacite').addEventListener('input', function () {
    ortho.parcelleOpacite = parseInt(this.value, 10) / 100;
    document.getElementById('orthoParcelleOpaciteTexte')!.textContent = this.value + ' %';
    // Celle-ci ne touche pas aux tuiles : `render()` reapplique l'opacite effective sur les
    // terrains, et cela suffit.
    if (ortho.actif) a.render();
    enregistrerConfigOrtho(ctx.ctxOrtho());
  });

  cmd.bouton('orthoParcelleDefaut', { id: 'affichage.orthoParcelleDefaut', libelle: 'Opacité de parcelle conseillée', groupe: 'affichage', executer: () => {
    ortho.parcelleOpacite = 0.15;
    syncControlesOrtho();
    if (ortho.actif) a.render();
    enregistrerConfigOrtho(ctx.ctxOrtho());
  } });
}
