// Le mode Toit de la Vue 3D (MD/spec-mode-toit-3d.md, etape 1) : retoucher le toit d'un batiment du projet dans une session.
//
// Une session garde sa propre pile d'annulation (facade/modeToit/sessionToit.ts) : les gestes ecrivent dans le batiment sur
// place — la scene 3D le montre tout de suite — sans toucher a l'historique du projet. `valider` remet d'abord le depart, empile
// UNE etape d'historique du projet, puis ecrit l'etat final : un seul Ctrl+Z defait toute la session. `abandonner` remet le depart.
//
// Hors session, rien ne change. Quitter la Vue 3D ou choisir un autre objet pendant une session modifiee pose d'abord la question
// (Valider, Abandonner, Rester : `quitterPuis`) ; une session sans changement se ferme sans rien demander.

import { estBatiment, surParcelleDuProjet } from '../../model/fonctions.js';
import { enPoints } from '../../model/formes.js';
import { aChange, annuler, creerHistorique, empiler, peutAnnuler, peutRetablir, ecrireLeGeste, photographier, restaurer as restaurerSession, retablir, revenirAuDepart,
  type HistoriqueToit } from '../../facade/modeToit/sessionToit.js';
import { facadeProche, facadesDuBatiment, facadeValideeDuMur, facadeVersLePoint, orientationDe, texteDeLaPhoto, type FacadeVisee } from '../../facade/modeToit/facadesDesCorps.js';
import { poseDeDessus, poseEnPerspective, type PointScene, type Reserve } from '../../three/poseFacade.js';
import { moteur3d } from '../../three/demande3d.js';
import { poserCameraFacade, retirerCameraFacade } from '../../three/vueFacadeToit.js';
import { centroid } from '../../geometry/basic.js';
import { majFantomes, viderFantomes } from '../../three/fantomes.js';
import { abonnerSceneBatie, hotes3d, vue3d, reglerVue3d } from '../../three/etat3d.js';
import { dialogues } from '../../shell/dialogues.js';
import { lectureToits } from '../../core/lectureToits.js';
import { showToast } from '../../shell/dialogs.js';
import type * as THREE_NS from 'three';
import { elementProche, lireElement, listerElements, memeCible, type CibleElement } from '../../facade/modeToit/elements.js';
import { emprisePourCadrer, murDeCadrage, murLePlusVisible } from '../../facade/modeToit/poignees.js';
import type { Atelier } from '../atelier.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../model/types.js';
import { toucher } from '../../core/controleurObjets.js';

interface PoseVue { position: { x: number; y: number; z: number }; cible: { x: number; y: number; z: number } }

/** La vue de la session : la 3D libre, devant une facade, ou de dessus. */
export type VueToit = 'libre' | 'facade' | 'dessus';

export interface SessionToit {
  cle: string;
  hist: HistoriqueToit;
  /** La facade courante, et la derniere choisie (la vue « Facade » y revient). */
  facade: FacadeVisee | null;
  derniere: FacadeVisee | null;
  vue: VueToit;
  /** Le corps isole dans la facade (rang dans `corpsToit`), ou null. */
  corpsIsole: number | null;
  /** L'element choisi (celui que l'inspecteur regle), ou null. */
  selection: CibleElement | null;
  /** Le doigt qui invite a toucher le batiment : vrai jusqu'au premier geste. */
  indice: boolean;
  /** La camera avant d'entrer dans une facade : on la retrouve en la quittant. */
  vueAvant: PoseVue | null;
  isole: boolean;
  /** Le batiment montre le toit du projet (le depart), pas la session : un geste ramene la session. */
  validee: boolean;
  /** La camera avant d'entrer dans le mode : la sortie la rend (la maison a ete cadree a l'entree). */
  cameraAvantMode?: PoseVue | null;
  /** Ce que la personne voyait avant chaque pas (`avant[i]`) et apres lui (`apres[i]`) : Ctrl+Z et Ctrl+Y le lui rendent. */
  vuesDesPas?: { avant: VueSession[]; apres: VueSession[] };
  /** La vue au debut du glisser en cours : celle du pas qu'il empilera. */
  vueDuGlisser?: VueSession | null;
}

/** Un mur designe par son corps et son rang : une facade se retrouve ainsi apres une annulation, qui refait les murs. */
interface MurDe { rang: number | null; mur: number }

/**
 * Ce que la personne voyait : la vue, la facade, l'element choisi et la camera. Ctrl+Z rend celle d'avant le pas defait, Ctrl+Y celle
 * d'apres le pas refait (audit de la navigation, 6 novembre 2026) : la selection est ainsi toujours celle de l'etat ou elle a ete prise,
 * jamais un rang qui designerait un autre element apres l'annulation.
 */
export interface VueSession { vue: VueToit; facade: MurDe | null; derniere: MurDe | null; selection: CibleElement | null; camera: PoseVue | null; vueAvant: PoseVue | null }

const murDe = (f: FacadeVisee | null): MurDe | null => (f ? { rang: f.rang, mur: f.mur } : null);

/** La pose de la camera de l'orbite, ou null sans scene. */
function poseCourante(): PoseVue | null {
  const sc = vue3d.scene;
  if (!sc) return null;
  const p = sc.camera.position, t = sc.controls.target;
  return { position: { x: p.x, y: p.y, z: p.z }, cible: { x: t.x, y: t.y, z: t.z } };
}

function poserCamera(p: PoseVue): void {
  const sc = vue3d.scene;
  if (!sc) return;
  sc.camera.position.set(p.position.x, p.position.y, p.position.z);
  sc.controls.target.set(p.cible.x, p.cible.y, p.cible.z);
  sc.controls.update();
}

export function capturerVue(s: SessionToit): VueSession {
  return { vue: s.vue, facade: murDe(s.facade), derniere: murDe(s.derniere), selection: s.selection, camera: poseCourante(), vueAvant: s.vueAvant };
}

/** Range la vue d'avant le pas `i` qui vient d'etre empile. */
function noterAvant(s: SessionToit, i: number, v: VueSession | null | undefined): void {
  if (v) (s.vuesDesPas ??= { avant: [], apres: [] }).avant[i] = v;
}

let session: SessionToit | null = null;
/** Les objets du plan : de quoi verifier que l'element choisi existe encore ; posee par `creerModeToit`. */
let objetsCourants: (() => readonly ObjetPlan[]) | null = null;
/** Le minuteur qui recalcule les fantomes quand la camera bouge ; actif pendant une session. */
let veille: ReturnType<typeof setInterval> | null = null;

