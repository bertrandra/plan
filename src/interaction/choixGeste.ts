// Que fait ce geste ? La decision prise a l'appui sur le plan 2D (spec §3.2, interaction/pointeur.ts).
//
// Le plan est presque entierement couvert d'objets (la parcelle du projet, les voisines, les batiments) : quand un appui sur un
// objet le choisissait et le deplacait, la personne ne pouvait plus deplacer la vue, elle attrapait toujours quelque chose
// (demande du proprietaire, 27 novembre 2026). La regle :
//
// - un glisser deplace la vue, sur le vide comme sur un objet qui n'est pas choisi ;
// - un toucher bref, sans mouvement, choisit l'objet (au-dela de `SEUIL_TOUCHER_PX`, c'est un glisser) ;
// - l'objet deja choisi se deplace au glisser, ses poignees (sommets, cotes, rayon) et les acces de la cloture aussi ;
// - ce qui ne bouge jamais au glisser (le terrain, ce qui est pose sur le terrain reel, verrouille, la lecture seule) deplace la
//   vue, meme choisi ;
// - un outil qui designe (cotation, alignement, pose d'un acces) garde l'appui ;
// - le bouton du milieu et la barre d'espace tenue deplacent toujours la vue.
//
// Ce module ne fait que decider, sans DOM : le cablage (et ce que chaque decision fait ensuite) vit dans interaction/pointeur.ts.

import { estPoseSurLeTerrain, estTerrain } from '../model/fonctions.js';

/**
 * Au-dela de cette distance entre l'appui et le lacher, un toucher est un glisser. Plus large au doigt, qui tremble et couvre
 * plusieurs dizaines de pixels : les memes valeurs que le menu de la vitrine (app/menuVitrine.ts, `TOLERANCE_GLISSER_PX`,
 * `TOLERANCE_DOIGT_PX`), pour qu'un meme geste ne soit pas un toucher ici et un glisser la.
 */
export const SEUIL_TOUCHER_PX = { souris: 5, doigt: 10 } as const;

/** Le seuil d'un pointeur : le doigt a le sien, la souris et le stylet celui de la souris. */
export const seuilToucher = (typePointeur: string): number => (typePointeur === 'touch' ? SEUIL_TOUCHER_PX.doigt : SEUIL_TOUCHER_PX.souris);

/** Le pointeur a-t-il quitte le toucher pour un glisser ? */
export const aGlisse = (dx: number, dy: number, typePointeur: string): boolean => Math.hypot(dx, dy) > seuilToucher(typePointeur);

/** Ce que l'appui vise, d'apres le `data-role` de l'element touche (render/objects.ts, render/cloture.ts). */
export type CibleAppui = 'vide' | 'corps' | 'sommet' | 'cote' | 'rayon' | 'acces';

export const cibleDuRole = (role: string | undefined): CibleAppui =>
  role === 'obj' ? 'corps' : role === 'point' ? 'sommet' : role === 'edge' ? 'cote' : role === 'radius' ? 'rayon' : role === 'acces' ? 'acces' : 'vide';

/** Ce que l'objet vise permet, lu une fois a l'appui. */
export interface ObjetVise {
  /** C'est la selection en place. */
  choisi: boolean;
  /** Le corps se deplace au glisser (`corpsMobile`). */
  corpsMobile: boolean;
  /** La forme se retouche par ses poignees : ni verrouillee, ni en lecture seule. */
  formeModifiable: boolean;
}

export interface Appui {
  cible: CibleAppui;
  /** `PointerEvent.button` : 0 le principal (et le doigt), 1 le milieu, 2 le droit. */
  bouton: number;
  /** La barre d'espace est tenue, le plan ayant le focus. */
  espace: boolean;
  /** Un outil designe un cote ou un point (interaction/outilMesure.ts, `mesure.pointage`). */
  outilEnCours: boolean;
  lectureSeule: boolean;
  /** L'objet vise ; absent sur le vide. */
  objet?: ObjetVise | undefined;
}

/**
 * - `vue` : deplacer la vue ; un toucher n'y fait rien.
 * - `vueOuChoix` : deplacer la vue si le pointeur glisse ; un toucher bref choisit l'objet.
 * - `objet` : le geste propre de la cible (deplacer l'objet choisi, tirer une poignee, un acces) ; s'il n'a pas lieu (un coin
 *   gele), l'appelant deplace la vue.
 * - `outil` : l'outil en cours prend l'appui.
 * - `rien` : l'appui n'est pas pour le plan (le bouton droit, qu'un menu peut prendre).
 */
export type DecisionGeste = 'vue' | 'vueOuChoix' | 'objet' | 'outil' | 'rien';

export function deciderGeste(a: Appui): DecisionGeste {
  // Le milieu et l'espace : la vue, toujours, meme pendant un outil (deplacer la vue ne designe rien).
  if (a.bouton === 1 || (a.espace && a.bouton === 0)) return 'vue';
  if (a.bouton !== 0) return 'rien';
  if (a.outilEnCours) return 'outil';
  if (a.cible === 'vide' || !a.objet) return 'vue';
  // Un acces de la cloture se fait glisser le long de la limite sans choisir la parcelle : c'est son geste.
  if (a.cible === 'acces') return a.lectureSeule ? 'vue' : 'objet';
  if (!a.objet.choisi) return 'vueOuChoix';
  if (a.cible === 'corps') return a.objet.corpsMobile && !a.lectureSeule ? 'objet' : 'vue';
  return a.objet.formeModifiable && !a.lectureSeule ? 'objet' : 'vue';
}

/** Les champs d'un objet du plan que la decision lit. */
interface Bougeable { key?: string; fonction?: string | null; locked?: boolean; cadastre?: unknown; bdtopo?: unknown }

/**
 * Le corps se deplace-t-il au glisser ? Jamais le terrain (la parcelle du projet, les voisines), ni ce qui est pose sur le terrain
 * reel (cadastre, IGN : il se recale, il ne se deplace pas a la main), ni un objet verrouille, ni en lecture seule.
 */
export const corpsMobile = (o: Bougeable, lectureSeule: boolean): boolean =>
  !lectureSeule && !o.locked && !estTerrain(o) && !estPoseSurLeTerrain(o);

/** Les poignees d'un objet se tirent-elles ? Le terrain et le terrain reel oui (avec la question de la retouche), pas le verrouille. */
export const formeModifiable = (o: Bougeable, lectureSeule: boolean): boolean => !lectureSeule && !o.locked;
