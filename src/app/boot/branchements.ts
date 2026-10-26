// Les objets deja presents recoivent leur DOM, puis les gestes du pointeur et les commandes du plan (app/boot.ts).

import { terrasseCourante } from '../../core/contexteTerrasse.js';
import { parPriorite } from '../../render/empilement.js';
import { referenceGeoPlan } from '../../render/ortho.js';
import { brancherRelief } from '../ecouteurs/relief.js';
import { brancherPointeur } from '../../interaction/pointeur.js';
import { validerProjetJSON } from '../../io/validation.js';
import { importSVGString as importerSVG } from '../../io/importSvg.js';
import { brancherObjets } from '../ecouteurs/objets.js';
import { brancherAffichage } from '../ecouteurs/affichage.js';
import { brancherPositionGps } from '../ecouteurs/positionGps.js';
import { brancherVoisinage } from '../ecouteurs/voisinage.js';
import { brancherDoublons } from '../ecouteurs/doublons.js';
import { brancherFichiers } from '../ecouteurs/fichiers.js';
import { brancherDivers } from '../ecouteurs/divers.js';
import { brancherClavier } from '../clavier.js';
import { brancherLesExports, exporterLeProjet } from '../assemblage/exports.js';
import type { Atelier } from '../atelier.js';
import { vue3d } from '../../three/etat3d.js';
import type { Pointage } from '../../interaction/outilMesure.js';
import type { GraineDemarrage } from './graines.js';
import type { Plan, Tardifs } from './plan.js';
import type { chargements } from './chargements.js';
import { brancherLAudit } from './branchementAudit.js';
import { brancherLesToits } from './branchementToits.js';

/** Les objets deja presents recoivent leur DOM, puis les gestes du pointeur et les commandes du plan. */
export function brancherLePlan(p: Plan, atelier: Atelier, ch: ReturnType<typeof chargements>, seed: GraineDemarrage, tardifs: Tardifs) {
  const { etat, magasin, commandes, surface, dessin, affichage, resultats, tiroir } = p;
  /** Les options des menus Fichier et Exporter, telles qu'elles sont a l'instant de la commande. */
  const options = () => magasin.store.getState().options;
  // Les priorites d'affichage les plus basses d'abord ; a egalite, l'ordre du tableau (tri stable).
  etat.objects.slice().sort(parPriorite).forEach(dessin.createObjectDOM);
  etat.objects.forEach(dessin.rebuildHandles);
  surface.poserCalquesDuDessus();
  // La barre d'etat (zones/) affiche le pointeur en metres : le plan le publie, elle le lit.
  surface.stage.addEventListener('pointermove', (e) => {
    const r = surface.stage.getBoundingClientRect();
    magasin.definirPointeur(dessin.toWorld({ x: e.clientX - r.left, y: e.clientY - r.top }));
  });
  surface.stage.addEventListener('pointerleave', () => magasin.definirPointeur(null));
  brancherPointeur(surface.svg, surface.stage, etat, {
    insertPointOnSegment: p.gestes.insertPointOnSegment, pushHistory: p.pushHistory,
    rebuildSelector: p.rebuildSelector, render: p.render, sendObjectBackward: p.gestes.sendObjectBackward,
    toWorld: dessin.toWorld, markDirty: p.markDirty, vueChangee: p.vueChangee,
    apresAcces: () => { if (vue3d.scene) tardifs.vues?.buildThreeScene(terrasseCourante(etat) || null); }
  });
  brancherObjets(atelier, commandes);
  // Ctrl+Z et Ctrl+S passent par le registre. Pas de Ctrl+Y : il n'y a pas de retablissement.
  brancherClavier(commandes);
  brancherAffichage(atelier, {
    enregistrerAffichage: affichage.enregistrerAffichage,
    ctxOrtho: ch.ctxOrtho, buildThreeScene: (o) => tardifs.vues?.buildThreeScene(o)
  }, commandes);
  brancherVoisinage(atelier, { buildThreeScene: (o) => tardifs.vues?.buildThreeScene(o) }, commandes);
  brancherDoublons(atelier, { buildThreeScene: (o) => tardifs.vues?.buildThreeScene(o) }, commandes);
  // La position GPS de l'appareil dans la Vue 3D (menu Affichage, decochee par defaut).
  brancherPositionGps(atelier, commandes);
  // L'audit de la parcelle du projet, phase 1 : la capture (MD/spec-audit.md §11, §12).
  brancherLAudit(p, tardifs);
  // Le relief du terrain (MD/spec-relief.md) : lire, actualiser, supprimer. Le calage vient du fond
  // orthophoto, qui sait deja ou le plan est sur la Terre.
  brancherRelief(atelier, {
    reference: () => referenceGeoPlan(ch.ctxOrtho()),
    buildThreeScene: (o) => tardifs.vues?.buildThreeScene(o),
    rafraichir: () => magasin.notifier()
  }, commandes);
  // Le mode Toit de la Vue 3D, les toits relus en tache de fond et l'essai des faits.
  brancherLesToits(p, atelier, ch, tardifs);
  // Branche AVANT les commandes 3D : deux ecouteurs de `resize` s'executent dans leur ordre
  // d'enregistrement, et le plan doit etre redimensionne avant la scene.
  brancherDivers(atelier, {
    resultats, redimensionnerLePlan: p.cadrage.redimensionner,
    rafraichirInspecteur: () => magasin.notifier(),
    activerOnglet: (onglet) => tiroir.activer(onglet),
    startPick: (mode: Pointage['mode'], multi: boolean, but?: Pointage['purpose'], indice?: number) => resultats.pointer(mode, multi, but, indice)
  }, commandes);
  brancherFichiers({
    exportProjetJSON: () => exporterLeProjet(etat, seed, options().exportSansParcelle), validerProjetJSON, appliquerProjetImporte: ch.appliquerProjetImporte,
    remplacerImportJson: () => options().remplacerImportJson,
    importerSVG: (contenu) => importerSVG(contenu, etat, {
      pushHistory: p.pushHistory, createObjectDOM: dessin.createObjectDOM, rebuildHandles: dessin.rebuildHandles,
      reapplyStackingOrder: dessin.reapplyStackingOrder, rebuildSelector: p.rebuildSelector, render: p.render
    }, options().remplacerImportSvg)
  }, commandes);
  brancherLesExports(etat, seed, commandes, { mesures: p.mesures, resultats, genererGlb: (t) => tardifs.vues?.genererGlb(t), options });
}