/** La session en cours, ou null : ce que les zones lisent pour se dessiner. */
export const sessionToit = (): Readonly<SessionToit> | null => session;

// La session ecrit le toit du batiment en place, a chaque geste : chaque ecriture se dit (core/controleurObjets.ts), sinon le plan
// et ce qui le lit garderaient le toit d'avant.
function restaurer(o: ObjetPlan, pas: Parameters<typeof restaurerSession>[1]): void {
  restaurerSession(o, pas);
  toucher(o);
}

/**
 * Un batiment pose chez un voisin : le voisinage importe autour de la propriete, ou un batiment de l'IGN que l'import n'a pas pose sur
 * la parcelle du projet (une maison d'une parcelle mitoyenne de la propriete). `surParcellePrincipale` ne s'enregistre qu'a vrai
 * (io/serialisation.ts) : un batiment importe qui ne la porte pas est chez un voisin. Un batiment dessine (sans `bdtopo`) est celui
 * de la personne, ou qu'il soit.
 */
const chezUnVoisin = (o: ObjetPlan): boolean => !!o.voisinage || (!!o.bdtopo && !surParcelleDuProjet(o));

/**
 * Un batiment que le mode Toit sait retoucher : un batiment du projet, pas d'un voisin. `locked` n'y entre pas : il protege le contour
 * (ni deplace, ni supprime, interaction/pointeur.ts), pas le toit, et la maison du projet est verrouillee a l'import (la demonstration :
 * « Maison », « Abri de jardin »).
 */
export const estRetouchable = (o: ObjetPlan | undefined): o is ObjetPlan => !!o && estBatiment(o) && o.type === 'polygon' && !chezUnVoisin(o);

/** Ce qui ferme le mode Toit sur le batiment `o`, a dire a la personne ; null : rien a dire (il s'ouvre, ou ce n'est pas un batiment). */
export function raisonNonRetouchable(o: ObjetPlan | undefined): string | null {
  if (!o || !estBatiment(o) || o.type !== 'polygon' || !chezUnVoisin(o)) return null;
  return 'Ce bâtiment est chez un voisin : le mode Toit ne retouche que les bâtiments de la parcelle du projet.';
}

/**
 * Ce qui empeche d'ouvrir le mode Toit sur la selection `o`, a dire a la personne (le bouton reste, grise, avec cette raison) ; null :
 * rien, il s'ouvre.
 */
export function raisonDOuvrir(o: ObjetPlan | undefined): string | null {
  if (!o) return 'Choisissez d’abord un bâtiment de la parcelle, sur le plan ou dans la liste des objets.';
  if (!estBatiment(o) || o.type !== 'polygon') return 'Le mode Toit retouche un bâtiment : choisissez-en un sur le plan ou dans la liste des objets.';
  return raisonNonRetouchable(o);
}

/**
 * Le batiment `o` tel que le projet le tient pendant la session `s` : une copie, au depart de la session (ses champs du toit et son
 * elevation, `sessionToit.ts::photographier`). Le batiment du plan, lui, porte les gestes : la scene les montre.
 */
function auDepart(o: ObjetPlan, s: Pick<SessionToit, 'hist'>): ObjetPlan {
  const copie = { ...o, ...(o.batiment ? { batiment: { ...o.batiment } } : {}) } as ObjetPlan;
  restaurerSession(copie, s.hist.pas[0] ?? {});
  return copie;
}

/**
 * Les objets a enregistrer : le batiment en session y est a son depart. Rien de la session n'entre dans le projet avant « Valider »,
 * meme quand l'enregistrement seul de la lecture des toits en fond (app/toits/toitsFond.ts) ou Ctrl+S part pendant la session :
 * abandonnee, elle ne laisse aucune trace ; validee, elle marque le projet a enregistrer. `s` : la session en cours par defaut.
 */
export function objetsHorsSession(objets: readonly ObjetPlan[], s: Pick<SessionToit, 'cle' | 'hist'> | null = session): ObjetPlan[] {
  if (!s) return objets as ObjetPlan[];
  return objets.map((o) => (o.key === s.cle ? auDepart(o, s) : o));
}

/** Ce que la barre du mode montre : de quoi griser ses boutons et dire la facade courante. */
export interface EtatToit {
  actif: boolean;
  peutAnnuler: boolean;
  peutRetablir: boolean;
  change: boolean;
  isole: boolean;
  /** « Façade sud · 9,90 m », ou null tant qu'aucune n'est choisie. */
  facade: string | null;
  vue: VueToit;
  /** Une facade a deja ete choisie : la vue « Facade » a quelque chose a montrer. */
  aUneFacade: boolean;
  /** Un corps est isole, ou la facade courante est celle d'un corps qu'on peut isoler. */
  corpsIsole: boolean;
  peutIsolerCorps: boolean;
  /** L'element choisi, s'il existe encore (une annulation a pu le retirer). */
  selection: CibleElement | null;
  /** Le doigt d'invitation se montre encore (rien n'a ete touche). */
  indice: boolean;
  /** La scene montre le toit du projet tel qu'il est avant la session. */
  validee: boolean;
  /**
   * Ce sur quoi la personne travaille, en une ligne : « Corps 2 · façade ouest · 6,50 m ». Le corps est celui des gestes (le choisi, ou a
   * defaut celui de la facade regardee), la facade la courante ; sans rien, l'invitation a toucher un mur.
   */
  designation: string;
  /** Le corps que designe cette ligne (rang dans `corpsToit`), ou null : le navigateur des facades le met en evidence. */
  rangCorps: number | null;
}

/** Le corps qui porte une cible : une saillie renvoie a son corps porteur. */
function corpsPorteur(corps: readonly CorpsToit[], rang: number): number {
  const c = corps[rang];
  return c?.saillie && corps[c.saillie.hote] ? c.saillie.hote : rang;
}

