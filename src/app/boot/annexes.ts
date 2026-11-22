// Ce que le demarrage branche selon le mode (app/boot.ts) : l'audit, l'isolement de la terrasse, l'exposition pour les captures.

import { parcelleDuProjet } from '../../model/fonctions.js';
import { demanderSection, type Inspecteur } from '../inspecteur.js';
import { confirmerSelection, lacherSelectionAccueil, suivreSelectionAccueil } from '../../core/selectionAccueil.js';
import type { Feuille } from '../magasin.js';
import type { Explorateur } from '../explorateur.js';
import { showToast } from '../../shell/dialogs.js';
import { toucher, toucherForme } from '../../core/controleurObjets.js';
import type { Vues3d } from '../assemblage/vues3d.js';
import { vue3d, rendre3d, affichage3d, reglerVue3d } from '../../three/etat3d.js';
import { photomontage } from '../photomontage/etat.js';
import { moteur3d } from '../../three/demande3d.js';
import { poserEspeces, type EspeceArbre } from '../../model/especesArbre.js';
import { creerIsolement, objetAIsoler } from '../isolement.js';
import type { DemandeAudit } from '../audit/demande.js';
import type { Plan } from './plan.js';
import type { ObjetPlan } from '../../model/types.js';

/**
 * Le mode audit (app/audit/) : la promenade pilote le plan, rien ne s'enregistre. Charge a la demande (AD-10) : seul l'administrateur
 * qui ouvre `?mode=audit` en a besoin. Rend la fin du branchement.
 */
export async function demarrerAudit(p: Plan, vues: Vues3d, demande: DemandeAudit): Promise<void> {
  const { etat, magasin, commandes } = p;
  const { brancherAudit } = await import('../audit/branchement.js');
  brancherAudit({
    etat, commandes, notifier: () => magasin.notifier(), signaler: showToast,
    restaurer: (i) => p.historique.restaurer(i), rebuildSelector: p.rebuildSelector,
    buildThreeScene: () => vues.buildThreeScene(null), remplacerObjets3d: (cles) => vues.remplacerObjets3d(cles),
  }, demande);
}

/**
 * La bascule « Isoler la terrasse » (app/isolement.ts) : la commande, et la sortie automatique quand
 * la terrasse isolee n'est plus selectionnee.
 */
export function brancherIsolement(p: Plan): void {
  const { etat, magasin, cadrage, commandes } = p;
  const isolement = creerIsolement({
    etat,
    render: () => p.render(),
    cadrer: (obj) => cadrage.cadrer(obj),
    vue3dOuverte: () => magasin.store.getState().vue === 'vue3d',
    reconstruire3d(recadrer) {
      // Sans cle de vue, la scene reconstruite ne reprend pas la camera : elle se cadre sur ce
      // qu'elle montre (three/scene.ts).
      if (recadrer) reglerVue3d({ dernierObjKey: null });
      commandes.executer('vue.3d');
    },
    lireCamera() {
      const sc = vue3d.scene;
      if (!sc) return null;
      const { x, y, z } = sc.camera.position, t = sc.controls.target;
      return { pos: { x, y, z }, cible: { x: t.x, y: t.y, z: t.z } };
    },
    poserCamera(c) {
      const sc = vue3d.scene;
      if (!sc) return;
      sc.camera.position.set(c.pos.x, c.pos.y, c.pos.z);
      sc.controls.target.set(c.cible.x, c.cible.y, c.cible.z);
      sc.controls.update();
      rendre3d(sc);
    },
    notifier: () => magasin.notifier()
  });
  commandes.declarer({
    id: 'terrasse.isoler', libelle: 'Isoler l\'objet', groupe: 'terrasse',
    description: 'Ne montre que la terrasse, la piscine, la pergola ou le carport sélectionné, avec ce qui lui est lié (la terrasse d\'une piscine), et cadre la vue sur lui ; une terrasse passe en transparence. Rebasculer, ou désélectionner l\'objet, rend la vue d\'avant.',
    actif: () => isolement.actif() || !!objetAIsoler(etat),
    executer: () => isolement.basculer()
  });
  // La selection change par le plan, l'explorateur, le clavier : le magasin est le seul endroit ou
  // tous ces chemins se retrouvent.
  magasin.store.subscribe(() => isolement.suivreSelection());
  // Une selection qui n'est plus celle de l'ouverture a ete choisie par la personne (core/selectionAccueil.ts).
  magasin.store.subscribe(() => suivreSelectionAccueil(etat));
}

/**
 * Juste avant d'entrer en Vue 3D : la selection posee d'office a l'ouverture, ni choisie ni utilisee, est lachee
 * (core/selectionAccueil.ts). Le plan suit (poignees, inspecteur, tiroir) : elle ne doit pas y rester dessinee au retour.
 */
export function lacherLaSelectionDAccueil(p: Plan): void {
  const { etat } = p;
  if (!lacherSelectionAccueil(etat)) return;
  etat.highlight = { type: null, index: null };
  p.render();
}

