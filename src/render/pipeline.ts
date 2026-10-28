// Orchestration du dessin du plan (spec §3.2, render/).
//
// `rendreScene` ne dessine rien elle-meme : elle appelle, dans l'ordre, ce qui compose une image du
// plan. L'ordre est le seul contenu de cette fonction, et il compte - le fond orthophoto d'abord,
// la grille ensuite, puis les objets, et enfin ce qui se pose par-dessus (cotes, echelle, nord).
//
// Ce qu'elle sait et que `render/objects.ts` ne peut pas savoir : quel objet est selectionne, ce
// qui est masque, l'etat du fond, et le pointage en cours de l'outil de cotation.
//
// En mode Terrasse, le plan devient un decor : les poignees de selection et les etiquettes de
// sommets se poseraient par-dessus les vis et les solives et rendraient le canevas illisible. Le
// choix fait en mode Plan est garde, simplement pas dessine.

import { positionnerObjet, positionnerEnVerifiant, horsDeLaVue, type ContextePositionnement, type ObjetRendu } from './objects.js';
import { trousDeTerrasse } from '../engine/ouvrages/terrasse.js';
import { estTerrasse } from '../model/fonctions.js';
import { cleDesLus, cleDesObjets, versionObjet } from '../core/controleurObjets.js';
import { percentUneTerrasse } from '../core/lectures.js';
import { vue } from './vues.js';
import { SVG_LABEL_HALO, SVG_POIGNEE, SVG_POIGNEE_FOND } from './theme.js';
import { ortho, placerOrthophoto, type ContexteOrtho } from './ortho.js';
import { mesure } from '../interaction/outilMesure.js';
import type { EtatApp } from '../core/state.js';
import type { EtatScene } from '../geometry/vue.js';
import type { ObjetPlan } from '../model/types.js';

/**
 * Ce que `rendreScene` demande à l'application, en plus de l'état — tout ce qui vit encore dans la
 * fermeture de `boot()` (spec §4, phase 3) et que ce module ne peut pas deviner : la sélection, le
 * masquage, la reconstruction des poignées.
 *
 * Étend `ContexteOrtho` : `rendreScene` place le fond avant de dessiner le reste, donc son contexte
 * doit porter tout ce que `placerOrthophoto` lit.
 */
export interface ContexteRendu extends ContexteOrtho {
  drawGrid: () => void;
  renderParasolOverlay: () => void;
  amenerPoigneesDevant: (obj: ObjetPlan) => void;
  objetMasque: (obj: ObjetPlan) => boolean;
  rebuildHandles: (obj: ObjetRendu) => void;
  drawScaleBar: () => void;
  drawNorthArrow: () => void;
  drawMeasures: () => void;
  renderTerrasseLayerView: (obj: ObjetPlan | null | undefined) => void;
  estTerrain: (obj: ObjetRendu) => boolean;
  /** Les ouvertures relevees sur les facades (render/releve.ts). */
  renderReleves?: () => void;
  /** Les courbes de niveau du relief (render/relief.ts) : sous les objets, au-dessus de la grille. */
  dessinerRelief?: () => void;
  /** Le nom des rues (render/rues.ts) : sous les objets, au-dessus du relief. */
  dessinerRues?: () => void;
  /** Un mode de diagnostic (app/diagnostic.ts) : la couleur d'affichage d'un objet, ou null pour la sienne. */
  couleurDiagnostic?: (obj: ObjetPlan) => string | null;
  /**
   * Le repere du dessin (render/repere.ts) : la scene ou les objets se dessinent, la vue a une translation pres. Sans lui, la vue
   * elle-meme.
   */
  repere?: EtatScene;
}

// Ce que chaque objet a dessine la derniere fois, par son contour : la cle de ce dessin, et sa premiere poignee (des poignees
// reconstruites sont neuves, donc a placer). Un element recree n'a pas de cle : il se dessine.
const dessins = new WeakMap<Element, { cle: string; poignee: Element | null }>();