/** La ligne « Corps · Façade » (voir `EtatToit.designation`). */
function designer(s: SessionToit, sel: CibleElement | null): { designation: string; rangCorps: number | null } {
  const o = objetsCourants ? objetsCourants().find((x) => x.key === s.cle) : undefined, corps = o?.batiment?.corpsToit ?? [];
  const f = s.facade;
  const rangCorps = sel ? corpsPorteur(corps, sel.rang) : f && f.rang !== null && corps.length > 1 ? f.rang : null;
  const nom = rangCorps === null ? null : listerElements(corps).find((e) => e.cible.type === 'corps' && e.cible.rang === rangCorps)?.libelle ?? null;
  const facade = f ? 'Façade ' + orientationDe(f).toLowerCase() + ' · ' + f.L.toFixed(2).replace('.', ',') + ' m' + photoDuMur(f) : null;
  if (!nom) return { designation: facade ?? 'Touchez un mur du bâtiment pour choisir sa façade.', rangCorps };
  return { designation: nom + ' · ' + (facade ? facade.charAt(0).toLowerCase() + facade.slice(1) : 'touchez un de ses murs pour choisir sa façade'), rangCorps };
}

/** La selection si l'element existe encore dans le batiment en session. */
function selectionValide(): CibleElement | null {
  const s = session;
  if (!s?.selection || !objetsCourants) return null;
  const o = objetsCourants().find((x) => x.key === s.cle);
  return o?.batiment?.corpsToit && lireElement(o.batiment?.corpsToit, s.selection) ? s.selection : null;
}

export function etatToit(): EtatToit {
  if (!session) return { actif: false, peutAnnuler: false, peutRetablir: false, change: false, isole: false, facade: null, vue: 'libre', aUneFacade: false, corpsIsole: false, peutIsolerCorps: false, selection: null, indice: false, validee: false, designation: '', rangCorps: null };
  const f = session.facade ?? session.derniere, sel = selectionValide();
  return {
    ...designer(session, sel),
    actif: true, peutAnnuler: peutAnnuler(session.hist), peutRetablir: peutRetablir(session.hist), change: aChange(session.hist), isole: session.isole,
    facade: session.facade ? 'Façade ' + orientationDe(session.facade).toLowerCase() + ' · ' + session.facade.L.toFixed(2).replace('.', ',') + ' m' + photoDuMur(session.facade) : null,
    vue: session.vue, aUneFacade: !!session.derniere, corpsIsole: session.corpsIsole !== null, peutIsolerCorps: !!f && f.rang !== null, selection: sel, indice: session.indice, validee: session.validee
  };
}

/** Ce que la photo validee de ce mur en dit (lot F5), apres la facade courante : « · vue sur la photo (triangle, 2 pointes) ». */
function photoDuMur(f: FacadeVisee): string {
  const o = session && objetsCourants ? objetsCourants().find((x) => x.key === session?.cle) : undefined;
  const r = o ? facadeValideeDuMur(f, o.batiment?.facades, enPoints(o).pts as PtBrut[]) : null;
  return r ? ' · ' + texteDeLaPhoto(r) : '';
}

/**
 * Les murs du batiment en session qui portent une Facade validee (V4, lot F5), par `rang:mur` : le navigateur de facades les
 * marque, le Mode Toit dit ce que la photo en a lu.
 */
export function mursVusSurPhoto(objets: readonly ObjetPlan[]): Set<string> {
  const o = session ? objets.find((x) => x.key === session?.cle) : undefined;
  if (!o?.batiment?.facades?.some((r) => r.dimensions)) return new Set();
  const pts = enPoints(o).pts as PtBrut[];
  return new Set(facadesDuBatiment(o.batiment.corpsToit, pts).filter((f) => facadeValideeDuMur(f, o.batiment?.facades, pts)).map((f) => (f.rang ?? '') + ':' + f.mur));
}

/** Les murs du batiment en session : de quoi dessiner le navigateur de facades (sans passer par le mode). */
export function facadesDeSession(objets: readonly ObjetPlan[]): FacadeVisee[] {
  const o = session ? objets.find((x) => x.key === session?.cle) : undefined;
  return o ? facadesDuBatiment(o.batiment?.corpsToit, enPoints(o).pts as PtBrut[]) : [];
}

export interface ContexteModeToit {
  /** Redessine le batiment `cle` dans la scene 3D : ce qu'une session change se voit tout de suite. */
  rebatir: (cle: string) => void;
  /** Redessine les zones. */
  rafraichir: () => void;
}

/** Ce que le panneau du mode recouvre de la scene : une colonne a droite (grand ecran) ou un bandeau en bas ; zero sans panneau. */
function reserveDuPanneau(): Reserve | undefined {
  const hote = hotes3d.vue3d, panneau = hote?.querySelector('.panneauToit');
  if (!hote || !panneau) return undefined;
  const h = hote.getBoundingClientRect(), p = panneau.getBoundingClientRect();
  if (!h.width || !h.height) return undefined;
  // Une colonne (plus etroite que la scene, qui en couvre la hauteur) ou un bandeau (pose en bas).
  if (p.width < h.width * 0.6) return { largeur: h.width, hauteur: h.height, droite: Math.max(0, h.right - p.left), bas: 0 };
  return { largeur: h.width, hauteur: h.height, droite: 0, bas: Math.max(0, h.bottom - p.top) };
}

/** Une facade choisie sur le contour (le batiment n'avait pas de corps) devient le mur du corps qui vient de naitre au meme endroit. */
function rattacherLesFacades(s: SessionToit, o: ObjetPlan): void {
  if (!o.batiment?.corpsToit?.length) return;
  const murs = facadesDuBatiment(o.batiment?.corpsToit, enPoints(o).pts as PtBrut[]);
  const refaire = (f: FacadeVisee | null): FacadeVisee | null => (f && f.rang === null ? facadeProche(murs, { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 }) ?? f : f);
  s.facade = refaire(s.facade);
  s.derniere = refaire(s.derniere);
}

/** La hauteur du faitage du batiment : de quoi cadrer la facade en entier. */
function hauteurDe(o: ObjetPlan): number {
  const corps = (o.batiment?.corpsToit ?? []).map((c) => c.faitage);
  return corps.length ? Math.max(...corps) : (o.elevation ?? 3) + (o.batiment?.toit?.hauteur ?? 2.5);
}

/**
 * L'altitude dans la scene d'ou se comptent les hauteurs du batiment (egouts, faitages) : le sol en son centre sur un relief
 * (three/scene.ts pose ainsi les corps), zero sur sol plat. Les poignees et les reperes s'y ajoutent.
 */
export function altitudeDuBatiment(o: ObjetPlan | undefined): number {
  const sc = vue3d.scene, pts = o ? (enPoints(o).pts as PtBrut[]) : [];
  return sc?.hauteurSol && pts.length ? sc.hauteurSol(centroid(pts)) : 0;
}

