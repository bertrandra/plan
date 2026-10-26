// Racine de composition de l'application (spec §4 Phase 4, §6 "Killing the boot() closure").
//
// `boot()` a ete longtemps la fermeture ou tout se cablait : une soixantaine d'enveloppes fermant
// sur `etat` et sur la racine SVG. Ces enveloppes vivent maintenant dans app/assemblage/, par
// famille — la surface et ses calques, le dessin, l'affichage, le cadrage, les cotes, les gestes,
// les vues 3D, les exports —, et `boot()` ne fait plus que les composer, dans l'ordre ou elles
// doivent exister. Cet ordre compte : les ecouteurs se declenchent dans leur ordre d'enregistrement
// et les calques du SVG s'empilent dans leur ordre d'ajout.
//
// Pas de bus d'evenements (§6.3 l'esquissait, jamais construit) : `render()` reste appele
// directement depuis chaque geste qui modifie le plan. §6.3 l'autorisait deja explicitement
// ("Keep that — do not introduce reactivity").import { DEMO_OBJECTS, DEMO_TEMOIN_OBJECTS, DEMO_MEASURES } from '../model/demo.js';
import { aDesSommets } from '../model/formes.js';
import { restaurerOrthoDuProjet, basculerOrthophoto, ortho } from '../render/ortho.js';
import { lectureRelief } from '../core/lectureRelief.js';
import { brancherFiletsDErreur } from './ecouteurs/divers.js';
import { prevenirAdminDesCapacitesForcees } from './acces.js';
import { actualisation } from './cadastre/actualisationIgn.js';
import { creerVues3d } from './assemblage/vues3d.js';
import { vue3d, reglerVue3d } from '../three/etat3d.js';
import { type SourceControleurs } from './administration/controleurs.js';
import { inventorierLesClasses } from './administration/decouverteClasses.js';
import { quandScenePrete, appliquerZoom, trouverPointDeVue, animerHeure, dateDuJour, adresseVitrine, resoudreCourse, cadrageSurParcelle, cercleParcelle, type SceneZoomable, type Vitrine } from './vitrine.js';
import { leverEtCoucher, positionSoleil } from '../geo/soleil.js';
import { appliquerSoleilVitrine } from '../three/soleilVitrine.js';
import { brancherMenuVitrine } from './menuVitrine.js';
import { estTerrasse, estVueUtilisable, parcelleDuProjet } from '../model/fonctions.js';
import { EVENEMENT_ENCRES } from '../render/theme.js';
import type { DemandeAudit } from './audit/demande.js';
import { loadInitialProject, graineVitrine, graineAudit, type GraineDemarrage } from './boot/graines.js';
import { assemblerLePlan, atelierDu, lectureDeFondPermise, permettreToitsFond, type Tardifs } from './boot/plan.js';
import { chargements } from './boot/chargements.js';
import { brancherLePlan } from './boot/branchements.js';
import { monterLesPanneaux, sourceControleurs } from './boot/panneaux.js';
import { demarrerAudit, brancherIsolement, exposerPourLesCaptures } from './boot/annexes.js';

brancherFiletsDErreur();