/**
 * Le plan redessine quand meme, en developpement, les objets que leur cle dit inchanges, et signale toute valeur qui bouge : un
 * chemin d'ecriture qui n'aurait pas touche son objet (core/controleurObjets.ts) se voit dans la console, et la fumee echoue.
 * Le banc du rendu l'eteint (`__sansVerifierCles`), pour mesurer ce que les gens auront.
 */
// Les elements d'un objet recrees (creerDomObjet, reconstruirePoignees) sont a placer, sans que l'objet ait change : le compte de
// ces recreations entre dans la cle d'ensemble du plan.
let elementsRecrees = 0;
/** Des elements d'un objet viennent d'etre recrees (app/assemblage/dessin.ts) : le prochain rendu repasse sur les objets. */
export function elementsRecreesDuPlan(): void { elementsRecrees++; }
// La cle du dernier rendu de tous les objets : la meme, et aucun objet n'a rien a refaire (un rendu sans changement, un deplacement
// de la vue qui ne fait entrer ni sortir personne ne parcourt plus 600 objets).
let dernierRendu = '';

const verifierCles = (): boolean => import.meta.env.DEV && !(globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles;

/**
 * Repositionne ces objets, en sautant ceux dont rien n'a change depuis leur dernier dessin (MD/spec-ouvrages.md, etape 6.1) : leur
 * version (core/controleurObjets.ts), ce qui en decide a l'affichage (selection, masque, isolement, diagnostic) et l'etat
 * d'ensemble (cadrage, photo aerienne, pointage d'une cote, encres du theme). Une terrasse lit aussi les bassins et les tremies
 * qui la percent : elle suit leur version (core/lectures.ts). La lecture des toits en tache de fond (app/toits/toitsFond.ts) n'appelle
 * que les batiments qu'elle vient d'ecrire.
 */
export function rendreObjets(etat: EtatApp, ctx: ContexteRendu, objets: readonly ObjetPlan[]): void {
  const activeSel = etat.selectedKey;
  // Les objets se dessinent dans le repere (render/repere.ts) : un deplacement de la vue ne change pas leur cle. Ce qui sort de la
  // vue, ou y entre, se lit sur la vue elle-meme.
  const s = ctx.repere ?? etat.scene;
  const pointageSommets = !!(mesure.pointage && mesure.pointage.mode === 'target');
  const pointageCotes = !!(mesure.pointage && mesure.pointage.mode === 'ref');
  const ensemble = [s.scale, s.origine.x, s.origine.y, s.W, s.H, ortho.actif, ortho.parcelleOpacite, pointageSommets, pointageCotes,
    SVG_LABEL_HALO, SVG_POIGNEE, SVG_POIGNEE_FOND].join('|');
  const verifier = verifierCles();
  const tous = objets === etat.objects;
  const v0 = etat.scene;
  const global = () => [ensemble, cleDesObjets(etat.objects), v0.scale, v0.origine.x, v0.origine.y, v0.W, v0.H, activeSel, etat.isolement,
    etat.voisinageVisible, elementsRecrees].join('|');
  if(tous && !verifier && global() === dernierRendu) return;
  objets.forEach(obj=>{
    const selectionnee = obj.key === activeSel;
    const masque = ctx.objetMasque(obj);
    const horsVue = !masque && !selectionnee && horsDeLaVue(obj as ObjetRendu, etat.scene);
    const transparent = obj.key === etat.isolement;
    const couleurDiagnostic = ctx.couleurDiagnostic?.(obj) ?? null;
    const v = vue(obj);
    // Hors de la vue, rien ne se dessine que le halo du nom : ni le repere ni l'echelle n'y comptent (un zoom ne touche pas a ce qui
    // reste dehors).
    const cleDe = () => (horsVue ? 'hors|' + SVG_LABEL_HALO : ensemble) + '|' + versionObjet(obj) + '|' + (estTerrasse(obj) ? cleDesLus(etat.objects, percentUneTerrasse) : '') + '|'
      + selectionnee + '|' + masque + '|' + horsVue + '|' + transparent + '|' + couleurDiagnostic + '|' + v.pointEls.length;
    const cle = cleDe();
    const poignee = v.pointEls[0] ?? v.radiusHandle;
    const deja = v.el ? dessins.get(v.el) : undefined;
    const inchange = !!deja && deja.cle === cle && deja.poignee === poignee;
    if(inchange && !verifier) return;
    const contexte: ContextePositionnement = {
      scene: s,
      horsVue,
      selectionnee,
      masque,
      transparent,
      // Une terrasse percee (bassin, trou) se dessine avec son trou.
      trous: trousDeTerrasse(obj, etat.objects),
      ortho: { actif: ortho.actif, parcelleOpacite: ortho.parcelleOpacite },
      estTerrain: ctx.estTerrain,
      pointageSommets,
      pointageCotes,
      reconstruirePoignees: ctx.rebuildHandles,
      couleurDiagnostic
    };
    if(inchange) positionnerEnVerifiant(obj as ObjetRendu, contexte, (attribut) => {
      console.error(`[cle de version] « ${obj.name || obj.key} » (${obj.fonction || 'sans fonction'}) : ${attribut} a change sans que l'objet soit touche`);
    });
    else positionnerObjet(obj as ObjetRendu, contexte);
    // Apres le dessin : des poignees reconstruites pendant le positionnement sont celles qu'on garde.
    if(v.el) dessins.set(v.el, { cle: cleDe(), poignee: v.pointEls[0] ?? v.radiusHandle });
  });
  dernierRendu = tous ? global() : '';
}

export function rendreScene(etat: EtatApp, ctx: ContexteRendu): void {
  placerOrthophoto(ctx);
  ctx.drawGrid();
  ctx.dessinerRelief?.();
  ctx.dessinerRues?.();
  ctx.renderParasolOverlay();
  const activeSel = etat.selectedKey;
  if(activeSel && activeSel !== 'parcelle'){
    const sel = etat.objects.find(o=>o.key===activeSel);
    if(sel) ctx.amenerPoigneesDevant(sel);
  }

  // Le positionnement d'un objet vit dans render/objects.ts. Ce qui reste ici est ce que lui
  // seul ne peut pas savoir : la selection courante, le masquage, l'etat du fond orthophoto et
  // le pointage en cours pour l'outil de mesure.
  //
  // Le cast dit ce que le type de `ObjetPlan` ne dit pas encore : un objet du plan vivant porte
  // toujours forme et couleurs, poses par `creation.ts` ou `normalisation.ts` a son entree dans
  // `etat.objects` (voir la note d'`ObjetRendu` dans render/objects.ts).
  rendreObjets(etat, ctx, etat.objects);

  ctx.renderReleves?.();
  ctx.drawScaleBar();
  ctx.drawNorthArrow();
  ctx.drawMeasures();

  // Les couches de la terrasse courante (vis, solives, lames…) sont dessinees en coordonnees
  // d'ecran comme tout le reste : sans cela, deplacer ou zoomer le plan laisserait le calque a son
  // ancienne place. Elles ne s'affichent que si l'explorateur les a demandees et tant que la
  // terrasse est selectionnee ; sinon le calque est vide — c'est ce que fait un appel sans objet.
  // Une terrasse isolee montre toujours ses couches : c'est ce que la transparence laisse voir.
  const calques = (etat.calquesVisibles || (etat.isolement !== null && etat.isolement === etat.terrasseSelectedKey)) && etat.selectedKey === etat.terrasseSelectedKey;
  ctx.renderTerrasseLayerView(calques ? etat.objects.find(o=>o.key===etat.terrasseSelectedKey) : null);
}
