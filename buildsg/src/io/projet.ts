// Chargement d'un projet importe (spec §3.2, io/).
//
// Deux chemins arrivent ici : l'import d'un fichier JSON, et la creation d'un projet depuis le
// cadastre. Les deux remplacent le plan en memoire, et les deux doivent laisser l'application dans
// un etat coherent - d'ou la sequence, qui compte : on remplace les donnees, on reconstruit les
// vues, PUIS on restaure les reglages d'affichage ranges sur la parcelle (fond orthophoto,
// masquage du voisinage). L'inverse restaurerait des reglages sur des objets qui n'existent plus.

import { ortho, restaurerOrthoDuProjet, type ContexteOrtho } from '../render/ortho.js';
import { serializeObjects, serializeMeasures, type MesureSerialisee } from './serialisation.js';
import { showToast } from '../shell/dialogs.js';
import { vue3d } from '../three/etat3d.js';
import { idMesure } from '../model/cles.js';
import { referencesDeCote, type ObjetCotable } from '../model/mesures.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan, ObjetBrut, Mesure } from '../model/types.js';
import type { ProjetValide } from './validation.js';
import type { ObjetSerialise } from '../model/creation.js';

/** Ce que l'application de l'import — de fichier ou de cadastre — demande au reste du programme. */
export interface ContexteImportProjet extends ContexteOrtho {
  pushHistory: () => void;
  /** Voir la note du meme nom dans app/atelier.ts : `objects` passe par `normalizeObjects` en route. */
  restoreState: (instantane: { objects: ObjetBrut[]; measures: Partial<Mesure>[] }) => void;
  rebuildSelector: () => void;
  fitToObject: (obj: ObjetPlan) => void;
  /** Cadre toutes les parcelles affichees, avec la respiration d'une parcelle seule. */
  cadrerTerrains?: () => void;
  syncLieuTitre: () => void;
  buildThreeScene: (obj: ObjetPlan | null) => void;
}

