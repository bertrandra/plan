// Le mode Toit de la Vue 3D (MD/spec-mode-toit-3d.md, etape 1) : retoucher le toit d'un batiment du projet dans une session.
//
// Une session garde sa propre pile d'annulation (facade/regles/toits/sessionToit.ts) : les gestes ecrivent dans le batiment sur
// place — la scene 3D le montre tout de suite — sans toucher a l'historique du projet. `valider` remet d'abord le depart, empile
// UNE etape d'historique du projet, puis ecrit l'etat final : un seul Ctrl+Z defait toute la session. `abandonner` remet le depart.
//
// Hors session, rien ne change. La session s'arrete d'elle-meme quand on quitte la Vue 3D ou qu'on selectionne autre chose.

import { estBatiment } from '../model/fonctions.js';
import { enPoints } from '../model/formes.js';
import { aChange, annuler, creerHistorique, empiler, peutAnnuler, peutRetablir, photographier, restaurer, retablir, revenirAuDepart,
  type HistoriqueToit } from '../facade/regles/toits/sessionToit.js';
import { facadeProche, facadesDuBatiment, orientationDe, type FacadeVisee } from '../facade/regles/toits/facadesDesCorps.js';
import { poseDeFacade } from '../three/poseFacade.js';
import { objetSousLePointeur } from '../three/scene.js';
import { hotes3d, vue3d } from '../three/etat3d.js';
import { dialogues } from '../shell/dialogues.js';
import { showToast } from '../shell/dialogs.js';
import type { Atelier } from './atelier.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';

interface PoseVue { position: { x: number; y: number; z: number }; cible: { x: number; y: number; z: number } }

export interface SessionToit {
  cle: string;
  hist: HistoriqueToit;
  facade: FacadeVisee | null;
  /** La camera avant d'entrer dans une facade : on la retrouve en la quittant. */
  vueAvant: PoseVue | null;
  isole: boolean;
}

let session: SessionToit | null = null;

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
}

export function etatToit(): EtatToit {
  if (!session) return { actif: false, peutAnnuler: false, peutRetablir: false, change: false, isole: false, facade: null };
  const f = session.facade;
  return {
    actif: true, peutAnnuler: peutAnnuler(session.hist), peutRetablir: peutRetablir(session.hist), change: aChange(session.hist), isole: session.isole,
    facade: f ? 'Façade ' + orientationDe(f).toLowerCase() + ' · ' + f.L.toFixed(2).replace('.', ',') + ' m' : null
  };
}

export interface ContexteModeToit {
  /** Reconstruit la scene 3D du batiment : ce qu'une session change se voit tout de suite. */
  rebatir: (o: ObjetPlan | null) => void;
  /** Redessine les zones. */
  rafraichir: () => void;
}

/** La hauteur du faitage du batiment : de quoi cadrer la facade en entier. */
function hauteurDe(o: ObjetPlan): number {
  const corps = (o.corpsToit ?? []).map((c) => c.faitage);
  return corps.length ? Math.max(...corps) : (o.elevation ?? 3) + (o.toit?.hauteur ?? 2.5);
}

