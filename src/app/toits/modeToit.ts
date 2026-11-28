// La session d'edition du toit, cote application (MD/spec-mode-toit-3d.md) : elle tient le controleur du toit
// (facade/modeToit/controleurToit.ts, la seule porte d'ecriture d'un toit) et l'adapte aux deux vues ou l'atelier du toit (Z10) s'ouvre.
// Sur le plan, rien de plus : le plan redessine le batiment a chaque geste. Dans la Vue 3D, la camera du mode (facade, dessus, libre),
// l'epure, les fantomes, les poignees et le toucher d'un mur. Une session ouverte sur le plan garde ses gestes quand on passe a la 3D
// (la 3D s'y attache) et inversement.
//
// Le controleur ecrit le batiment en place ; `valider` remet d'abord le depart, empile UNE etape d'historique du projet, puis ecrit
// l'etat final : un seul Ctrl+Z defait toute la session. `abandonner` remet le depart. Quitter vers une autre vue ou choisir un autre
// objet pendant une session modifiee pose d'abord la question (Valider, Abandonner, Rester : `quitterPuis`).

import { estBatiment, estChezUnVoisin } from '../../model/fonctions.js';
import { enPoints } from '../../model/formes.js';
import { reordonner, restaurer as restaurerSession } from '../../facade/modeToit/sessionToit.js';
import { creerControleurToit, lieuDuProjet, type ControleurToit, type Issue, type IntentionToit } from '../../facade/modeToit/controleurToit.js';
import { facadeProche, facadesDuBatiment, facadeValideeDuMur, facadeVersLePoint, orientationDe, texteDeLaPhoto, type FacadeVisee } from '../../facade/modeToit/facadesDesCorps.js';
import { poseDeDessus, poseEnPerspective, type PointScene, type Reserve } from '../../three/poseFacade.js';
import { moteur3d } from '../../three/demande3d.js';
import { poserCameraFacade, retirerCameraFacade } from '../../three/vueFacadeToit.js';
import { admettreDistance, borner, bornesDeLOrbite, decentrer, liberer } from '../../three/orbiteModeToit.js';
import { centroid } from '../../geometry/basic.js';
import { majFantomes, viderFantomes } from '../../three/fantomes.js';
import { pointDePose } from '../../model/memeMaison.js';
import { abonnerSceneBatie, hotes3d, vue3d, reglerVue3d, rendre3d } from '../../three/etat3d.js';
import { dialogues } from '../../shell/dialogues.js';
import { lectureToits } from '../../core/lectureToits.js';
import { corpsPorteur } from '../../facade/modeToit/gestes.js';
import { showToast } from '../../shell/dialogs.js';
import type * as THREE_NS from 'three';
import { elementProche, listerElements, memeCible, type CibleElement } from '../../facade/modeToit/elements.js';
import { murDeCadrage, murLePlusVisible, pointsDuCadreDeFacade } from '../../facade/modeToit/poignees.js';
import type { Atelier } from '../atelier.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../model/types.js';
import { toucher } from '../../core/controleurObjets.js';

interface PoseVue { position: { x: number; y: number; z: number }; cible: { x: number; y: number; z: number } }

/** La vue de la session : la 3D libre, devant une facade, ou de dessus. */
export type VueToit = 'libre' | 'facade' | 'dessus';

export interface SessionToit {
  cle: string;
  /** Le controleur du toit : la pile, l'intention, l'element choisi, la facade regardee, et toute ecriture. */
  ctl: ControleurToit;
  /** La Vue 3D est attachee a la session (camera du mode, orbite bornee, fantomes) ; faux tant qu'elle est sur le plan. */
  en3d: boolean;
  /** La facade courante, et la derniere choisie (la vue « Facade » y revient). */
  facade: FacadeVisee | null;
  derniere: FacadeVisee | null;
  vue: VueToit;
  /** Le corps isole dans la facade (rang dans `corpsToit`), ou null. */
  corpsIsole: number | null;
  /** Le doigt qui invite a toucher le batiment : vrai jusqu'au premier geste. */
  indice: boolean;
  /** La camera avant d'entrer dans une facade : on la retrouve en la quittant. */
  vueAvant: PoseVue | null;
  isole: boolean;
  /** La camera avant d'entrer dans le mode : la sortie la rend (la maison a ete cadree a l'entree). */
  cameraAvantMode?: PoseVue | null;
  /** Ce que la personne voyait avant chaque pas (`avant[i]`) et apres lui (`apres[i]`) : Ctrl+Z et Ctrl+Y le lui rendent. */
  vuesDesPas?: { avant: VueSession[]; apres: VueSession[] };
  /** La vue au debut du glisser en cours : celle du pas qu'il empilera. */
  vueDuGlisser?: VueSession | null;
  /** La plus grande distance qu'un cadrage du mode a demandee : la borne de l'orbite ne la refuse pas. */
  distanceAdmise?: number;
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
  return { vue: s.vue, facade: murDe(s.facade), derniere: murDe(s.derniere), selection: s.ctl.etat().selection, camera: poseCourante(), vueAvant: s.vueAvant };
}