/** Le batiment dans la scene : son contour et ses corps, du pied au-dessus du faitage. De quoi cadrer la camera de facade. */
function pointsDuBatiment(o: ObjetPlan): PointScene[] {
  const sc = vue3d.scene;
  if (!sc) return [];
  const base = altitudeDuBatiment(o), haut = base + hauteurDe(o) + 0.5;
  const plan = [...(enPoints(o).pts as PtBrut[]), ...(o.batiment?.corpsToit ?? []).flatMap((c) => c.pts)];
  return plan.flatMap((p) => [base, haut].map((y) => ({ x: p.x - sc.cen.x, y, z: sc.cen.y - p.y })));
}

/** Un corps du batiment dans la scene, du pied au-dessus de son faitage : de quoi cadrer la camera libre sur lui. */
function pointsDuCorps(o: ObjetPlan, rang: number): PointScene[] {
  const sc = vue3d.scene, c = o.batiment?.corpsToit?.[rang];
  if (!sc || !c) return [];
  const base = altitudeDuBatiment(o), haut = base + c.faitage + 0.5;
  return c.pts.flatMap((p) => [base, haut].map((y) => ({ x: p.x - sc.cen.x, y, z: sc.cen.y - p.y })));
}

/** La camera libre cadree sur `points` (le batiment, un corps), de la direction d'ou l'on regarde, dans ce que le panneau laisse libre. */
function cadrerEnPerspective(points: readonly PointScene[]): void {
  const sc = vue3d.scene, depuis = poseCourante();
  if (!sc || !depuis || !points.length) return;
  poserCamera(poseEnPerspective(points, depuis, sc.camera.fov, sc.camera.aspect, reserveDuPanneau()));
  derniereVue = '';
}

/**
 * Ce que la camera de facade tient dans l'image : l'element choisi quand la facade regardee est la sienne (`murDeCadrage` : on zoome sur
 * lui, avec un peu de toit autour), sinon le batiment entier. Lacher l'element rend la facade entiere.
 */
export function pointsDeLaVue(o: ObjetPlan, s: SessionToit): PointScene[] {
  const sc = vue3d.scene, corps = o.batiment?.corpsToit ?? [], t = s.selection, f = s.facade;
  if (!sc || !t || !f || !corps.length) return pointsDuBatiment(o);
  const m = murDeCadrage(corps, t, f);
  const boite = m && m.rang === f.rang && m.mur === f.mur ? emprisePourCadrer(corps, t) : [];
  if (!boite.length) return pointsDuBatiment(o);
  const base = altitudeDuBatiment(o);
  return boite.map((p) => ({ x: p.x - sc.cen.x, y: base + p.z, z: sc.cen.y - p.y }));
}

/** La camera et les reglages vus la derniere fois : tant qu'ils ne changent pas, les fantomes ne sont pas recalcules. */
let derniereVue = '';
/** Le rythme auquel on regarde si la camera a bouge. */
const FANTOMES_MS = 200;
let surveillerLaVue: () => void = () => {};

/**
 * Rebatit la scene, et rend a la nouvelle camera la pose de l'ancienne : une scene neuve se recadre sur le plan, ce qui chasserait la
 * personne de la facade qu'elle regarde a chaque retouche.
 */
function rebatirEnGardantLaCamera(ctx: ContexteModeToit, batiment: () => ObjetPlan | undefined): () => void {
  return () => {
    const avant = vue3d.scene;
    const pose = avant ? { p: avant.camera.position.clone(), t: avant.controls.target.clone() } : null;
    const o = batiment();
    if (avant && o) ctx.rebatir(o.key);
    const apres = vue3d.scene;
    if (pose && apres && apres !== avant) {
      apres.camera.position.copy(pose.p);
      apres.controls.target.copy(pose.t);
      apres.controls.update();
    }
    derniereVue = '';
  };
}

/** Le mode de la session en cours : les zones qui dessinent des poignees (zones/vue3d/PoigneesToit.tsx) s'y adressent sans passer par une commande. */
let pilote: ModeToit | null = null;
/** Repose sur la scene ce que la vue de la session demande (posee par `creerModeToit`) ; `abonne` : une seule ecoute des scenes baties. */
let vueReposee: () => void = () => {};
let abonne = false;
/** Le mode a epure la scene (le batiment seul) : a lui de la rendre. */
let epureParLeMode = false;
export const modeToitCourant = (): ModeToit | null => pilote;

/**
 * L'entree d'historique du navigateur que pose une session : le bouton retour (navigateur, telephone) vaut Echap tant qu'elle dure,
 * au lieu de quitter Plan et d'emporter les gestes non valides. Fermee autrement, la session retire son entree elle-meme.
 */
let entreePosee = false;
let retourIgnore = false;
const historiqueNavigateur = (): History | null => (typeof window === 'undefined' ? null : window.history);

/** Pose l'entree de la session (une seule) : le prochain retour du navigateur revient ici. */
export function poserEntreeHistorique(): void {
  const h = historiqueNavigateur();
  if (!h || entreePosee) return;
  try { h.pushState(h.state, ''); entreePosee = true; } catch { /* historique indisponible : Echap reste */ }
}

/** Retire l'entree de la session, si elle est encore la ; le retour qu'elle provoque est ignore (`retourDuNavigateur`). */
function retirerEntreeHistorique(): void {
  const h = historiqueNavigateur();
  if (!h || !entreePosee) return;
  entreePosee = false;
  retourIgnore = true;
  try { h.back(); } catch { retourIgnore = false; }
}

/**
 * Un retour du navigateur vient d'arriver : faux si c'est celui que la session a provoque en retirant son entree ; vrai si c'est la
 * personne (son entree est alors consommee, a reposer si la session continue).
 */
export function retourDuNavigateur(): boolean {
  if (retourIgnore) { retourIgnore = false; return false; }
  entreePosee = false;
  return true;
}

/** La sortie du mode rend le focus au bouton « Modifier la toiture » : l'heure ou elle l'a demande (un focus ne se rend que tout de suite). */
let focusDemande = 0;
const FOCUS_DE_SORTIE_MS = 1500;

/** Vrai une fois, juste apres la sortie du mode : le bouton qui l'ouvre reprend le focus (zones/vue3d/BoutonModifierToit.tsx). */
export function prendreFocusDeSortie(): boolean {
  const oui = focusDemande > 0 && Date.now() - focusDemande < FOCUS_DE_SORTIE_MS;
  focusDemande = 0;
  return oui;
}