export function creerModeToit(a: Atelier, ctx: ContexteModeToit) {
  const batiment = (): ObjetPlan | undefined => (session ? a.etat.objects.find((o) => o.key === session?.cle) : undefined);
  const rebatir = () => { if (vue3d.scene) ctx.rebatir(batiment() ?? null); };

  const fermer = (): void => {
    if (!session) return;
    if (session.isole) a.etat.isolement = null;
    session = null;
    a.render();
    rebatir();
    ctx.rafraichir();
  };

  /** Remet la camera comme elle etait avant la facade. */
  const quitterLaFacade = (): void => {
    const s = session, sc = vue3d.scene;
    if (!s?.facade) return;
    if (s.vueAvant && sc) {
      sc.camera.position.set(s.vueAvant.position.x, s.vueAvant.position.y, s.vueAvant.position.z);
      sc.controls.target.set(s.vueAvant.cible.x, s.vueAvant.cible.y, s.vueAvant.cible.z);
      sc.controls.update();
    }
    s.facade = null;
    s.vueAvant = null;
    ctx.rafraichir();
  };

  const entrerDansLaFacade = (f: FacadeVisee): void => {
    const s = session, o = batiment(), sc = vue3d.scene;
    if (!s || !o || !sc) return;
    if (!s.vueAvant) s.vueAvant = { position: { ...sc.camera.position }, cible: { ...sc.controls.target } };
    s.facade = f;
    const pose = poseDeFacade(f.a, f.b, f.n, hauteurDe(o), sc.cen, sc.camera.fov, sc.camera.aspect);
    sc.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    sc.controls.target.set(pose.cible.x, pose.cible.y, pose.cible.z);
    sc.controls.update();
    ctx.rafraichir();
  };

  return {
    /** Entre dans le mode sur le batiment selectionne. */
    ouvrir(): boolean {
      const o = a.etat.objects.find((x) => x.key === a.etat.selectedKey);
      if (session || !estRetouchable(o)) return false;
      session = { cle: o.key, hist: creerHistorique(o), facade: null, vueAvant: null, isole: false };
      ctx.rafraichir();
      showToast('Touchez un mur du bâtiment pour choisir sa façade.');
      return true;
    },

    /** Une retouche du toit : `f` ecrit dans le batiment ; faux = rien n'a change. La scene suit, la session empile. */
    ecrire(f: (o: ObjetPlan) => boolean | void): boolean {
      const o = batiment(), s = session;
      if (!o || !s) return false;
      if (f(o) === false) return false;
      empiler(s.hist, o);
      rebatir();
      ctx.rafraichir();
      return true;
    },

    annuler: () => { const o = batiment(); if (o && session && annuler(session.hist, o)) { rebatir(); ctx.rafraichir(); } },
    retablir: () => { const o = batiment(); if (o && session && retablir(session.hist, o)) { rebatir(); ctx.rafraichir(); } },
    revenirAuDepart: () => { const o = batiment(); if (o && session && revenirAuDepart(session.hist, o)) { rebatir(); ctx.rafraichir(); } },

    /** Isole le batiment : le reste du voisinage est masque (etat d'affichage, jamais enregistre). */
    basculerIsolement(): void {
      const s = session;
      if (!s) return;
      s.isole = !s.isole;
      a.etat.isolement = s.isole ? s.cle : null;
      a.render();
      rebatir();
      ctx.rafraichir();
    },

    /** Valide : une seule etape d'historique du projet pour toute la session. */
    valider(): boolean {
      const o = batiment(), s = session;
      if (!o || !s) return false;
      const final = photographier(o);
      if (aChange(s.hist)) {
        restaurer(o, s.hist.pas[0] ?? {});
        a.pushHistory();
        restaurer(o, final);
        o.toitFige = true;
        a.markDirty();
      }
      const fige = aChange(s.hist);
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
      if (session.facade) quitterLaFacade();
      else this.abandonner();
    },

    quitterLaFacade,

    /** Le toucher sur la scene : la facade du batiment la plus proche du point touche. Vrai si le toucher a choisi une facade. */
    toucher(ndc: { x: number; y: number }): boolean {
      const o = batiment();
      if (!session || !o) return false;
      const touche = objetSousLePointeur(ndc, (cle) => cle === o.key);
      if (touche.cle !== o.key || !touche.point) return false;
      const f = facadeProche(facadesDuBatiment(o.corpsToit, enPoints(o).pts as PtBrut[]), touche.point);
      if (!f) return false;
      entrerDansLaFacade(f);
      return true;
    },

    /** Quitte le mode sans question : la Vue 3D se ferme, ou la selection change. */
    arreterSansDemander(raison: string): void {
      if (!session) return;
      const change = aChange(session.hist);
      this.abandonner(true);
      if (change) showToast(raison);
    },

    hote: () => hotes3d.vue3d
  };
}

export type ModeToit = ReturnType<typeof creerModeToit>;