export function appliquerProjetImporte(valide: ProjetValide, remplacer: boolean, etat: EtatApp, ctx: ContexteImportProjet): void {
  ctx.pushHistory();
  const objsBase: ObjetSerialise[] = remplacer ? [] : serializeObjects(etat.objects);
  const msBase: MesureSerialisee[] = remplacer ? [] : serializeMeasures(etat.measures);
  const clesPrises = new Set(objsBase.map(o=>o.key));
  const renommages: Record<string, string> = {};
  const ajoutes: ObjetSerialise[] = [];

  valide.objets.forEach(src=>{
    const copie = JSON.parse(JSON.stringify(src));
    let cle = copie.key;
    if(clesPrises.has(cle)){
      let n = 2;
      while(clesPrises.has(cle + '-' + n)) n++;
      cle = cle + '-' + n;
      // Jamais deux objets de cle 'parcelle' : le second devient un terrain ordinaire, sinon
      // la contrainte a la parcelle et la cloture designeraient un objet au hasard.
      if(copie.key === 'parcelle') copie.fonction = 'terrain';
      renommages[copie.key] = cle;
      copie.key = cle;
    }
    clesPrises.add(cle);
    ajoutes.push(copie);
  });
  ajoutes.forEach(o=>{
    const renommee = o.terrasseLieeKey ? renommages[o.terrasseLieeKey] : undefined;
    if(renommee) o.terrasseLieeKey = renommee;
  });

  const idsPris = new Set(msBase.map(m=>m.id));
  const mesuresFinales = msBase.slice();
  // `ObjetSerialise` nomme `key`, `type` et `pts` : c'est tout ce que le validateur des cotes lit.
  const objetsFinaux: ObjetCotable[] = objsBase.concat(ajoutes);
  let mesuresOk = 0, mesuresIgnorees = 0;
  valide.mesures.forEach(m=>{
    if(!m || typeof m !== 'object'){ mesuresIgnorees++; return; }
    const ref = renommages[m.refObjKey ?? ''] || m.refObjKey;
    const tgt = renommages[m.targetObjKey ?? ''] || m.targetObjKey;
    // Une mesure ne se restaure que si ses DEUX objets de reference existent apres l'import, et
    // si ses indices tombent dans leurs polygones : c'est `referencesDeCote` qui en juge, le meme
    // pour l'import SVG.
    const refs = referencesDeCote({ ...m, refObjKey: ref, targetObjKey: tgt }, objetsFinaux);
    if(!refs){ mesuresIgnorees++; return; }
    let id = m.id;
    if(!id || idsPris.has(id)) id = idMesure();
    idsPris.add(id);
    mesuresFinales.push({
      id, ...refs, show:!!m.show,
      displayMode: m.displayMode === 'along' ? 'along' : 'perp'
    });
    mesuresOk++;
  });

  // restoreState fait deja la demolition/reconstruction complete du DOM SVG (meme chemin que
  // l'undo et que "Reinitialiser tout") : le refaire a la main ici laisserait forcement
  // trainer un type de noeud le jour ou l'objet en gagne un nouveau.
  ctx.restoreState({ objects: objsBase.concat(ajoutes), measures: mesuresFinales });

  const lieu = valide.meta && valide.meta.lieu;
  const latitude = lieu ? lieu.latitude : undefined, longitude = lieu ? lieu.longitude : undefined;
  if(lieu && typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude)){
    const pc = ctx.trouverParcelleCloture();
    if(pc && (pc.latitude === undefined || pc.latitude === null)){
      pc.latitude = latitude;
      pc.longitude = longitude;
      if(lieu.nomLieu) pc.nomLieu = lieu.nomLieu;
    }
  }
  const parcelle = etat.objects.find(o=>o.key === 'parcelle');
  if(parcelle) etat.selectedKey = parcelle.key;
  ctx.rebuildSelector();
  ctx.render();
  // Le cadrage par defaut suit le terrain importe : une propriete de 2 400 m2 et une terrasse de
  // 20 m2 n'ont pas la meme echelle, garder le cadrage precedent afficherait un plan hors champ.
  // Un plan venu du cadastre est cadre sur toutes ses parcelles affichees (son voisinage visible
  // compris) : le masquage du voisinage est donc restitue avant le cadrage.
  if(parcelle && ctx.cadrerTerrains && parcelle.cadastre){
    restaurerAffichageDuProjet(etat, ctx);
    ctx.cadrerTerrains();
  } else if(parcelle) ctx.fitToObject(parcelle);
  // Le fond orthophoto fait partie des reglages du projet : un plan importe avec le fond actif
  // le retrouve actif, cale sur SA parcelle (les tuiles precedentes ne valent plus rien).
  ortho.tuiles = [];
  ortho.couverture = null;
  restaurerOrthoDuProjet(ctx);
  restaurerAffichageDuProjet(etat, ctx);
  ctx.markDirty();

  let msg = ajoutes.length + ' objet(s) importe(s)';
  if(valide.ignores) msg += ', ' + valide.ignores + ' ignore(s)';
  msg += '. ' + mesuresOk + ' mesure(s) restauree(s)';
  if(mesuresIgnorees) msg += ', ' + mesuresIgnorees + ' ignoree(s) (objet de reference absent ou indice hors du plan)';
  msg += '.';
  if(!parcelle) msg += ' ATTENTION: aucun objet "parcelle" dans le resultat - certaines fonctions (mesures, alignement, contrainte a la parcelle) seront limitees tant qu\'une parcelle n\'existe pas.';
  msg += ' Rien n\'a ete enregistre sur le serveur : utilise "Enregistrer" pour conserver ce plan.';
  showToast(msg);
}

export function restaurerAffichageDuProjet(etat: EtatApp, ctx: ContexteImportProjet): void {
  const p = ctx.trouverParcelleCloture();
  const a = p && p.affichage;
  etat.voisinageVisible = !(a && a.voisinage === false);
  etat.grilleVisible = !(a && a.grille === false);
  // Restituer l'etat ne suffit pas : le plan a deja ete dessine avec les valeurs precedentes
  // (l'import rend avant de restaurer les reglages). Sans ce rendu, un projet enregistre grille
  // masquee se rouvrait avec le bouton eteint... et la grille bien visible.
  ctx.rebuildSelector();   // le voisinage masque ne doit pas figurer dans les categories
  ctx.syncLieuTitre();     // la parcelle a pu changer de position (import, actualisation)
  ctx.render();
  if(vue3d.scene) ctx.buildThreeScene(etat.objects.find(o=>o.key===etat.terrasseSelectedKey) || null);
}