/** Le rythme maximal auquel un glisser reconstruit la scene : au-dela, seul le dernier etat compte. */
const GLISSER_MS = 140;
let dernierRebatir = 0;

  /**
   * Ce que la vue de la session demande a la scene : en 3D libre, la scene telle quelle ; devant une facade ou de dessus, le batiment seul
   * (`epurerVue3d` : ni terrasse, ni cloture, ni arbres, ni voisins) et, devant une facade, la camera oblique de la maquette.
   */
function creerReposeDeVue(batiment: () => ObjetPlan | undefined): () => void {
  return (): void => {
    const s = session, sc = vue3d.scene, o = batiment();
    if (!s || !sc || !o || (s.vue === 'libre' && !s.isole)) {
      if (sc) retirerCameraFacade(sc);
      // Seule l'epure que le mode a posee se retire : celle de l'audit ne lui appartient pas.
      if (epureParLeMode) { moteur3d()?.epurerVue3d(null); epureParLeMode = false; }
      return;
    }
    moteur3d()?.epurerVue3d((cle) => cle === s.cle);
    epureParLeMode = true;
    if (s.vue === 'libre') { retirerCameraFacade(sc); return; }
    if (s.vue === 'facade' && s.facade) poserCameraFacade(sc, s.facade, pointsDeLaVue(o, s), reserveDuPanneau());
    else retirerCameraFacade(sc);
  };
}

/** Les batiments qui cachent celui qu'on retouche, en 3D libre : leur volume part, leur contour reste en pointille. */
function majFantomesDe(objets: readonly ObjetPlan[]): void {
  // Une scene ouverte : le moteur est la (three/demande3d.ts).
  const sc = vue3d.scene, s = session, m = moteur3d();
  if (!sc || !s || !m) return;
  const autres = new Map<string, readonly THREE_NS.Object3D[]>();
  for (const o of objets) if (estBatiment(o) && o.key !== s.cle) { const r = m.racinesDe3d(o.key); if (r.length) autres.set(o.key, r); }
  majFantomes(sc, m.racinesDe3d(s.cle), autres, s.vue === 'libre' && !s.isole);
}

/** Le toit du projet est montre : la session reprend sa place (son dernier etat) avant tout geste. */
function reprendre(o: ObjetPlan, s: SessionToit): void {
  if (!s.validee) return;
  restaurer(o, s.hist.pas[s.hist.i] ?? {});
  s.validee = false;
}

/** Montre le toit du projet (le depart de la session) ou rend la session ; faux : rien n'a change, il n'y a rien a comparer. */
function voirLeToitDuProjet(o: ObjetPlan, s: SessionToit): boolean {
  if (s.validee) { reprendre(o, s); return true; }
  if (!aChange(s.hist)) return false;
  restaurer(o, s.hist.pas[0] ?? {});
  s.validee = true;
  return true;
}

/**
 * Ecrit la session dans le projet en une seule etape d'historique (le depart d'abord, puis l'etat final) ; vrai si elle a change
 * quelque chose. Chaque geste du mode fige le toit lui-meme (la personne l'a regle) ; un toit sans la marque a la fin, c'est que
 * la personne a rallume les « Règles » : il est rendu a la lecture automatique, ne se refige pas, et la tache de fond le relit
 * tout de suite plutot qu'a la prochaine ouverture du projet.
 */
export function validerLaSession(a: Pick<Atelier, 'pushHistory' | 'markDirty'>, o: ObjetPlan, s: SessionToit): boolean {
  reprendre(o, s);
  const final = photographier(o), change = aChange(s.hist);
  if (change) {
    restaurer(o, s.hist.pas[0] ?? {});
    a.pushHistory(o);
    restaurer(o, final);
    a.markDirty(o);
    if (!final.toitFige) lectureToits.demanderRelecture();
  }
  return change;
}

/** Une facade d'un autre corps que celui des gestes : le corps choisi devient le sien (une seule designation, « Corps · Façade »). */
function suivreLeCorpsDe(o: ObjetPlan | undefined, f: FacadeVisee): void {
  const s = session, corps = o?.batiment?.corpsToit ?? [];
  if (s?.selection && f.rang !== null && corpsPorteur(corps, s.selection.rang) !== f.rang) s.selection = { type: 'corps', rang: f.rang, i: 0 };
}

/**
 * Le cadrage d'un corps choisi, ou du batiment entier sans rien de choisi en 3D libre (audit de la navigation, 6 novembre 2026) : de face,
 * la facade la plus visible du corps (a montrer par l'appelant) ; en 3D libre, la camera se cadre ici, et la reponse est `true`. `null` :
 * ce n'est pas un corps (un element se cadre par sa facade), ou la vue est celle de dessus.
 */
function cadrageDuCorps(o: ObjetPlan | undefined, facadeVisible: (rang: number) => FacadeVisee | null): FacadeVisee | true | null {
  const s = session;
  if (!s || !o || s.vue === 'dessus' || !(s.selection?.type === 'corps' || (!s.selection && s.vue === 'libre'))) return null;
  const rang = s.selection?.rang ?? null, f = rang !== null && s.vue === 'facade' ? facadeVisible(rang) : null;
  if (f) return f;
  if (s.vue === 'libre') cadrerEnPerspective(rang === null ? pointsDuBatiment(o) : pointsDuCorps(o, rang));
  return true;
}

/** La facade d'un corps la plus visible de la camera (tournee vers elle, pas cachee par un autre corps), parmi `murs`. */
function facadeVisibleDe(o: ObjetPlan | undefined, rang: number, murs: FacadeVisee[]): FacadeVisee | null {
  const sc = vue3d.scene, s = session;
  if (!sc || !s) return null;
  // Devant une facade, l'oeil est devant elle ; ailleurs, c'est la camera de l'orbite (et sa hauteur au-dessus du batiment).
  const fc = s.vue === 'facade' ? s.facade : null;
  const oeil = fc ? { x: (fc.a.x + fc.b.x) / 2 + fc.n.x * 50, y: (fc.a.y + fc.b.y) / 2 + fc.n.y * 50 }
    : { x: sc.camera.position.x + sc.cen.x, y: sc.cen.y - sc.camera.position.z, z: sc.camera.position.y - altitudeDuBatiment(o) };
  const corps = o?.batiment?.corpsToit, mur = corps?.[rang] ? murLePlusVisible(corps, rang, oeil) : null;
  return murs.find((x) => x.rang === rang && x.mur === mur) ?? facadeVersLePoint(murs, rang, oeil) ?? null;
}

