// La vitrine (`?mode=demo`, app/vitrine.ts) : la Vue 3D du plan de demonstration, publique, faite pour etre encadree. Son
// demarrage, sorti de boot() : point de vue et zoom une fois la scene la, course du soleil sur la journee, rotation, soleil et ciel
// du couchant reposes a chaque pas, clic droit.

import { aDesSommets } from '../../model/formes.js';
import { basculerOrthophoto, ortho, type ContexteOrtho } from '../../render/ortho.js';
import { vue3d, reglerVue3d } from '../../three/etat3d.js';
import { quandScenePrete, appliquerZoom, trouverPointDeVue, animerHeure, dateDuJour, adresseVitrine, resoudreCourse, cadrageSurParcelle, cercleParcelle, type SceneZoomable, type Vitrine } from '../vitrine.js';
import { leverEtCoucher, positionSoleil } from '../../geo/soleil.js';
import { appliquerSoleilVitrine } from '../../three/soleilVitrine.js';
import { brancherMenuVitrine } from '../menuVitrine.js';
import { estTerrasse, estVueUtilisable, parcelleDuProjet } from '../../model/fonctions.js';
import type { Plan } from './plan.js';
import type { Vues3d } from '../assemblage/vues3d.js';
import type { Explorateur } from '../explorateur.js';

/** Demarre la vitrine sur le plan assemble : rien n'y est propose ni enregistre. */
export function demarrerVitrine(p: Plan, vues: Vues3d, explorateur: Explorateur, ctxOrtho: () => ContexteOrtho, vitrine: Vitrine): void {
  const { etat, commandes } = p;
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
  const pdv = trouverPointDeVue(etat.objects.filter(estVueUtilisable), vitrine.pdv);
  const zoom = vitrine.zoom;
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
  let dateChoisie = vitrine.date;
  if (dateChoisie) vues.vues3d.soleil3d.date(dateChoisie);
  // La course de l'heure : les bornes absentes suivent le lever et le coucher du soleil, au jour
  // et au lieu de la parcelle. Une autre date (clic droit) la recalcule.
  const course = vitrine.heureAuto;
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
  let rotation = vitrine.rotation;
  const appliquerRotation = () => {
    const c = vue3d.scene?.controls;
    if (!c) return;
    c.autoRotate = rotation !== null;
    c.autoRotateSpeed = rotation ?? 0;
  };
  // Le soleil qu'on voit, autour de la parcelle, et le ciel du couchant (three/soleilVitrine.ts) :
  // reposes a chaque pas, comme la rotation, parce que l'heure court et que la scene se reconstruit.
  const scene = { soleil: vitrine.soleil, couchant: vitrine.couchant };
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
  if (vitrine.orthophoto) {
    void basculerOrthophoto(true, ctxOrtho()).then(() => { if (ortho.actif) commandes.executer('vue.3d'); });
  }
}
