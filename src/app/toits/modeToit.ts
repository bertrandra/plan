// Le mode Toit de la Vue 3D (MD/spec-mode-toit-3d.md, etape 1) : retoucher le toit d'un batiment du projet dans une session.
//
// Une session garde sa propre pile d'annulation (facade/modeToit/sessionToit.ts) : les gestes ecrivent dans le batiment sur
// place — la scene 3D le montre tout de suite — sans toucher a l'historique du projet. `valider` remet d'abord le depart, empile
// UNE etape d'historique du projet, puis ecrit l'etat final : un seul Ctrl+Z defait toute la session. `abandonner` remet le depart.
//
// Hors session, rien ne change. La session s'arrete d'elle-meme quand on quitte la Vue 3D ou qu'on selectionne autre chose.

import { estBatiment } from '../../model/fonctions.js';
import { enPoints } from '../../model/formes.js';
import { aChange, annuler, creerHistorique, empiler, peutAnnuler, peutRetablir, photographier, restaurer, retablir, revenirAuDepart,
  type HistoriqueToit } from '../../facade/modeToit/sessionToit.js';
import { facadeProche, facadesDuBatiment, facadeVersLePoint, orientationDe, type FacadeVisee } from '../../facade/modeToit/facadesDesCorps.js';
import { poseDeDessus, type PointScene, type Reserve } from '../../three/poseFacade.js';
import { moteur3d } from '../../three/demande3d.js';
import { poserCameraFacade, retirerCameraFacade } from '../../three/vueFacadeToit.js';
import { centroid } from '../../geometry/basic.js';
import { majFantomes, viderFantomes } from '../../three/fantomes.js';
import { abonnerSceneBatie, hotes3d, vue3d, reglerVue3d } from '../../three/etat3d.js';
import { dialogues } from '../../shell/dialogues.js';
import { showToast } from '../../shell/dialogs.js';
import type * as THREE_NS from 'three';
import { elementProche, lireElement, memeCible, type CibleElement } from '../../facade/modeToit/elements.js';
import type { Atelier } from '../atelier.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../model/types.js';

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
}

let session: SessionToit | null = null;
/** Les objets du plan : de quoi verifier que l'element choisi existe encore ; posee par `creerModeToit`. */
let objetsCourants: (() => readonly ObjetPlan[]) | null = null;
/** Le minuteur qui recalcule les fantomes quand la camera bouge ; actif pendant une session. */
let veille: ReturnType<typeof setInterval> | null = null;

/** La session en cours, ou null : ce que les zones lisent pour se dessiner. */
export const sessionToit = (): Readonly<SessionToit> | null => session;

/** Un batiment que le mode Toit sait retoucher : un batiment du projet, pas du voisinage. */
export const estRetouchable = (o: ObjetPlan | undefined): o is ObjetPlan => !!o && estBatiment(o) && !o.voisinage && o.type === 'polygon';

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
}

/** La selection si l'element existe encore dans le batiment en session. */
function selectionValide(): CibleElement | null {
  const s = session;
  if (!s?.selection || !objetsCourants) return null;
  const o = objetsCourants().find((x) => x.key === s.cle);
  return o?.corpsToit && lireElement(o.corpsToit, s.selection) ? s.selection : null;
}

export function etatToit(): EtatToit {
  if (!session) return { actif: false, peutAnnuler: false, peutRetablir: false, change: false, isole: false, facade: null, vue: 'libre', aUneFacade: false, corpsIsole: false, peutIsolerCorps: false, selection: null, indice: false, validee: false };
  const f = session.facade ?? session.derniere;
  return {
    actif: true, peutAnnuler: peutAnnuler(session.hist), peutRetablir: peutRetablir(session.hist), change: aChange(session.hist), isole: session.isole,
    facade: session.facade ? 'Façade ' + orientationDe(session.facade).toLowerCase() + ' · ' + session.facade.L.toFixed(2).replace('.', ',') + ' m' : null,
    vue: session.vue, aUneFacade: !!session.derniere, corpsIsole: session.corpsIsole !== null, peutIsolerCorps: !!f && f.rang !== null, selection: selectionValide(), indice: session.indice, validee: session.validee
  };
}

/** Les murs du batiment en session : de quoi dessiner le navigateur de facades (sans passer par le mode). */
export function facadesDeSession(objets: readonly ObjetPlan[]): FacadeVisee[] {
  const o = session ? objets.find((x) => x.key === session?.cle) : undefined;
  return o ? facadesDuBatiment(o.corpsToit, enPoints(o).pts as PtBrut[]) : [];
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
  if (!o.corpsToit?.length) return;
  const murs = facadesDuBatiment(o.corpsToit, enPoints(o).pts as PtBrut[]);
  const refaire = (f: FacadeVisee | null): FacadeVisee | null => (f && f.rang === null ? facadeProche(murs, { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 }) ?? f : f);
  s.facade = refaire(s.facade);
  s.derniere = refaire(s.derniere);
}