/** La vue d'un pas de la session (Ctrl+Z, Ctrl+Y) : la facade retrouvee par son corps et son mur parmi `murs`, l'element choisi, la camera. */
function rendreLaVueDe(v: VueSession | undefined, murs: FacadeVisee[], reposerLaVue: () => void): void {
  const s = session;
  if (!s || !v) return;
  const trouve = (m: MurDe | null) => (m ? murs.find((f) => f.rang === m.rang && f.mur === m.mur) ?? null : null);
  s.selection = v.selection;
  s.derniere = trouve(v.derniere) ?? s.derniere;
  s.vueAvant = v.vueAvant;
  const f = v.vue === 'facade' ? trouve(v.facade) : null;
  s.vue = v.vue === 'facade' && !f ? 'libre' : v.vue;
  s.facade = f;
  if (v.camera) poserCamera(v.camera);
  derniereVue = '';
  reposerLaVue();
}

/** La camera de dessus, cadree sur le batiment `o` dans ce que le panneau laisse libre. */
function poserVueDeDessus(o: ObjetPlan): void {
  const sc = vue3d.scene;
  if (!sc) return;
  const pts = enPoints(o).pts as PtBrut[], xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  poserCamera(poseDeDessus(centre, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), sc.cen, sc.camera.fov, sc.camera.aspect, reserveDuPanneau()));
}

/** Ctrl+Z, Ctrl+Y et « Revenir au depart » de la session : le toit change, et la vue de ce pas revient avec lui (`rendreLaVue`). */
function creerPas(batiment: () => ObjetPlan | undefined, rebatir: () => void, ctx: ContexteModeToit, rendreLaVue: (v: VueSession | undefined) => void) {
  return (geste: 'annuler' | 'retablir' | 'depart'): void => {
    const o = batiment(), s = session;
    if (!o || !s) return;
    reprendre(o, s);
    const i = s.hist.i, ici = capturerVue(s);
    const fait = geste === 'annuler' ? annuler(s.hist, o) : geste === 'retablir' ? retablir(s.hist, o) : revenirAuDepart(s.hist, o);
    if (!fait) return;
    toucher(o);
    rebatir();
    const m = (s.vuesDesPas ??= { avant: [], apres: [] });
    if (geste === 'annuler') { m.apres[i] = ici; rendreLaVue(m.avant[i]); }
    else if (geste === 'retablir') rendreLaVue(m.apres[s.hist.i]);
    else noterAvant(s, s.hist.i, ici);
    ctx.rafraichir();
  };
}

/** Ce qui regarde, au rythme de `FANTOMES_MS`, si la camera ou l'image ont change : la facade se recadre, les fantomes se recalculent. */
function creerSurveillance(reposerLaVue: () => void, fantomes: () => void): () => void {
  return () => {
    const sc = vue3d.scene, s = session;
    if (!sc || !s) return;
    const p = sc.camera.position, t = sc.controls.target, el = sc.renderer.domElement;
    const cle = [p.x, p.y, p.z, t.x, t.y, t.z].map((v) => v.toFixed(2)).join() + (s.isole ? 'i' : '') + s.vue + (s.corpsIsole ?? '') + el.clientWidth + 'x' + el.clientHeight;
    if (cle === derniereVue) return;
    derniereVue = cle;
    if (s.vue === 'facade') reposerLaVue();  // l'image a change de taille (plein ecran, telephone tourne) : la facade se recadre
    fantomes();
  };
}

