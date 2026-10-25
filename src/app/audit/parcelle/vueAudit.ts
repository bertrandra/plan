// La Vue 3D pendant l'audit de la parcelle (controleur.ts) : epuree autour des batiments gardes, a hauteur d'homme devant la facade
// visee, ou en vue d'ensemble ; le doigt y choisit une facade.

import { poserFacadesFaites } from '../../../three/facadeDevant3d.js';
import { epurerVue3d, objetSousLePointeur } from '../../../three/scene.js';
import { affichage3d } from '../../../three/etat3d.js';
import { angleAutour, cadreDe, facadeTouchee, forceDuTrait, suiviPieton, vuePieton, type CacheVue } from './vuePrise.js';
import { poserTraitDePres } from '../../../three/traitDePres.js';
import { parcelleDuProjet } from '../../../model/fonctions.js';
import { aDesSommets } from '../../../model/formes.js';
import type { ListeDeControle } from './liste.js';
import { cleFacade } from './reconnaissance.js';
import type { PtBrut } from '../../../model/types.js';
import type { ContexteAuditParcelle } from './typesSession.js';
import type { capteurs } from './capteursPrise.js';
import { facadeMontree, type viseeDe } from './viseeFacade.js';

/** Le toit depasse le haut des murs : la vue d'ensemble compte cela de plus pour le cadrer. */
const PART_TOIT = 1.4;
/**
 * La facade reconnue vient de se perdre (un angle de la maison, la boussole qui tremble) : la vue a
 * hauteur d'homme reste cela avant de passer a la vue d'ensemble, pour ne pas sauter a chaque pas.
 */
export const DELAI_ENSEMBLE_MS = 2500;

/** L'ecran de l'audit pose sur la Vue 3D : la prise, ou les propositions ; null quand elle est rendue. */
export type EcranVue = 'prise' | 'propositions' | null;

/**
 * Les batiments que la Vue 3D de l'audit garde : ceux de la parcelle, ou le seul batiment verrouille
 * pour la prise (`verrouiller`), et celui de la facade visee ; leurs contours, et la hauteur a
 * cadrer (le plus haut mur, toit compris).
 *
 * Le verrou ne vaut que sur l'ecran de prise (`enPrise`). Les rendus que Claude recoit se dessinent
 * sur cette meme scene epuree (les batiments de la parcelle et le sol, sans arbres, clotures ni
 * voisins) quand l'analyse est lancee : un verrou encore pose y cacherait toutes les maisons sauf une,
 * et le rendu de leurs facades montrerait un terrain vide.
 */
function batimentsDeLaVue(ctx: ContexteAuditParcelle, visee: ReturnType<typeof viseeDe>, liste: () => ListeDeControle, enPrise: () => boolean) {
  const batimentsGardes = (): Set<string> => {
    const verrou = enPrise() ? visee.verrou() : null;
    const s = new Set(verrou !== null ? [verrou] : liste().batiments.map((b) => b.cle));
    const v = visee.cleBatiment();
    if (v) s.add(v);
    return s;
  };
  const contoursDe = (cles: Set<string>): PtBrut[][] =>
    ctx.etat.objects.filter((o) => cles.has(o.key) && aDesSommets(o)).map((o) => (o as { pts: PtBrut[] }).pts);
  const hauteurDe = (cles: Set<string>): number =>
    Math.max(3, ...liste().batiments.filter((b) => cles.has(b.cle)).flatMap((b) => b.facades.map((f) => f.hauteurMur))) * PART_TOIT;
  return { batimentsGardes, contoursDe, hauteurDe };
}

/**
 * La vue epuree de l'audit : les batiments gardes et le sol, rien d'autre. `poser` l'active (audit
 * ouvert) ou la retire ; `garder` la repose si ce qu'elle garde a change (un batiment verrouille),
 * et seulement alors.
 */
function vueEpuree(ctx: ContexteAuditParcelle, batimentsGardes: () => Set<string>) {
  const epurer = ctx.epurer ?? epurerVue3d;
  let active = false;
  let gardesPoses: string | null = null;
  function garder(): void {
    if (!active) {
      if (gardesPoses !== null) { gardesPoses = null; epurer(null); }
      return;
    }
    // Le sol reste : la parcelle du projet (son gazon) et les parcelles voisines, a plat.
    const sols = ctx.etat.objects.filter((o) => o.key === 'parcelle' || o.fonction === 'terrain').map((o) => o.key);
    const cles = new Set([...batimentsGardes(), ...sols]);
    const signature = [...cles].sort().join(',');
    if (signature === gardesPoses) return;
    gardesPoses = signature;
    epurer((cle) => cles.has(cle));
  }
  return { garder, active: () => active, poser(oui: boolean): void { active = oui; garder(); } };
}

/**
 * Une facade choisie fixe la vue : la camera tourne autour de son batiment, a distance fixe, sans
 * suivre le GPS. Elle arrive face a la facade ; ensuite la rotation suit vos pas autour du batiment
 * (si la position est sure) ou le doigt (vuePrise.ts, `orbite`). Faux quand il n'y a rien a cadrer.
 */