function boot(seed: GraineDemarrage, options: { vitrine?: Vitrine; audit?: DemandeAudit; controleurs?: (lire: () => Promise<SourceControleurs>) => void } = {}): void {
  const tardifs: Tardifs = {};
  const p = assemblerLePlan(seed, tardifs);
  const { etat, magasin, commandes, tiroir, cadrage } = p;
  // « Actualiser IGN » et « Lecture… » (relief) se voient dans toutes les zones ; les toits lus en fond
  // ne redessinent que la barre d'etat et le menu, abonnes directement (core/lectureToits.ts).
  for (const lecture of [actualisation, lectureRelief]) lecture.abonner(() => magasin.notifier());
  permettreToitsFond(lectureDeFondPermise(!!options.vitrine || !!options.audit)); // l'audit lit ses toits lui-meme, autour de vous
  const atelier = atelierDu(p);
  const ch = chargements(p, seed, tardifs);
  brancherLePlan(p, atelier, ch, seed, tardifs);
  cadrage.centrerSurParcelle();
  const vues = creerVues3d(atelier, magasin, commandes, { affichage: p.affichage, createObjectDOM: p.dessin.createObjectDOM, resultats: p.resultats });
  tardifs.vues = vues;
  brancherIsolement(p);
  const { explorateur, inspecteur, projet } = monterLesPanneaux(p, atelier, ch, vues, seed);
  Object.assign(tardifs, { explorateur, inspecteur, projet });
  // Sur tablette, l'explorateur et l'inspecteur flottent sur le plan : ouverts d'office, ils en
  // couvriraient les deux tiers. Ils s'ouvrent a la demande.
  cadrage.replierPourTablette();
  // Le tiroir a un onglet actif des l'ouverture : le balisage n'en montre aucun.
  tiroir.activer(etat.panelTab, false);
  p.render();
  // Une capacite forcee en dur que la plateforme n'attribue pas : l'admin est prevenu (app/acces.ts).
  prevenirAdminDesCapacitesForcees();
  // La palette du serveur peut arriver apres ce premier rendu : le plan reprend alors ses encres
  // (app/paletteServeur.ts, render/theme.ts).
  window.addEventListener(EVENEMENT_ENCRES, () => p.render());
  // Un terrain venu du cadastre est cadre a sa taille reelle ; un plan dessine a la main garde le
  // cadrage historique, ses coordonnees ont ete posees avec.
  const parcelle = etat.objects.find(o => o.key === 'parcelle');
  // Le masquage du voisinage enregistre avec le projet est restitue d'abord : le cadrage ne prend
  // que les parcelles affichees. Le fond orthophoto vient apres, sur la vue cadree.
  ch.restaurerAffichage();
  if (parcelle && parcelle.cadastre && aDesSommets(parcelle) && parcelle.pts.length >= 3) cadrage.cadrerTerrains();
  restaurerOrthoDuProjet(ch.ctxOrtho());
  // « Partir d'une adresse » au premier pas passe par la COMMANDE : elle porte la capacite, la
  // permission et le quota, et un premier pas ne doit pas etre le seul chemin qui les contourne.
  if (options.vitrine) {
    // La vitrine ne montre que la Vue 3D, ombres cochees d'office (app/vitrine.ts). Rien a proposer :
    // le plan ne s'y enregistre pas.
    reglerVue3d({ ombres: true });
    // La terrasse choisie, sinon la Vue 3D montrerait le terrain sans sa structure.
    const terrasse = etat.objects.find(estTerrasse);
    if (terrasse) explorateur.selectionner(terrasse.key);
    commandes.executer('vue.3d');
    // Le point de vue d'abord, le zoom ensuite, depuis lui. Une fois la scene la : poser la camera
    // avant, c'est la poser sur une scene que la construction remplacera.
    // Sans point de vue demande, la camera se cadre sur la parcelle : c'est elle qu'on presente,
    // la terrasse comprise — la scene, elle, se centre sur la terrasse (three/scene.ts).
    const pdv = trouverPointDeVue(etat.objects.filter(estVueUtilisable), options.vitrine.pdv);
    const zoom = options.vitrine.zoom;
    quandScenePrete(() => vue3d.scene as SceneZoomable | null, (sc) => {
      if (pdv) vues.allerAuPointDeVue(pdv);
      else {
        const parcelle = parcelleDuProjet(etat.objects);
        const cadre = parcelle && aDesSommets(parcelle) && vue3d.centre ? cadrageSurParcelle(parcelle.pts, vue3d.centre, vue3d.scene?.camera.aspect ?? 1) : null;
        const s = vue3d.scene;
        if (cadre && s) {
          s.controls.target.set(cadre.cible.x, cadre.cible.y, cadre.cible.z);
          s.camera.position.set(cadre.camera.x, cadre.camera.y, cadre.camera.z);
          s.controls.update();
        }
      }
      if (zoom) appliquerZoom(vue3d.scene as SceneZoomable | null ?? sc, zoom);
    });
    // La photo aerienne se telecharge : la scene s'ouvre sans, et se refait quand les tuiles sont
    // la. Meme terrasse, donc meme camera : le zoom demande est garde (three/scene.ts).
    // Le soleil court sur la journee du jour (heureauto=y) : la date d'abord, puis l'heure a chaque pas.
    // Le jour du soleil : celui de l'adresse (`date=`), sinon aujourd'hui.
    let dateChoisie = options.vitrine.date;
    if (dateChoisie) vues.vues3d.soleil3d.date(dateChoisie);
    // La course de l'heure : les bornes absentes suivent le lever et le coucher du soleil, au jour
    // et au lieu de la parcelle. Une autre date (clic droit) la recalcule.
    const course = options.vitrine.heureAuto;
    let arreterCourse: (() => void) | null = null;
    const lancerCourse = () => {
      if (!course) return;
      arreterCourse?.();
      const [a, mo, j] = vues.vues3d.soleil3d.etat.dateStr.split('-').map(Number);
      const lieu = p.affichage.lieuActuel();
      const lc = a && mo && j ? leverEtCoucher(a, mo, j, lieu.latitude, lieu.longitude) : null;
      const resolue = resoudreCourse(course, lc);
      arreterCourse = resolue ? animerHeure(resolue, (m) => vues.vues3d.soleil3d.heure(m)) : null;
    };
    if (course) {
      if (!dateChoisie) vues.vues3d.soleil3d.date(dateDuJour());
      lancerCourse();
    }
    // La rotation automatique (`rotation=`, ou le clic droit) : OrbitControls tourne depuis la
    // position de la camera, et `autoRotateSpeed` vaut des tours par minute a 60 images/s. Reposee
    // a chaque instant plutot qu'une fois : la scene se reconstruit (tuiles de l'orthophoto, demo
    // rechargee) avec de nouveaux controles, qui ne tourneraient plus.
    let rotation = options.vitrine.rotation;
    const appliquerRotation = () => {
      const c = vue3d.scene?.controls;
      if (!c) return;
      c.autoRotate = rotation !== null;
      c.autoRotateSpeed = rotation ?? 0;
    };
    // Le soleil qu'on voit, autour de la parcelle, et le ciel du couchant (three/soleilVitrine.ts) :
    // reposes a chaque pas, comme la rotation, parce que l'heure court et que la scene se reconstruit.
    const scene = { soleil: options.vitrine.soleil, couchant: options.vitrine.couchant };
    const poserSoleilVitrine = (pos: { elevRad: number; azRad: number }) => {
      const s = vue3d.scene;
      const parcelle = parcelleDuProjet(etat.objects);
      if (!s || !vue3d.centre || !parcelle || !aDesSommets(parcelle)) return;
      const cercle = cercleParcelle(parcelle.pts, vue3d.centre);
      if (cercle) appliquerSoleilVitrine(s, pos, cercle, scene);
    };
    // A chaque pose du soleil, avant le rendu (three/soleilVue3d.ts) : pas de clignotement.
    reglerVue3d({ apresSoleil: poserSoleilVitrine });
    // Et quand rien ne bouge (heure fixe, scene reconstruite) : depuis l'etat du soleil.
    const appliquerSoleil = () => {
      const [a, mo, j] = vues.vues3d.soleil3d.etat.dateStr.split('-').map(Number);
      if (!a || !mo || !j) return;
      const lieu = p.affichage.lieuActuel();
      poserSoleilVitrine(positionSoleil(a, mo, j, vues.vues3d.soleil3d.etat.minutes / 60, lieu.latitude, lieu.longitude));
    };
    setInterval(() => { appliquerRotation(); appliquerSoleil(); }, 250);
    // Le clic droit : rafraichir, copier l'adresse (avec la date et la rotation), et les reglages.
    brancherMenuVitrine({
      adresse: () => adresseVitrine(location.href, dateChoisie, rotation, scene),
      reglages: {
        date: () => vues.vues3d.soleil3d.etat.dateStr,
        poserDate: (d) => { dateChoisie = d; vues.vues3d.soleil3d.date(d); lancerCourse(); },
        rotation: () => rotation,
        poserRotation: (v) => { rotation = v; appliquerRotation(); },
        soleil: () => scene.soleil,
        poserSoleil: (v) => { scene.soleil = v; appliquerSoleil(); },
        couchant: () => scene.couchant,
        poserCouchant: (v) => { scene.couchant = v; appliquerSoleil(); }
      }
    });
    if (options.vitrine.orthophoto) {
      void basculerOrthophoto(true, ch.ctxOrtho()).then(() => { if (ortho.actif) commandes.executer('vue.3d'); });
    }
  }
  else if (options.audit) void demarrerAudit(p, vues, options.audit);
  else if (seed.ouvrirAdresse) commandes.executer('projet.depuisAdresse');
  // Un projet d'un schema anterieur : proposer de le mettre a jour, une fois le plan a l'ecran ; puis
  // les toits a cheval sur deux parcelles qui attendent une reponse.
  else { projet.proposerMiseAJour(); ch.questionsACheval(); ch.toitsFond.relancer(); void ch.profilsFacades.relancer(); }
  if (import.meta.env.DEV) exposerPourLesCaptures(p, explorateur);
  // L'ecran des controleurs relit a chaque demande : on lui donne la lecture, pas son resultat.
  if (options.controleurs) {
    options.controleurs(async () => sourceControleurs(commandes, inspecteur, etat.objects,
      await inventorierLesClasses(magasin, etat, (cle) => explorateur.selectionner(cle))));
  }
}

// main.ts n'a besoin que de ces deux points d'entree.
export { boot, loadInitialProject, graineVitrine, graineAudit };