/**
 * « Clôture et portails » (palette, groupe Creer) : le chemin direct vers les deux sections de la parcelle du projet. La cloture et
 * ses acces n'existent que dans l'inspecteur de cette parcelle, verrouillee et sous tous les autres objets : il fallait savoir la
 * choisir, puis trouver la section. La commande la selectionne et ouvre la section ; elle n'ecrit rien (les boutons de la section
 * portent le droit d'ecrire), et ne s'offre que si le projet a sa parcelle ; lancee hors du plan, elle y ramene.
 */
export function brancherCheminCloture(p: Plan, inspecteur: Pick<Inspecteur, 'basculerOuverture'>): void {
  const { etat, magasin, commandes } = p;
  commandes.declarer({
    id: 'cloture.ouvrir', libelle: 'Clôture et portails', groupe: 'objet',
    description: 'Sélectionne la parcelle du projet et ouvre sa section Clôture, suivie de Portails et portillons : cocher la clôture, ajouter un portail ou un portillon',
    actif: () => !!parcelleDuProjet(etat.objects),
    executer: () => {
      const parcelle = parcelleDuProjet(etat.objects);
      if (!parcelle) return;
      // Depuis la Vue 3D (le rail de la tablette y reste) : la cloture se regle sur le plan, on y revient d'abord.
      if (magasin.store.getState().vue !== 'plan') commandes.executer('vue.plan');
      etat.selectedKey = parcelle.key;
      etat.highlight = { type: null, index: null };
      confirmerSelection(etat);
      demanderSection('cloture');
      const s = magasin.store.getState();
      if (s.classe === 'compact') magasin.definirFeuille('proprietes');
      else if (!s.inspecteurOuvert) inspecteur.basculerOuverture();
      p.render();
    }
  });
}

/**
 * Les poignees des captures de reference (scripts/captures.mjs) et de la fumee automatisee
 * (scripts/fumee.mjs). En developpement, et dans le paquet du banc (mode `banc`) : le fichier livre ne les porte pas.
 */
export function exposerPourLesCaptures(p: Plan, explorateur: Explorateur): void {
  const { etat, magasin, commandes, tiroir } = p;
  Object.assign(window, { __plan: {
    executer: (id: string) => commandes.executer(id),
    // Une ecriture de script dans un objet (un scenario de la fumee) se dit comme toute ecriture (core/controleurObjets.ts).
    toucher: (cle: string) => toucher(etat.objects.find(o => o.key === cle)),
    // Un glisser de script (le banc du rendu) : seule la forme change, comme au doigt (interaction/pointeur.ts).
    toucherForme: (cle: string) => toucherForme(etat.objects.find(o => o.key === cle)),
    // Un rendu complet du plan, chronometre (scripts/banc-rendu.mjs, MD/roadmap-architecture.md etape 0.2).
    rendre: () => { const t = performance.now(); p.render(); return performance.now() - t; },
    // Un geste de vue de script (le banc du rendu, scenario `geste`) : la vue a change depuis `avant`, comme sous le doigt, frein et
    // apercu compris (app/boot/rendu.ts).
    changerVue: (avant: Parameters<Plan['vueChangee']>[0]) => p.vueChangee(avant),
    // Le dessin d'un objet ajoute hors des gestes (le banc du rendu) : sans lui, l'objet est dans l'etat mais pas sur le plan.
    dessinerObjet: (o: ObjetPlan) => p.dessin.createObjectDOM(o),
    selectionnerPremiere: (fonction: string) => {
      const o = etat.objects.find(x => x.fonction === fonction);
      if (o) explorateur.selectionner(o.key);
    },
    ouvrirFeuille: (feuille: Feuille) => magasin.definirFeuille(feuille),
    ouvrirResultats: (onglet: string) => tiroir.activer(onglet),
    // Lecture seule : ce qu'un geste a change se mesure dans l'etat, pas a l'oeil.
    etat: () => etat,
    selectionnerCle: (cle: string | null) => explorateur.selectionner(cle),
    magasin: () => magasin.store.getState(),
    // La scene 3D affichee : la fumee y place la camera pour regarder un objet precis.
    scene3d: () => vue3d.scene,
    // Les deux vues avant / apres d'un audit (three/comparaison3d.ts), en pixels du canevas.
    deuxVues: () => affichage3d.comparaison,
    // Ce que la Vue 3D montre des objets du plan (la vue epuree de l'audit de la parcelle).
    visibilite3d: () => moteur3d()?.visibilite3d() ?? null,
    // Ce que la Vue 3D ouverte a pose pour un objet du plan : ses racines et leur boite (la fumee mesure qu'un objet y a ete repose).
    pose3d: (cle: string) => moteur3d()?.pose3d(cle) ?? null,
    // Le rendu pour Claude, epure le temps d'un appel (le banc visuel : meme instance que l'application).
    // Sans moteur, aucune scene a epurer (three/demande3d.ts).
    epurerLeTemps: <T>(garder: (cle: string) => boolean, f: () => T): T => { const m = moteur3d(); return m ? m.epurerLeTemps(garder, f) : f(); },
    // Le photomontage de la session (app/photomontage/etat.ts) : ce que la fumee lit du calage et de la camera.
    photomontage: () => photomontage,
    // La bibliotheque d'essences en usage, posee telle quelle (la fumee du point 24 la vide : le temoin GLB est en repli).
    poserEspeces: (especes: readonly EspeceArbre[]) => poserEspeces(especes)
  } });
}