/** La facade regardee (ou la derniere choisie) est dite au controleur : une piece de mur s'y pose, la portee la suit. */
function direLaFacade(s: SessionToit): void {
  s.ctl.regarder(murDe(s.facade ?? s.derniere));
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

/** Un batiment pose chez un voisin (`model/fonctions.ts::estChezUnVoisin`) : le mode Toit ne le retouche pas. */
const chezUnVoisin = estChezUnVoisin;

/**
 * Un batiment que le mode Toit sait retoucher : un batiment du projet, pas d'un voisin. `locked` n'y entre pas : il protege le contour
 * (ni deplace, ni supprime, interaction/pointeur.ts), pas le toit, et la maison du projet est verrouillee a l'import (la demonstration :
 * « Maison », « Abri de jardin »).
 */
export const estRetouchable = (o: ObjetPlan | undefined): o is ObjetPlan => !!o && estBatiment(o) && o.type === 'polygon' && !chezUnVoisin(o);

/** Les batiments du projet que le mode retouche (ceux de la parcelle, pas ceux des voisins), dans l'ordre du plan. */
export const batimentsRetouchables = (objets: readonly ObjetPlan[]): ObjetPlan[] => objets.filter((x) => estRetouchable(x));

/**
 * Le batiment que vise l'entree du mode : celui qui est choisi ; sinon, quand rien n'est choisi ou que la selection n'est pas un
 * batiment, le seul batiment retouchable du projet s'il n'y en a qu'un (« la maison » : inutile de la designer). Avec plusieurs
 * batiments, il faut en choisir un ; un batiment voisin choisi reste la selection (le bouton dit pourquoi il refuse).
 */
export function batimentVise(objets: readonly ObjetPlan[], selection: string | null): ObjetPlan | undefined {
  const o = objets.find((x) => x.key === selection);
  if (o && estBatiment(o) && o.type === 'polygon') return o;
  const retouchables = batimentsRetouchables(objets);
  return retouchables.length === 1 ? retouchables[0] : o;
}

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
function auDepart(o: ObjetPlan, s: Pick<SessionToit, 'ctl'>): ObjetPlan {
  const copie = { ...o, ...(o.batiment ? { batiment: { ...o.batiment } } : {}) } as ObjetPlan;
  restaurerSession(copie, s.ctl.depart());
  reordonner(copie, s.ctl.ordre());
  return copie;
}

/**
 * Les objets a enregistrer : le batiment en session y est a son depart. Rien de la session n'entre dans le projet avant « Valider »,
 * meme quand l'enregistrement seul de la lecture des toits en fond (app/toits/toitsFond.ts) ou Ctrl+S part pendant la session :
 * abandonnee, elle ne laisse aucune trace ; validee, elle marque le projet a enregistrer. `s` : la session en cours par defaut.
 */
export function objetsHorsSession(objets: readonly ObjetPlan[], s: Pick<SessionToit, 'cle' | 'ctl'> | null = session): ObjetPlan[] {
  if (!s) return objets as ObjetPlan[];
  return objets.map((o) => (o.key === s.cle ? auDepart(o, s) : o));
}

/** Ce que la barre du mode montre : de quoi griser ses boutons et dire la facade courante. */
export interface EtatToit {
  actif: boolean;
  /** La session est montree dans la Vue 3D (poignees, facades, vues) ; sur le plan, l'atelier seul. */
  en3d: boolean;
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

/** La ligne « Corps · Façade » (voir `EtatToit.designation`) : le corps est la portee des gestes, la seule regle (gestes.ts::porteeDuGeste). */
function designer(s: SessionToit): { designation: string; rangCorps: number | null } {
  const o = objetsCourants ? objetsCourants().find((x) => x.key === s.cle) : undefined, corps = o?.batiment?.corpsToit ?? [];
  const f = s.facade, p = s.ctl.etat().portee;
  const rangCorps = corps.length > 1 || s.ctl.etat().selection ? p.rang : null;
  const nom = rangCorps === null ? null : listerElements(corps).find((e) => e.cible.type === 'corps' && e.cible.rang === rangCorps)?.libelle ?? null;
  const facade = f ? 'Façade ' + orientationDe(f).toLowerCase() + ' · ' + f.L.toFixed(2).replace('.', ',') + ' m' + photoDuMur(f) : null;
  if (!nom) return { designation: facade ?? 'Touchez un mur du bâtiment pour choisir sa façade.', rangCorps };
  return { designation: nom + ' · ' + (facade ? facade.charAt(0).toLowerCase() + facade.slice(1) : 'touchez un de ses murs pour choisir sa façade'), rangCorps };
}

export function etatToit(): EtatToit {
  if (!session) return { actif: false, en3d: false, peutAnnuler: false, peutRetablir: false, change: false, isole: false, facade: null, vue: 'libre', aUneFacade: false, corpsIsole: false, peutIsolerCorps: false, selection: null, indice: false, validee: false, designation: '', rangCorps: null };
  const f = session.facade ?? session.derniere, e = session.ctl.etat();
  return {
    ...designer(session),
    actif: true, en3d: session.en3d, peutAnnuler: e.peutDefaire, peutRetablir: e.peutRefaire, change: e.change, isole: session.isole,
    facade: session.facade ? 'Façade ' + orientationDe(session.facade).toLowerCase() + ' · ' + session.facade.L.toFixed(2).replace('.', ',') + ' m' + photoDuMur(session.facade) : null,
    vue: session.vue, aUneFacade: !!session.derniere, corpsIsole: session.corpsIsole !== null, peutIsolerCorps: !!f && f.rang !== null, selection: e.selection, indice: session.indice, validee: e.voitLeProjet
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
  /** La Vue 3D est la vue montree, sa scene prete : la session s'y attache (par defaut : une scene existe). */
  enVue3d?: () => boolean;
}

/** Ce que le panneau du mode recouvre de la scene : une colonne a droite (grand ecran) ou un bandeau en bas ; zero sans panneau. */
function reserveDuPanneau(): Reserve | undefined {
  const hote = hotes3d.vue3d, panneau = hote?.querySelector('.panneauToit');
  if (!hote || !panneau) return undefined;
  const h = hote.getBoundingClientRect(), p = panneau.getBoundingClientRect();
  if (!h.width || !h.height) return undefined;
  // Une colonne (plus etroite que la scene, qui en couvre la hauteur) ou un bandeau (pose en bas).
  if (p.width < h.width * 0.6) return { largeur: h.width, hauteur: h.height, droite: Math.max(0, h.right - p.left), bas: 0 };
  // Au telephone, l'indicateur du mode (« Modification ») est pose juste au-dessus du panneau : ce qu'on cadre s'arrete au-dessus de lui
  // (9 novembre 2026, la vue de dessus cachait le bas de la maison sous lui).
  const i = hote.querySelector('.etatToit')?.getBoundingClientRect(), haut = i && i.width > 0 && i.top >= h.top + h.height / 3 ? Math.min(p.top, i.top) : p.top;
  return { largeur: h.width, hauteur: h.height, droite: 0, bas: Math.max(0, h.bottom - haut) };
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
  if (!sc?.hauteurSol || !pts.length) return 0;
  // Plusieurs batiments d'une meme maison se posent sur le sol au centre du plus grand (model/memeMaison.ts), comme la scene.
  return sc.hauteurSol(o && o.type === 'polygon' ? pointDePose(o, objetsCourants?.() ?? []) : centroid(pts));
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
  const reserve = reserveDuPanneau();
  // L'image se decale vers la partie libre ; la cible reste le centre de ce qu'on cadre (l'orbite tourne autour).
  decentrer(sc, reserve);
  const pose = poseEnPerspective(points, depuis, sc.camera.fov, sc.camera.aspect, reserve);
  admettre(sc, Math.hypot(pose.position.x - pose.cible.x, pose.position.y - pose.cible.y, pose.position.z - pose.cible.z));
  poserCamera(pose);
  derniereVue = '';
}

/** Un cadrage du mode demande `d` metres de recul : l'orbite l'admet, pour toute la session. */
function admettre(sc: NonNullable<typeof vue3d.scene>, d: number): void {
  if (session) session.distanceAdmise = Math.max(session.distanceAdmise ?? 0, d * 1.05);
  admettreDistance(sc, d);
}

/**
 * Les bornes de l'orbite et le decalage de l'image du mode (three/orbiteModeToit.ts), sur la scene courante : a l'ouverture, et sur toute
 * scene rebatie pendant la session (elle nait avec l'orbite libre de la Vue 3D).
 */
function poserLOrbiteDuMode(o: ObjetPlan | undefined): void {
  const sc = vue3d.scene;
  if (!sc || !o || !session) return;
  const b = bornesDeLOrbite(pointsDuBatiment(o), altitudeDuBatiment(o));
  // Un cadrage deja admis plus loin que la borne le reste (le panneau deplie, au telephone).
  b.max = Math.max(b.max, session.distanceAdmise ?? 0);
  borner(sc, b);
  decentrer(sc, reserveDuPanneau());
}

/**
 * Ce que la camera de facade tient dans l'image : la facade du corps regarde et toutes les poignees de ce que l'on tire, l'element choisi
 * compris (`poignees.ts::pointsDuCadreDeFacade`, une seule regle) ; une facade du contour, le batiment entier.
 */
export function pointsDeLaVue(o: ObjetPlan, s: SessionToit): PointScene[] {
  const sc = vue3d.scene, corps = o.batiment?.corpsToit ?? [], f = s.facade;
  const pts = sc && f && corps.length ? pointsDuCadreDeFacade(corps, f, s.ctl.etat().selection) : [];
  if (!sc || !pts.length) return pointsDuBatiment(o);
  const base = altitudeDuBatiment(o);
  return pts.map((p) => ({ x: p.x - sc.cen.x, y: base + p.z, z: sc.cen.y - p.y }));
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

/** Vrai une fois, juste apres la sortie du mode : le bouton qui l'ouvre reprend le focus (zones/vue3d/EntreeMaison.tsx). */
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

/**
 * Ecrit la session dans le projet en une seule etape d'historique (le depart d'abord, puis l'etat final) ; vrai si elle a change
 * quelque chose. Le controleur fige chaque geste ; un toit que la personne a rendu aux « Règles » ne se refige pas, et la tache de
 * fond le relit tout de suite plutot qu'a la prochaine ouverture du projet (`relire`, dit par le controleur, jamais devine ici).
 */
export function validerLaSession(a: Pick<Atelier, 'pushHistory' | 'markDirty'>, o: ObjetPlan, s: Pick<SessionToit, 'ctl'>): boolean {
  const { change, final, depart, ordre, relire } = s.ctl.valider();
  if (change) {
    restaurerSession(o, depart);
    reordonner(o, ordre);
    a.pushHistory(o);
    restaurerSession(o, final);
    a.markDirty(o);
    if (relire) lectureToits.demanderRelecture();
  }
  toucher(o);
  return change;
}

/** Une facade d'un autre corps que celui des gestes : le corps choisi devient le sien (une seule designation, « Corps · Façade »). */
function suivreLeCorpsDe(o: ObjetPlan | undefined, f: FacadeVisee): void {
  const s = session, corps = o?.batiment?.corpsToit ?? [], sel = s?.ctl.etat().selection;
  if (s && sel && f.rang !== null && corpsPorteur(corps, sel.rang) !== f.rang) s.ctl.selectionner({ type: 'corps', rang: f.rang, i: 0 });
}

/**
 * Le cadrage d'un corps choisi, ou du batiment entier sans rien de choisi en 3D libre (audit de la navigation, 6 novembre 2026) : de face,
 * la facade la plus visible du corps (a montrer par l'appelant) ; en 3D libre, la camera se cadre ici, et la reponse est `true`. `null` :
 * ce n'est pas un corps (un element se cadre par sa facade), ou la vue est celle de dessus.
 */
function cadrageDuCorps(o: ObjetPlan | undefined, facadeVisible: (rang: number) => FacadeVisee | null): FacadeVisee | true | null {
  const s = session;
  const sel = s?.ctl.etat().selection ?? null;
  if (!s || !o || s.vue === 'dessus' || !(sel?.type === 'corps' || (!sel && s.vue === 'libre'))) return null;
  const rang = sel?.rang ?? null, f = rang !== null && s.vue === 'facade' ? facadeVisible(rang) : null;
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
/**
 * La camera d'un pas revient-elle avec lui ? Seulement si ce que l'on regarde change : la vue (3D libre, facade, dessus), la facade ou
 * l'element choisi (decision du proprietaire, 6 novembre 2026). Sinon la camera reste ou la personne l'a mise : un Ctrl+Z ne defait pas
 * une orbite.
 */
export function laCameraSuitLePas(ici: Pick<VueSession, 'vue' | 'facade' | 'selection'>, v: Pick<VueSession, 'vue' | 'facade' | 'selection'>): boolean {
  const memeMur = (a: MurDe | null, b: MurDe | null) => (!a && !b) || (!!a && !!b && a.rang === b.rang && a.mur === b.mur);
  const memeChoix = (a: CibleElement | null, b: CibleElement | null) => (!a && !b) || memeCible(a, b);
  return ici.vue !== v.vue || !memeMur(ici.facade, v.facade) || !memeChoix(ici.selection, v.selection);
}

function rendreLaVueDe(v: VueSession | undefined, murs: FacadeVisee[], reposerLaVue: () => void): void {
  const s = session;
  if (!s || !v) return;
  const suit = laCameraSuitLePas({ vue: s.vue, facade: murDe(s.facade), selection: s.ctl.etat().selection }, v);
  const trouve = (m: MurDe | null) => (m ? murs.find((f) => f.rang === m.rang && f.mur === m.mur) ?? null : null);
  s.ctl.selectionner(v.selection);
  s.derniere = trouve(v.derniere) ?? s.derniere;
  s.vueAvant = v.vueAvant;
  const f = v.vue === 'facade' ? trouve(v.facade) : null;
  s.vue = v.vue === 'facade' && !f ? 'libre' : v.vue;
  s.facade = f;
  direLaFacade(s);
  if (suit && v.camera) poserCamera(v.camera);
  derniereVue = '';
  reposerLaVue();
}

/**
 * Recadre le batiment entier (audit de la camera, 6 novembre 2026 : « si on se perd ») : en 3D libre, la camera revient sur lui, de la
 * direction d'ou l'on regarde ; de dessus, la vue de dessus se repose ; devant une facade, rien (le cadre est deja le sien). Un reglage de
 * camera : ni la selection ni la pile ne changent.
 */
function recadrerLeBatiment(o: ObjetPlan | undefined): void {
  const s = session;
  if (!s || !o || s.vue === 'facade') return;
  if (s.vue === 'dessus') poserVueDeDessus(o);
  else cadrerEnPerspective(pointsDuBatiment(o));
}

/** Le debord du toit au-dela des murs que la vue de dessus garde dans l'image, en metres (celui du dessin, a l'egout). */
const DEBORD_CADRE_M = 0.35;

/**
 * La camera de dessus, cadree sur le batiment `o` dans ce que le panneau laisse libre : la maison entiere (decision du proprietaire, 9
 * novembre 2026, au telephone : « la vue de dessus s'ouvre sur toute la maison, on zoome ensuite ») — son contour et tous ses corps (une
 * aile qui depasse le contour, un element pose), debords compris, et la hauteur de ses toits, plus pres de la camera que le sol.
 */
function poserVueDeDessus(o: ObjetPlan): void {
  const sc = vue3d.scene;
  if (!sc) return;
  const corps = o.batiment?.corpsToit ?? [];
  const pts = [...(enPoints(o).pts as PtBrut[]), ...corps.flatMap((c) => c.pts)], xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const reserve = reserveDuPanneau();
  decentrer(sc, reserve);
  const etendue = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 2 * DEBORD_CADRE_M;
  const pose = poseDeDessus(centre, etendue, sc.cen, sc.camera.fov, sc.camera.aspect, reserve, altitudeDuBatiment(o), hauteurDe(o));
  admettre(sc, pose.position.y - pose.cible.y);
  poserCamera(pose);
}

/** Ctrl+Z, Ctrl+Y et « Revenir au depart » de la session : le toit change, et la vue de ce pas revient avec lui (`rendreLaVue`). */
function creerPas(batiment: () => ObjetPlan | undefined, rebatir: () => void, ctx: ContexteModeToit, rendreLaVue: (v: VueSession | undefined) => void) {
  return (geste: 'annuler' | 'retablir' | 'depart'): void => {
    const o = batiment(), s = session;
    if (!o || !s) return;
    const i = s.ctl.position(), ici = capturerVue(s);
    const fait = (geste === 'annuler' ? s.ctl.defaire() : geste === 'retablir' ? s.ctl.refaire() : s.ctl.revenirAuDepart()).fait;
    if (!fait) return;
    toucher(o);
    rebatir();
    const m = (s.vuesDesPas ??= { avant: [], apres: [] });
    if (geste === 'annuler') { m.apres[i] = ici; rendreLaVue(m.avant[i]); }
    else if (geste === 'retablir') rendreLaVue(m.apres[s.ctl.position()]);
    else noterAvant(s, s.ctl.position(), ici);
    ctx.rafraichir();
  };
}

/** Ce qui regarde, au rythme de `FANTOMES_MS`, si la camera ou l'image ont change : la facade se recadre, les fantomes se recalculent. */
function creerSurveillance(reposerLaVue: () => void, fantomes: () => void): () => void {
  return () => {
    const sc = vue3d.scene, s = session;
    if (!sc || !s) return;
    // Le panneau replie, deplie ou remis en page : l'image se recentre dans ce qu'il laisse libre, la camera ne bouge pas.
    if (decentrer(sc, reserveDuPanneau())) { rendre3d(sc); derniereVue = ''; }
    const p = sc.camera.position, t = sc.controls.target, el = sc.renderer.domElement;
    const cle = [p.x, p.y, p.z, t.x, t.y, t.z].map((v) => v.toFixed(2)).join() + (s.isole ? 'i' : '') + s.vue + (s.corpsIsole ?? '') + el.clientWidth + 'x' + el.clientHeight;
    if (cle === derniereVue) return;
    derniereVue = cle;
    if (s.vue === 'facade') reposerLaVue();  // l'image a change de taille (plein ecran, telephone tourne) : la facade se recadre
    fantomes();
  };
}

/** Ce que la personne choisit dans la session, sans rien ecrire : l'indice leve, l'element, le batiment entier, l'intention, l'isolement. */
function creerChoix(ctx: ContexteModeToit, cadrer: () => void, reposerLaVue: () => void) {
  return {
    /** Le premier geste de la personne : l'invitation a toucher le batiment disparait. */
    leverIndice(): void {
      if (!session?.indice) return;
      session.indice = false;
      ctx.rafraichir();
    },

    /** Choisit un element (ou aucun) : l'atelier regle ce qui est choisi, la 3D le montre de pres. */
    selectionner(cible: CibleElement | null): void {
      if (!session || memeCible(session.ctl.etat().selection, cible)) return;
      session.ctl.selectionner(cible);
      cadrer();
    },

    /** « Bâtiment entier » : le choix explicite de tout le toit (une forme le remplace, avec ce qui disparait dit avant). */
    choisirBatimentEntier(): void {
      if (!session) return;
      session.ctl.choisirBatimentEntier();
      cadrer();
    },

    /** Modifier ou ajouter : un etat de l'atelier (ni Ctrl+Z, ni « projet modifié »). */
    choisirIntention(i: IntentionToit): void {
      if (!session) return;
      session.ctl.choisirIntention(i);
      ctx.rafraichir();
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
  };
}

/** L'attache de la Vue 3D a la session : ce qu'elle pose a l'arrivee de la 3D, et retire a son depart. */
function creerAttache3d(ctx: ContexteModeToit, batiment: () => ObjetPlan | undefined, reposerLaVue: () => void, enVue3d: () => boolean): { attacher3d: () => void; detacher3d: () => void } {
  /**
   * La Vue 3D s'attache a la session : orbite bornee autour du batiment, fantomes surveilles, maison cadree dans ce que l'atelier laisse
   * libre. A l'ouverture dans la 3D, ou quand on y passe avec une session ouverte sur le plan (la scene prete).
   */
  const attacher3d = (): void => {
    const s = session, o = batiment();
    if (!s || !o || s.en3d || !enVue3d()) return;
    s.en3d = true;
    s.cameraAvantMode = poseCourante();
    derniereVue = '';
    poserLOrbiteDuMode(o);  // sous l'horizon, ni trop pres ni trop loin, autour du batiment (three/orbiteModeToit.ts)
    veille = setInterval(surveillerLaVue, FANTOMES_MS);
    ctx.rafraichir();
    // L'atelier pose, la maison se cadre dans ce qu'il laisse libre ; sa ligne invite a toucher un mur.
    setTimeout(() => { if (session === s && s.en3d && s.vue === 'libre') cadrerEnPerspective(pointsDuBatiment(o)); }, 60);
  };

  /** La Vue 3D se detache (on revient au plan, ou la session se ferme) : sa camera, son epure, ses fantomes et son orbite s'en vont. */
  const detacher3d = (): void => {
    const s = session;
    if (!s?.en3d) return;
    const camera = s.cameraAvantMode;
    s.en3d = false;
    s.vue = 'libre'; s.facade = null; s.vueAvant = null; s.corpsIsole = null; s.isole = false;
    reglerVue3d({ corpsIsole: null });
    viderFantomes();
    if (veille !== null) { clearInterval(veille); veille = null; }
    liberer(vue3d.scene);  // l'orbite libre de la Vue 3D, et l'image recentree : l'atelier s'en va de la scene
    reposerLaVue();
    if (vue3d.scene) ctx.rebatir(s.cle);
    if (camera) { poserCamera(camera); if (vue3d.scene) rendre3d(vue3d.scene); }  // la camera d'avant le mode, comme on l'avait laissee
  };
  return { attacher3d, detacher3d };
}

export function creerModeToit(a: Atelier, ctx: ContexteModeToit) {
  objetsCourants = () => a.etat.objects;
  const batiment = (): ObjetPlan | undefined => (session ? a.etat.objects.find((o) => o.key === session?.cle) : undefined);
  const enVue3d = ctx.enVue3d ?? (() => !!vue3d.scene);
  const reposerLaVue = creerReposeDeVue(batiment);
  const rebatir3d = rebatirEnGardantLaCamera(ctx, batiment);
  /** Le batiment redessine : sur le plan toujours, dans la scene quand la 3D est attachee. */
  const rebatir = (): void => { if (session?.en3d) rebatir3d(); a.render(); };

  surveillerLaVue = creerSurveillance(reposerLaVue, () => { majFantomesDe(a.etat.objects); });

  const { attacher3d, detacher3d } = creerAttache3d(ctx, batiment, reposerLaVue, enVue3d);

  // Une scene neuve (un reglage de la Vue 3D la rebatit, ou la 3D qui s'ouvre sur une session du plan) : on lui repose la camera du mode.
  vueReposee = () => { if (session && !session.en3d) attacher3d(); poserLOrbiteDuMode(batiment()); reposerLaVue(); };
  if (!abonne) abonne = !!abonnerSceneBatie(() => { if (session) vueReposee(); });

  const fermer = (): void => {
    if (!session) return;
    // Le focus etait dans l'atelier, qui va disparaitre (ou nulle part) : il revient au bouton qui l'ouvre, pas au corps de la page. Lu
    // avant que l'atelier ne se demonte, et pose avant le rendu qui montre ce bouton.
    const actif = typeof document === 'undefined' ? null : document.activeElement;
    if (!actif || actif === document.body || actif.closest('.panneauToit, .navigateurToit, .dialogueBoite')) focusDemande = Date.now();
    detacher3d();
    session = null;
    retirerEntreeHistorique();
    a.render();
    ctx.rafraichir();
  };

  const vues = creerVuesToit(ctx, batiment, rebatir, reposerLaVue);
  const pas = creerPas(batiment, rebatir, ctx, vues.methodes.rendreLaVue);

  const mode = {
    /** Ouvre l'atelier du toit sur le batiment selectionne, dans l'intention dite ; la 3D s'y attache si elle est la. */
    ouvrir(intention: IntentionToit = 'modifier'): boolean {
      const o = a.etat.objects.find((x) => x.key === a.etat.selectedKey);
      if (session || !estRetouchable(o)) return false;
      session = { cle: o.key, ctl: creerControleurToit(o, intention, lieuDuProjet(a.etat.objects)), en3d: false, facade: null, derniere: null, vue: 'libre', corpsIsole: null, indice: true, vueAvant: null, isole: false, cameraAvantMode: null };
      poserEntreeHistorique();
      ctx.rafraichir();
      attacher3d();
      return true;
    },

    /**
     * Un geste : `f` demande au controleur (la seule porte d'ecriture) ; si le toit a change, le plan et la scene suivent, la vue de ce
     * pas est rangee, et la 3D se place devant le mur ou se regle ce qui vient d'etre pose. Un refus se dit.
     */
    geste(f: (ctl: ControleurToit) => Issue): Issue {
      const o = batiment(), s = session;
      if (!o || !s) return { fait: false, raison: null };
      const avant = capturerVue(s), i = s.ctl.position();
      const issue = f(s.ctl);
      if (issue.raison) showToast(issue.raison);
      if (!issue.fait) { ctx.rafraichir(); return issue; }
      toucher(o);
      // Un geste peut creer le premier corps (le toit simple decoupe) : la facade choisie sur le contour se rattache a son mur.
      rattacherLesFacades(s, o);
      if (s.ctl.position() !== i) noterAvant(s, s.ctl.position(), avant);
      rebatir();
      if (issue.facade && s.en3d) vues.methodes.choisirFacade(issue.facade.rang, issue.facade.mur);
      else if (s.ctl.etat().selection && !memeCible(avant.selection, s.ctl.etat().selection)) vues.methodes.cadrerSurLaSelection();
      ctx.rafraichir();
      return issue;
    },

    annuler: () => { pas('annuler'); },
    retablir: () => { pas('retablir'); },
    revenirAuDepart: () => { pas('depart'); },

    /** Montre le toit du projet avant la session, ou revient a la session (le moindre geste y revient aussi). */
    voirValide(): void {
      const o = batiment(), s = session;
      if (!o || !s) return;
      if (!s.ctl.voirLeProjet()) { showToast('Rien n’a changé : c’est déjà le toit du projet.'); return; }
      toucher(o);
      rebatir();
      ctx.rafraichir();
    },

    /** Valide : une seule etape d'historique du projet pour toute la session. */
    valider(): boolean {
      const o = batiment(), s = session;
      if (!o || !s) return false;
      const change = validerLaSession(a, o, s);
      fermer();
      showToast(change ? 'Toit validé.' : 'Aucun changement.');
      return true;
    },

    /** Quitte sans garder : le depart revient, au bit pres. Avec des changements, une question d'abord (sauf `sansDemander`). */
    abandonner(sansDemander = false): void {
      const s = session, o = batiment();
      if (!s) return;
      const rendre = () => { s.ctl.quitterSansGarder(); if (o) toucher(o); fermer(); };
      if (sansDemander || !s.ctl.etat().change) { rendre(); return; }
      demanderAbandon(rendre);
    },

    /** Echap : l'element choisi, la facade, puis le mode ; en plein ecran, la derniere marche reste a la Vue 3D. Vrai si la touche a servi. */
    echap(pleinePage = false): boolean {
      if (!session) return false;
      if (session.ctl.etat().selection) { session.ctl.selectionner(null); vues.methodes.cadrerSurLaSelection(); return true; }
      if (session.vue !== 'libre') { vues.quitterLaFacade(); return true; }
      if (!pleinePage) this.abandonner();
      return !pleinePage;
    },

    /** Quitte le mode sans question : la Vue 3D se ferme, ou la selection change. */
    arreterSansDemander(raison: string): void {
      if (!session) return;
      const change = session.ctl.etat().change;
      this.abandonner(true);
      if (change) showToast(raison);
    },

    /** La Vue 3D s'attache (on y passe avec une session ouverte) ou se detache (on revient au plan) : les gestes restent. */
    attacher3d,
    detacher3d,

    recadrer(): void { recadrerLeBatiment(batiment()); ctx.rafraichir(); },
    hote: () => hotes3d.vue3d,
    ...creerChoix(ctx, vues.methodes.cadrerSurLaSelection, reposerLaVue),
    ...creerGlisser(ctx, batiment, rebatir),
    ...vues.methodes
  };
  pilote = mode;
  return mode;
}

/** Les glisser des poignees : l'apercu ecrit par le controleur sans empiler, la fin empile une etape, Echap rend l'etat de la pile. */
function creerGlisser(ctx: ContexteModeToit, batiment: () => ObjetPlan | undefined, rebatir: () => void) {
  return {
    /** Un glisser en cours : les corps (et la hauteur a l'egout, si le corps principal l'a changee) remplacent ceux du batiment, la scene suit au plus tous les `GLISSER_MS` ; rien n'entre dans la pile avant `finGlisser`. */
    apercu(corps: CorpsToit[], elevation?: number): void {
      const o = batiment();
      if (!o || !session) return;
      session.vueDuGlisser ??= capturerVue(session);
      session.ctl.apercu(corps, elevation);
      toucher(o);
      const t = Date.now();
      if (t - dernierRebatir >= GLISSER_MS) { dernierRebatir = t; rebatir(); }
    },

    /** Le glisser s'acheve : le batiment est reconstruit tel quel et la session empile une etape (une seule, quel que soit le trajet). */
    finGlisser(): boolean {
      const o = batiment(), s = session;
      if (!o || !s) return false;
      const change = s.ctl.finGlisser();
      if (change) noterAvant(s, s.ctl.position(), s.vueDuGlisser);
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
      s.ctl.annulerGlisser();
      toucher(o);
      rebatir();
      ctx.rafraichir();
    },
  };
}

/** Tout ce qui regarde la camera du mode : la facade choisie, la vue libre, de dessus, le corps isole. */
function creerVuesToit(ctx: ContexteModeToit, batiment: () => ObjetPlan | undefined, rebatir: () => void, reposerLaVue: () => void) {
  /** Remet la camera comme elle etait avant la facade. */
  const quitterLaFacade = (): void => {
    const s = session, sc = vue3d.scene;
    if (!s || s.vue === 'libre') return;
    s.facade = null;
    s.vue = 'libre';
    direLaFacade(s);
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
    direLaFacade(s);
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
    const sel = s?.ctl.etat().selection ?? null;
    const m = s?.en3d && sel && o && s.vue !== 'dessus' ? murDeCadrage(o.batiment?.corpsToit ?? [], sel, s.facade ?? s.derniere) : null;
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

    /** Le toucher sur la scene : la facade du batiment la plus proche du point touche. Vrai si le toucher a choisi une facade. */
    toucher(ndc: { x: number; y: number }): boolean {
      const o = batiment();
      if (!session || !o) return false;
      const touche = moteur3d()?.objetSousLePointeur(ndc, (cle) => cle === o.key);
      if (!touche || touche.cle !== o.key || !touche.point) return false;
      // Un element tout pres du point touche se choisit ; sinon c'est un mur, donc une facade.
      const cible = o.batiment?.corpsToit ? elementProche(o.batiment?.corpsToit, touche.point) : null;
      if (cible) { session.ctl.selectionner(cible); cadrerSurLaSelection(); return true; }
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
  if (!s.ctl.etat().change) { mode.abandonner(true); suite(); return; }
  dialogues.ouvrir({
    type: 'choix', titre: 'Quitter la modification de la toiture ?', texte: 'Vos changements du toit ne sont pas encore dans le projet.',
    principal: { libelle: 'Valider', executer: () => { mode.valider(); suite(); } },
    secondaire: { libelle: 'Abandonner', executer: () => { mode.abandonner(true); suite(); } },
    tertiaire: { libelle: 'Rester', executer: () => {} }
  });
}