export function creerModeToit(a: Atelier, ctx: ContexteModeToit) {
  objetsCourants = () => a.etat.objects;
  const batiment = (): ObjetPlan | undefined => (session ? a.etat.objects.find((o) => o.key === session?.cle) : undefined);
  const reposerLaVue = creerReposeDeVue(batiment);
  // Une scene neuve (un reglage de la Vue 3D la rebatit) n'a ni camera de facade ni epure : on les lui repose.
  vueReposee = reposerLaVue;
  if (!abonne) abonne = !!abonnerSceneBatie(() => { if (session) vueReposee(); });
  const rebatir = rebatirEnGardantLaCamera(ctx, batiment);

  surveillerLaVue = creerSurveillance(reposerLaVue, () => { majFantomesDe(a.etat.objects); });

  const fermer = (): void => {
    if (!session) return;
    const cle = session.cle, camera = session.cameraAvantMode;
    reglerVue3d({ corpsIsole: null });
    viderFantomes();
    if (veille !== null) { clearInterval(veille); veille = null; }
    session = null;
    retirerEntreeHistorique();
    reposerLaVue();
    a.render();
    if (vue3d.scene) ctx.rebatir(cle);  // le batiment tel que la session le laisse ; le reste de la scene ne bouge pas
    if (camera) poserCamera(camera);  // la camera d'avant le mode : on retrouve la scene comme on l'avait laissee
    // Le focus etait dans le panneau, qui disparait (ou nulle part) : il revient au bouton qui ouvre le mode, pas au corps de la page.
    const actif = typeof document === 'undefined' ? null : document.activeElement;
    if (!actif || actif === document.body || actif.closest('.panneauToit, .navigateurToit, .dialogueBoite')) focusDemande = Date.now();
    ctx.rafraichir();
  };

  const vues = creerVuesToit(ctx, batiment, rebatir, reposerLaVue);
  const pas = creerPas(batiment, rebatir, ctx, vues.methodes.rendreLaVue);

  const mode = {
    /** Entre dans le mode sur le batiment selectionne. */
    ouvrir(): boolean {
      const o = a.etat.objects.find((x) => x.key === a.etat.selectedKey);
      if (session || !estRetouchable(o)) return false;
      session = { cle: o.key, hist: creerHistorique(o), facade: null, derniere: null, vue: 'libre', corpsIsole: null, selection: null, indice: true, vueAvant: null, isole: false, validee: false, cameraAvantMode: poseCourante() };
      // Les batiments qui cachent celui qu'on retouche deviennent des contours pointilles, des que la camera bouge.
      derniereVue = '';
      veille = setInterval(surveillerLaVue, FANTOMES_MS);
      poserEntreeHistorique();
      ctx.rafraichir();
      const s = session;  // le panneau pose, la maison se cadre dans ce qu'il laisse libre ; sa ligne invite a toucher un mur
      setTimeout(() => { if (session === s && s.vue === 'libre') cadrerEnPerspective(pointsDuBatiment(o)); }, 60);
      return true;
    },

    /** Une retouche du toit : `f` ecrit dans le batiment ; faux = rien n'a change. La scene suit, la session empile. */
    ecrire(f: (o: ObjetPlan) => boolean | void): boolean {
      const o = batiment(), s = session;
      if (!o || !s) return false;
      reprendre(o, s);
      const avant = capturerVue(s);
      if (f(o) === false) return false;
      toucher(o);
      // Un geste peut creer le premier corps (le toit simple devient un corps) : la facade choisie sur le contour se rattache a son mur.
      rattacherLesFacades(s, o);
      if (empiler(s.hist, o)) noterAvant(s, s.hist.i, avant);
      rebatir();
      ctx.rafraichir();
      return true;
    },

    annuler: () => { pas('annuler'); },
    retablir: () => { pas('retablir'); },
    revenirAuDepart: () => { pas('depart'); },

    /** Montre le toit du projet avant la session, ou revient a la session (le moindre geste y revient aussi). */
    voirValide(): void {
      const o = batiment(), s = session;
      if (!o || !s) return;
      if (!voirLeToitDuProjet(o, s)) { showToast('Rien n’a changé : c’est déjà le toit du projet.'); return; }
      rebatir();
      ctx.rafraichir();
    },

    /** Le premier geste de la personne : l'invitation a toucher le batiment disparait. */
    leverIndice(): void {
      if (!session?.indice) return;
      session.indice = false;
      ctx.rafraichir();
    },

    /** Choisit un element (ou aucun) : l'inspecteur regle ce qui est choisi. */
    selectionner(cible: CibleElement | null): void {
      if (!session || memeCible(session.selection, cible)) return;
      session.selection = cible;
      // Un element choisi (pastille, toucher, pose) se montre de pres ; lache, la facade revient entiere.
      vues.methodes.cadrerSurLaSelection();
    },

    /**
     * Isole le batiment : le reste de la scene est masque (etat d'affichage, jamais enregistre). Par l'epure de la Vue 3D, pas par
     * l'isolement du plan, qui est celui d'une terrasse (scene recentree sur elle, lames en transparence).
     */
    basculerIsolement(): void {
      const s = session;
      if (!s) return;
      s.isole = !s.isole;
      reposerLaVue();
      ctx.rafraichir();
    },

    /** Valide : une seule etape d'historique du projet pour toute la session. */
    valider(): boolean {
      const o = batiment(), s = session;
      if (!o || !s) return false;
      const fige = validerLaSession(a, o, s);
      fermer();
      showToast(fige ? 'Toit validé.' : 'Aucun changement.');
      return true;
    },

    /** Abandonne : le depart revient. Avec des changements, une question d'abord (sauf `sansDemander`). */
    abandonner(sansDemander = false): void {
      const s = session, o = batiment();
      if (!s) return;
      const rendre = () => { if (o) restaurer(o, s.hist.pas[0] ?? {}); fermer(); };
      if (sansDemander || !aChange(s.hist)) { rendre(); return; }
      demanderAbandon(rendre);
    },

    /** Echap : l'element choisi, la facade, puis le mode ; en plein ecran, la derniere marche reste a la Vue 3D. Vrai si la touche a servi. */
    echap(pleinePage = false): boolean {
      if (!session) return false;
      if (session.selection) { session.selection = null; vues.methodes.cadrerSurLaSelection(); return true; }
      if (session.vue !== 'libre') { vues.quitterLaFacade(); return true; }
      if (!pleinePage) this.abandonner();
      return !pleinePage;
    },

    /** Quitte le mode sans question : la Vue 3D se ferme, ou la selection change. */
    arreterSansDemander(raison: string): void {
      if (!session) return;
      const change = aChange(session.hist);
      this.abandonner(true);
      if (change) showToast(raison);
    },

    hote: () => hotes3d.vue3d,
    ...vues.methodes
  };
  pilote = mode;
  return mode;
}