function poserOrbite(
  suivi: ReturnType<typeof suiviPieton>, sens: ReturnType<typeof capteurs>, visee: ReturnType<typeof viseeDe>,
  vues: { contoursDe: (cles: Set<string>) => PtBrut[][]; hauteurDe: (cles: Set<string>) => number }, nouvelle: boolean, force: boolean,
): boolean {
  const f = visee.facade(), cle = visee.cleBatiment();
  if (!f || !cle) return false;
  const cadre = cadreDe(vues.contoursDe(new Set([cle])), vues.hauteurDe(new Set([cle])), null);
  if (!cadre) return false;
  const depart = ((Math.atan2(-f.normale.x, -f.normale.y) * 180) / Math.PI + 360) % 360;
  suivi.orbite(cadre, depart, angleAutour(cadre.centre, sens.position(), sens.precision()), nouvelle, force, f);
  return true;
}

/**
 * La Vue 3D de l'audit (vuePrise.ts) :
 * - epuree tant que l'audit est ouvert (`epurer`) : le batiment audite et le sol, sans arbres, ni
 *   voisins, ni clotures (demande de l'utilisateur du 15 octobre) ; un affichage, rien n'entre dans
 *   le projet ;
 * - pendant la prise, a hauteur d'homme quand une position et une facade visee sont connues (c'est la
 *   prise elle-meme), en vue d'ensemble sinon (on choisit une facade en la touchant) ;
 * - pendant les propositions, en vue d'ensemble sur la parcelle, au-dessus de l'ecran qui les liste.
 * Le doigt y choisit une facade pendant la prise. Rien ne bouge hors de ces deux ecrans.
 */