/** La hauteur du faitage du batiment : de quoi cadrer la facade en entier. */
function hauteurDe(o: ObjetPlan): number {
  const corps = (o.corpsToit ?? []).map((c) => c.faitage);
  return corps.length ? Math.max(...corps) : (o.elevation ?? 3) + (o.toit?.hauteur ?? 2.5);
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
  const plan = [...(enPoints(o).pts as PtBrut[]), ...(o.corpsToit ?? []).flatMap((c) => c.pts)];
  return plan.flatMap((p) => [base, haut].map((y) => ({ x: p.x - sc.cen.x, y, z: sc.cen.y - p.y })));
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
    if (s.vue === 'facade' && s.facade) poserCameraFacade(sc, s.facade, pointsDuBatiment(o), reserveDuPanneau());
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

/** Ecrit la session dans le projet en une seule etape d'historique (le depart d'abord, puis l'etat final) ; vrai si elle a change quelque chose. */
function validerLaSession(a: Atelier, o: ObjetPlan, s: SessionToit): boolean {
  reprendre(o, s);
  const final = photographier(o), change = aChange(s.hist);
  if (change) {
    restaurer(o, s.hist.pas[0] ?? {});
    a.pushHistory();
    restaurer(o, final);
    o.toitFige = true;
    a.markDirty();
  }
  return change;
}

export function creerModeToit(a: Atelier, ctx: ContexteModeToit) {
  objetsCourants = () => a.etat.objects;
  const batiment = (): ObjetPlan | undefined => (session ? a.etat.objects.find((o) => o.key === session?.cle) : undefined);
  const reposerLaVue = creerReposeDeVue(batiment);
  // Une scene neuve (un reglage de la Vue 3D la rebatit) n'a ni camera de facade ni epure : on les lui repose.
  vueReposee = reposerLaVue;
  if (!abonne) abonne = !!abonnerSceneBatie(() => { if (session) vueReposee(); });
  const rebatir = rebatirEnGardantLaCamera(ctx, batiment);

  const fantomes = (): void => { majFantomesDe(a.etat.objects); };
  surveillerLaVue = () => {
    const sc = vue3d.scene, s = session;
    if (!sc || !s) return;
    const p = sc.camera.position, t = sc.controls.target, el = sc.renderer.domElement;
    const cle = [p.x, p.y, p.z, t.x, t.y, t.z].map((v) => v.toFixed(2)).join() + (s.isole ? 'i' : '') + s.vue + (s.corpsIsole ?? '') + el.clientWidth + 'x' + el.clientHeight;
    if (cle === derniereVue) return;
    derniereVue = cle;
    if (s.vue === 'facade') reposerLaVue();  // l'image a change de taille (plein ecran, telephone tourne) : la facade se recadre
    fantomes();
  };

  const fermer = (): void => {
    if (!session) return;
    const cle = session.cle;
    reglerVue3d({ corpsIsole: null });
    viderFantomes();
    if (veille !== null) { clearInterval(veille); veille = null; }
    session = null;
    reposerLaVue();
    a.render();
    if (vue3d.scene) ctx.rebatir(cle);  // le batiment tel que la session le laisse ; le reste de la scene ne bouge pas
    ctx.rafraichir();
  };

  const vues = creerVuesToit(ctx, batiment, rebatir, reposerLaVue);

  const mode = {
    /** Entre dans le mode sur le batiment selectionne. */
    ouvrir(): boolean {
      const o = a.etat.objects.find((x) => x.key === a.etat.selectedKey);
      if (session || !estRetouchable(o)) return false;
      session = { cle: o.key, hist: creerHistorique(o), facade: null, derniere: null, vue: 'libre', corpsIsole: null, selection: null, indice: true, vueAvant: null, isole: false, validee: false };
      // Les batiments qui cachent celui qu'on retouche deviennent des contours pointilles, des que la camera bouge.
      derniereVue = '';
      veille = setInterval(surveillerLaVue, FANTOMES_MS);
      ctx.rafraichir();
      showToast('Touchez un mur du bâtiment pour choisir sa façade.');
      return true;
    },

    /** Une retouche du toit : `f` ecrit dans le batiment ; faux = rien n'a change. La scene suit, la session empile. */
    ecrire(f: (o: ObjetPlan) => boolean | void): boolean {
      const o = batiment(), s = session;
      if (!o || !s) return false;
      reprendre(o, s);
      if (f(o) === false) return false;
      // Un geste peut creer le premier corps (le toit simple devient un corps) : la facade choisie sur le contour se rattache a son mur.
      rattacherLesFacades(s, o);
      empiler(s.hist, o);
      rebatir();
      ctx.rafraichir();
      return true;
    },

    annuler: () => { const o = batiment(); if (o && session) { reprendre(o, session); if (annuler(session.hist, o)) { rebatir(); ctx.rafraichir(); } } },
    retablir: () => { const o = batiment(); if (o && session) { reprendre(o, session); if (retablir(session.hist, o)) { rebatir(); ctx.rafraichir(); } } },
    revenirAuDepart: () => { const o = batiment(); if (o && session) { reprendre(o, session); if (revenirAuDepart(session.hist, o)) { rebatir(); ctx.rafraichir(); } } },

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
      dialogues.ouvrir({
        type: 'choix', titre: 'Abandonner les changements ?', texte: 'Le toit reviendra comme il était à l’entrée du mode.',
        principal: { libelle: 'Continuer', executer: () => {} },
        secondaire: { libelle: 'Abandonner', executer: rendre }
      });
    },

    /** Echap : lacher l'element arme est le travail de l'appelant ; ici, la facade, puis le mode. */
    echap(): void {
      if (!session) return;
      if (session.selection) { session.selection = null; ctx.rafraichir(); }
      else if (session.vue !== 'libre') vues.quitterLaFacade();
      else this.abandonner();
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
    if (s.vueAvant && sc) {
      sc.camera.position.set(s.vueAvant.position.x, s.vueAvant.position.y, s.vueAvant.position.z);
      sc.controls.target.set(s.vueAvant.cible.x, s.vueAvant.cible.y, s.vueAvant.cible.z);
      sc.controls.update();
    }
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
    return o ? facadesDuBatiment(o.corpsToit, enPoints(o).pts as PtBrut[]) : [];
  };

  return {
    quitterLaFacade,
    methodes: {
    /** Un glisser en cours : les corps remplacent ceux du batiment, la scene suit au plus tous les `GLISSER_MS` ; rien n'entre dans la pile avant `finGlisser`. */
    apercu(corps: CorpsToit[]): void {
      const o = batiment();
      if (!o || !session) return;
      o.corpsToit = corps;
      o.toitFige = true;
      const t = Date.now();
      if (t - dernierRebatir >= GLISSER_MS) { dernierRebatir = t; rebatir(); }
    },

    /** Le glisser s'acheve : le batiment est reconstruit tel quel et la session empile une etape (une seule, quel que soit le trajet). */
    finGlisser(): boolean {
      const o = batiment(), s = session;
      if (!o || !s) return false;
      const change = empiler(s.hist, o);
      rebatir();
      ctx.rafraichir();
      return change;
    },

    /** Echap pendant un glisser : le batiment retrouve l'etat de la pile. */
    annulerGlisser(): void {
      const o = batiment(), s = session;
      if (!o || !s) return;
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
      const cible = o.corpsToit ? elementProche(o.corpsToit, touche.point) : null;
      if (cible) { session.selection = cible; ctx.rafraichir(); return true; }
      const f = facadeProche(facadesDuBatiment(o.corpsToit, enPoints(o).pts as PtBrut[]), touche.point);
      if (!f) return false;
      entrerDansLaFacade(f);
      return true;
    },

    /** Choisit une facade du navigateur : le mur `mur` du corps `rang` (null : du contour). */
    choisirFacade(rang: number | null, mur: number): boolean {
      const f = facades().find((x) => x.rang === rang && x.mur === mur);
      if (!f || !session) return false;
      entrerDansLaFacade(f);
      return true;
    },

    /** Toucher un corps dans le navigateur : sa facade la plus tournee vers la camera. */
    choisirFacadeDuCorps(rang: number): boolean {
      const sc = vue3d.scene;
      if (!sc || !session) return false;
      // Devant une facade, l'oeil est devant elle ; ailleurs, c'est la camera de l'orbite.
      const fc = session.vue === 'facade' ? session.facade : null;
      const oeil = fc ? { x: (fc.a.x + fc.b.x) / 2 + fc.n.x * 50, y: (fc.a.y + fc.b.y) / 2 + fc.n.y * 50 } : { x: sc.camera.position.x + sc.cen.x, y: sc.cen.y - sc.camera.position.z };
      const f = facadeVersLePoint(facades(), rang, oeil);
      if (!f) return false;
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
      const pts = enPoints(o).pts as PtBrut[], xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      const pose = poseDeDessus(centre, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), sc.cen, sc.camera.fov, sc.camera.aspect, reserveDuPanneau());
      sc.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      sc.controls.target.set(pose.cible.x, pose.cible.y, pose.cible.z);
      sc.controls.update();
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