/** Tout ce qui regarde la camera du mode : la facade choisie, la vue libre, de dessus, le corps isole. */
function creerVuesToit(ctx: ContexteModeToit, batiment: () => ObjetPlan | undefined, rebatir: () => void, reposerLaVue: () => void) {
  /** Remet la camera comme elle etait avant la facade. */
  const quitterLaFacade = (): void => {
    const s = session, sc = vue3d.scene;
    if (!s || s.vue === 'libre') return;
    s.facade = null;
    s.vue = 'libre';
    reposerLaVue();
    if (s.vueAvant && sc) poserCamera(s.vueAvant);
    s.vueAvant = null;
    ctx.rafraichir();
  };

  const entrerDansLaFacade = (f: FacadeVisee): void => {
    const s = session, sc = vue3d.scene;
    if (!s || !batiment() || !sc) return;
    if (!s.vueAvant) s.vueAvant = { position: { ...sc.camera.position }, cible: { ...sc.controls.target } };
    s.facade = f;
    s.derniere = f;
    s.vue = 'facade';
    // La camera de l'orbite ne bouge pas : la camera oblique l'emporte le temps de la facade, et la 3D libre retrouve la sienne.
    reposerLaVue();
    ctx.rafraichir();
  };

  const facades = (): FacadeVisee[] => {
    const o = batiment();
    return o ? facadesDuBatiment(o.batiment?.corpsToit, enPoints(o).pts as PtBrut[]) : [];
  };

  const suivreLeCorps = (f: FacadeVisee): void => { suivreLeCorpsDe(batiment(), f); };
  const facadeVisibleDuCorps = (rang: number): FacadeVisee | null => facadeVisibleDe(batiment(), rang, facades());

  // La camera suit l'element choisi : devant la facade qui le porte, cadree sur lui (`pointsDeLaVue`) ; sans element, la facade revient
  // entiere. Un corps choisi : de face, sa facade la plus visible ; en 3D libre, la camera se cadre sur lui ; rien de choisi en 3D libre,
  // sur le batiment entier (audit de la navigation, 6 novembre 2026). De dessus, la vue reste (on y regarde le plan).
  const cadrerSurLaSelection = (): void => {
    const s = session, o = batiment();
    const corps = cadrageDuCorps(o, facadeVisibleDuCorps);
    if (corps) { if (typeof corps === 'object') entrerDansLaFacade(corps); else ctx.rafraichir(); return; }
    const m = s?.selection && o && s.vue !== 'dessus' ? murDeCadrage(o.batiment?.corpsToit ?? [], s.selection, s.facade ?? s.derniere) : null;
    const f = m ? facades().find((x) => x.rang === m.rang && x.mur === m.mur) : undefined;
    if (f) { entrerDansLaFacade(f); return; }
    if (s?.vue === 'facade') reposerLaVue();
    ctx.rafraichir();
  };

  const rendreLaVue = (v: VueSession | undefined): void => { rendreLaVueDe(v, facades(), reposerLaVue); };

  return {
    quitterLaFacade,
    methodes: {
    cadrerSurLaSelection,
    rendreLaVue,

    /** Un glisser en cours : les corps (et la hauteur a l'egout, si le corps principal l'a changee) remplacent ceux du batiment, la scene suit au plus tous les `GLISSER_MS` ; rien n'entre dans la pile avant `finGlisser`. */
    apercu(corps: CorpsToit[], elevation?: number): void {
      const o = batiment();
      if (!o || !session) return;
      session.vueDuGlisser ??= capturerVue(session);
      ecrireLeGeste(o, corps, elevation);
      toucher(o);
      const t = Date.now();
      if (t - dernierRebatir >= GLISSER_MS) { dernierRebatir = t; rebatir(); }
    },

    /** Le glisser s'acheve : le batiment est reconstruit tel quel et la session empile une etape (une seule, quel que soit le trajet). */
    finGlisser(): boolean {
      const o = batiment(), s = session;
      if (!o || !s) return false;
      const change = empiler(s.hist, o);
      if (change) noterAvant(s, s.hist.i, s.vueDuGlisser);
      s.vueDuGlisser = null;
      rebatir();
      ctx.rafraichir();
      return change;
    },

    /** Echap pendant un glisser : le batiment retrouve l'etat de la pile. */
    annulerGlisser(): void {
      const o = batiment(), s = session;
      if (!o || !s) return;
      s.vueDuGlisser = null;
      restaurer(o, s.hist.pas[s.hist.i] ?? {});
      rebatir();
      ctx.rafraichir();
    },

    /** Le toucher sur la scene : la facade du batiment la plus proche du point touche. Vrai si le toucher a choisi une facade. */
    toucher(ndc: { x: number; y: number }): boolean {
      const o = batiment();
      if (!session || !o) return false;
      const touche = moteur3d()?.objetSousLePointeur(ndc, (cle) => cle === o.key);
      if (!touche || touche.cle !== o.key || !touche.point) return false;
      // Un element tout pres du point touche se choisit ; sinon c'est un mur, donc une facade.
      const cible = o.batiment?.corpsToit ? elementProche(o.batiment?.corpsToit, touche.point) : null;
      if (cible) { session.selection = cible; cadrerSurLaSelection(); return true; }
      const f = facadeProche(facadesDuBatiment(o.batiment?.corpsToit, enPoints(o).pts as PtBrut[]), touche.point);
      if (!f) return false;
      suivreLeCorps(f);
      entrerDansLaFacade(f);
      return true;
    },

    /** Choisit une facade du navigateur : le mur `mur` du corps `rang` (null : du contour). */
    choisirFacade(rang: number | null, mur: number): boolean {
      const f = facades().find((x) => x.rang === rang && x.mur === mur);
      if (!f || !session) return false;
      suivreLeCorps(f);
      entrerDansLaFacade(f);
      return true;
    },

    /** Toucher un corps dans le navigateur : sa facade la plus visible de la camera (tournee vers elle, pas cachee par un autre corps). */
    choisirFacadeDuCorps(rang: number): boolean {
      const f = facadeVisibleDuCorps(rang);
      if (!f) return false;
      suivreLeCorps(f);
      entrerDansLaFacade(f);
      return true;
    },

    /** Change de vue : 3D libre (la camera d'avant), devant la derniere facade choisie, ou de dessus. */
    voir(vue: VueToit): void {
      const s = session, o = batiment(), sc = vue3d.scene;
      if (!s || !o || !sc || s.vue === vue) return;
      if (vue === 'libre') { quitterLaFacade(); return; }
      if (vue === 'facade') { if (s.derniere) entrerDansLaFacade(s.derniere); return; }
      if (!s.vueAvant) s.vueAvant = { position: { ...sc.camera.position }, cible: { ...sc.controls.target } };
      poserVueDeDessus(o);
      s.facade = null;
      s.vue = 'dessus';
      reposerLaVue();
      ctx.rafraichir();
    },

    /** Isole le corps de la facade courante : les autres corps du batiment disparaissent (etat d'affichage). */
    basculerCorpsIsole(): void {
      const s = session, f = s?.facade ?? s?.derniere;
      if (!s || !f || f.rang === null) return;
      s.corpsIsole = s.corpsIsole === null ? f.rang : null;
      reglerVue3d({ corpsIsole: s.corpsIsole === null ? null : { cle: s.cle, rang: s.corpsIsole } });
      rebatir();
      ctx.rafraichir();
    },

    }
  };
}

export type ModeToit = ReturnType<typeof creerModeToit>;

/** La question avant d'abandonner une session modifiee (Retour, Echap) ; `rendre` remet le depart et ferme. */
function demanderAbandon(rendre: () => void): void {
  dialogues.ouvrir({
    type: 'choix', titre: 'Abandonner les changements ?', texte: 'Le toit reviendra comme il était à l’entrée du mode.',
    principal: { libelle: 'Continuer', executer: () => {} },
    secondaire: { libelle: 'Abandonner', executer: rendre }
  });
}

/**
 * Quitter la session pour faire autre chose (une autre vue, un autre objet) : sans changement, elle se ferme et `suite` part ; avec
 * des changements, la personne choisit d'abord — Valider, Abandonner, ou Rester (rien ne part).
 */
export function quitterLaSessionPuis(mode: Pick<ModeToit, 'valider' | 'abandonner'>, suite: () => void): void {
  const s = session;
  if (!s) { suite(); return; }
  if (!aChange(s.hist)) { mode.abandonner(true); suite(); return; }
  dialogues.ouvrir({
    type: 'choix', titre: 'Quitter la modification de la toiture ?', texte: 'Vos changements du toit ne sont pas encore dans le projet.',
    principal: { libelle: 'Valider', executer: () => { mode.valider(); suite(); } },
    secondaire: { libelle: 'Abandonner', executer: () => { mode.abandonner(true); suite(); } },
    tertiaire: { libelle: 'Rester', executer: () => {} }
  });
}