export function vueDe(ctx: ContexteAuditParcelle, sens: ReturnType<typeof capteurs>, visee: ReturnType<typeof viseeDe>, liste: () => ListeDeControle) {
  const horloge = ctx.horloge ?? (() => Date.now());
  const suivi = suiviPieton(ctx.vue ?? vuePieton(), horloge);
  const poserTrait = ctx.trait ?? poserTraitDePres;
  /** Le trait pose, arrondi au centieme : on ne le repose que s'il change. */
  let traitPose: string | null = null;
  /** Le trait renforce suit la derniere pose a hauteur d'homme ; hors d'elle, il est retire. */
  function trait(): void {
    const pose = ecran === 'prise' && mode === 'pieton' ? suivi.derniere() : null;
    const f = visee.facade(), cle = visee.cleBatiment(), p = sens.position();
    const force = pose && f && cle && p ? Math.round(forceDuTrait(p, pose.oeil, f, suivi.rapport()) * 100) / 100 : 0;
    const signature = force > 0 && cle ? cle + '@' + force : null;
    if (signature === traitPose) return;
    traitPose = signature;
    poserTrait(signature ? cle : null, force);
  }
  let ecran: EcranVue = null;
  let mode: 'pieton' | 'ensemble' | 'orbite' | null = null;
  /** La facade choisie sur laquelle la vue est fixee (cle du batiment et cote) ; une autre choisie repart face a elle. */
  let orbiteSur: string | null = null;
  let perdueDepuis: number | null = null;
  const { batimentsGardes, contoursDe, hauteurDe } = batimentsDeLaVue(ctx, visee, liste, () => ecran === 'prise');
  const epure = vueEpuree(ctx, batimentsGardes);
  const garder = epure.garder;

  /**
   * La vue d'ensemble : sur les batiments gardes pendant la prise, sur la parcelle et eux pendant les
   * propositions. `entree` : on y arrive, et le regard se choisit (face a la facade visee, sinon
   * depuis votre position) ; sinon il garde celui de la camera, que le doigt a pu tourner.
   */
  function ensemble(entree: boolean): void {
    const cles = batimentsGardes();
    const contours = contoursDe(cles);
    const parcelle = parcelleDuProjet(ctx.etat.objects);
    // Deux vues avant / apres : ce qui se compare, ce sont les batiments, que la parcelle entiere rendrait petits.
    if (ecran === 'propositions' && parcelle && aDesSommets(parcelle) && !affichage3d.comparaison) contours.push(parcelle.pts);
    let azimut: number | null = null;
    const cadreSans = cadreDe(contours, hauteurDe(cles), null);
    if (!cadreSans) return;
    if (entree) {
      const f = visee.facade(), p = sens.position();
      // Face a la facade visee, depuis l'exterieur ; sinon depuis ou vous etes, vers le batiment.
      if (f) azimut = ((Math.atan2(-f.normale.x, -f.normale.y) * 180) / Math.PI + 360) % 360;
      else if (p && Math.hypot(cadreSans.centre.x - p.x, cadreSans.centre.y - p.y) > 1) azimut = ((Math.atan2(cadreSans.centre.x - p.x, cadreSans.centre.y - p.y) * 180) / Math.PI + 360) % 360;
    }
    suivi.ensemble({ ...cadreSans, azimutDeg: azimut });
  }

  /** Une facade choisie fixe la vue : la camera tourne autour de son batiment (`poserOrbite`). */
  function orbite(force: boolean): boolean {
    const cleVisee = visee.cleVisee();
    const nouvelle = mode !== 'orbite' || orbiteSur !== cleVisee;
    if (!poserOrbite(suivi, sens, visee, { contoursDe, hauteurDe }, nouvelle, force)) return false;
    mode = 'orbite'; orbiteSur = cleVisee; perdueDepuis = null;
    return true;
  }

  const suivre = (force = false) => {
    suivreSansTrait(force);
    // Une pose forcee (scene rebatie, cadrage) repose le trait : celui d'une scene demolie est parti avec elle.
    if (force) traitPose = null;
    trait();
  };
  const suivreSansTrait = (force: boolean) => {
    if (!suivi.actif()) return;
    if (ecran === 'propositions') {
      const entree = mode !== 'ensemble';
      mode = 'ensemble';
      if (entree || force) ensemble(entree);
      return;
    }
    if (visee.choisie() && orbite(force)) return;
    const f = visee.facade(), p = sens.position();
    if (p && f) {
      const entree = mode !== 'pieton';
      mode = 'pieton'; perdueDepuis = null;
      // Une facade choisie (touchee, ou dans la liste) se regarde, quel que soit le cap du telephone.
      suivi.suivre(p, visee.choisie() ? null : sens.cap(), f, force || entree, contoursDe(batimentsGardes()));
      return;
    }
    if (p && mode === 'pieton') {
      const t = horloge();
      perdueDepuis ??= t;
      if (t - perdueDepuis < DELAI_ENSEMBLE_MS) { suivi.suivre(p, sens.cap(), null, force, contoursDe(batimentsGardes())); return; }
    }
    const entree = mode !== 'ensemble';
    mode = 'ensemble'; perdueDepuis = null;
    if (entree || force) ensemble(entree);
  };
  const poserFaites = ctx.surlignerFaites ?? poserFacadesFaites;
  let faitesPosees: string | null = null;
  /**
   * En vert, les facades qui ont deja une photo : on voit ce qui reste, et on peut les reprendre. La
   * facade visee n'y est pas : son propre surlignage la dit (verte si elle a deja une photo). Les
   * voiles ne sont refaits que si la liste change, pas a chaque mouvement de la boussole ; ceux d'un
   * batiment que la vue epuree masque ne flottent pas dans le vide.
   */
  const faites = () => {
    garder();
    const visee_ = visee.cleVisee();
    const gardes = batimentsGardes();
    const lignes = ecran === 'prise' ? liste().batiments.filter((b) => !epure.active() || gardes.has(b.cle)).flatMap((b) => b.facades.filter((f) => f.statut === 'photographiee' && cleFacade(b.cle, f.cote) !== visee_).map((f) => ({ cle: cleFacade(b.cle, f.cote), facade: facadeMontree(f) }))) : [];
    const cle = lignes.map((l) => l.cle).join(',');
    if (cle === faitesPosees) return;
    faitesPosees = cle;
    poserFaites(lignes.map((l) => l.facade));
  };
  return {
    suivre,
    faites,
    /** L'audit ouvert (vrai) ou ferme (faux) : la vue s'epure, ou redevient celle du projet. */
    epurer: epure.poser,
    /** L'ecran pose sur la Vue 3D : la camera y est pilotee ; null la rend. */
    activer(e: EcranVue): void {
      if (e !== ecran) mode = null;
      ecran = e;
      suivi.activer(e !== null);
      faites();
      if (e) suivre(true); else trait();
    },
    lacher: () => suivi.lacher(),
    /** L'ecran de l'audit commence la (pixels de la fenetre) : la camera cadre ce qu'il laisse voir, et se repose. */
    cadrer(cache: CacheVue | null): void { suivi.cadrer(cache); suivre(true); },
    /** La facade touchee : celle du batiment de la liste dont le mur passe le plus pres du doigt. */
    toucher(ndc: { x: number; y: number }): string | 'choisie' | null {
      if (!suivi.actif() || ecran !== 'prise') return null;
      // Le rayon traverse un arbre, une cloture, un batiment hors de la liste : seule compte la
      // premiere facade de la liste qu'il rencontre.
      const verrou = visee.verrou();
      const dansLaListe = (cle: string) => (verrou === null || cle === verrou) && liste().batiments.some((b) => b.cle === cle);
      const { cle, point } = (ctx.objetSous ?? objetSousLePointeur)(ndc, dansLaListe);
      if (!cle || !point) return null;
      const ligne = liste().batiments.find((b) => b.cle === cle);
      if (!ligne) return 'Ce bâtiment n’est pas dans la liste de la parcelle.';
      const f = facadeTouchee(ligne.facades, point);
      if (!f) return 'Ce bâtiment n’a pas de façade à photographier.';
      visee.choisir(cle, f.cote);
      faites();
      // La facade touchee fixe la vue : la camera tourne autour de son batiment, face a elle.
      suivre(true);
      return 'choisie';
    },
  };
}
