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
import { murLePlusProche, replacerSaillie } from '../../facade/regles/toits/saillies.js';
import { armerSaillie, desarmerSaillie, reprendreSaillieVisee, saillieArmee } from '../../facade/choixSaillie.js';
import { hotes3d } from '../../three/etat3d.js';
import { objetSousLePointeur } from '../../three/scene.js';
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

  /** Replace l'element arme sur le mur que la personne touche dans la Vue 3D ; faux si le toucher ne dit rien (le ciel, un autre objet). */
  const placerSurLeMurTouche = (ndc: { x: number; y: number }): boolean => {
    const cible = saillieArmee();
    const o = cible ? a.etat.objects.find((x) => x.key === cible.cle) : undefined;
    if (!cible || !o?.corpsToit) return false;
    const rang = cible.rang, k = o.corpsToit[rang], hote = k?.saillie ? o.corpsToit[k.saillie.hote] : undefined;
    if (!k?.saillie || !hote) { desarmerSaillie(); return false; }
    const touche = objetSousLePointeur(ndc, (cle) => cle === cible.cle);
    if (touche.cle !== cible.cle || !touche.point) return false;
    a.pushHistory();
    o.corpsToit = replacerSaillie(o.corpsToit, rang, murLePlusProche(hote, touche.point));
    o.toitFige = true;
    desarmerSaillie();
    a.markDirty();
    a.render();
    reconstruire();
    ctx.rafraichir();
    return true;
  };

  // Le toucher (un clic, pas un glisse qui fait tourner la vue) sur la Vue 3D, quand un element est arme.
  const doc = typeof document === 'undefined' ? null : document;
  let appui: { x: number; y: number } | null = null;
  doc?.addEventListener('pointerdown', (e) => { appui = saillieArmee() && hotes3d.vue3d?.contains(e.target as Node) ? { x: e.clientX, y: e.clientY } : null; }, true);
  doc?.addEventListener('pointerup', (e) => {
    const debut = appui; appui = null;
    const hote = hotes3d.vue3d;
    if (!debut || !hote || !saillieArmee() || Math.hypot(e.clientX - debut.x, e.clientY - debut.y) > 5) return;
    const r = hote.getBoundingClientRect();
    placerSurLeMurTouche({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) });
  }, true);
  doc?.addEventListener('keydown', (e) => { if (e.key === 'Escape' && saillieArmee()) { desarmerSaillie(); ctx.rafraichir(); } });

  const armer = (cle: string, rang: number) => {
    armerSaillie(cle, rang);
    ctx.rafraichir();
    showToast(vue3d.scene ? 'Touchez un mur du bâtiment dans la vue 3D pour y poser l’élément (Échap pour annuler).' : 'Ouvrez la vue 3D, puis touchez un mur du bâtiment pour y poser l’élément.');
  };

  cmd.declarer({
    id: 'toit.murSur3d', libelle: 'Choisir le mur dans la 3D', groupe: 'toit',
    description: 'Arme l’élément de façade choisi : le prochain toucher sur un mur du bâtiment, dans la vue 3D, l’y pose',
    permission: PERMISSION_ECRITURE,
    actif: () => vises().length === 1,
    executer: () => {
      const rang = reprendreSaillieVisee();
      const o = vises()[0];
      if (rang === null || !o?.corpsToit?.[rang]?.saillie) return;
      armer(o.key, rang);
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
      // Un element de facade pose arme son choix de mur : le toucher suivant dans la 3D le deplace.
      if (id.startsWith('facade:')) armer(o.key, o.corpsToit ? o.corpsToit.length - 1 : 0);
    }
  });
}
