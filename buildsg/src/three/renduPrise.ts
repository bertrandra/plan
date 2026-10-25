// Le rendu du modele depuis la prise de vue d'une photo (MD/spec-regles-toits.md §14.1, lot L17) :
// la Vue 3D ouverte, vue par une camera posee la ou le telephone etait, avec son champ ; dessinee
// hors ecran a 1 024 px et rendue en JPEG. C'est l'image que Claude compare a la photo : « le modele,
// pas la realite ».
//
// Quand la facade visee est connue (`CibleFacadeRendu`), le rendu la montre ENTIERE, du pied du mur
// au haut du pignon ou du pan (demande de l'utilisateur du 15 octobre : le rendu, pris depuis la
// position de la photo a 1,5 m, zoomait sur le bas du mur et coupait le toit). La camera reste sur
// la ligne qui va de la facade a la personne et recule jusqu'a ce que les quatre coins tiennent dans
// l'image ; son inclinaison se deduit alors de la geometrie (elle vise le milieu de la facade), et
// non du capteur du telephone, que la lecture au retour de l'appareil photo laissait a n'importe
// quelle valeur : c'est ce « parametre incline » qui ne fonctionnait pas.
//
// La scene et son rendu sont ceux de la Vue 3D (le tampon est garde, `preserveDrawingBuffer`) : on
// change la taille du rendu et la camera le temps d'une image, puis on remet tout en place et on
// redessine la vue, pour que l'ecran ne garde pas le cliche.

import { vue3d } from './etat3d.js';
import { versLocalDepuis } from './primitives.js';

/** Le telephone tenu a hauteur des yeux (render/couleurPhotoAudit.ts fait de meme). */
export const HAUTEUR_PRISE_M = 1.5;
/** Le champ horizontal d'un telephone en grand-angle normal, quand l'EXIF ne le donne pas (facade/vision/cadrage.ts). */
export const CHAMP_DEFAUT_DEG = 66;
export const LARGEUR_RENDU_PX = 1024;
export const HAUTEUR_RENDU_PX = 768;

export interface PriseRendu {
  x: number;
  y: number;
  azimutDeg: number;
  inclinaisonDeg?: number | null;
  champDeg?: number | null;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** La facade a montrer entiere : ses deux bouts (vue de dehors, comme facade/geometrie.ts) et le haut du pignon ou du pan. */
export interface CibleFacadeRendu {
  gauche: { x: number; y: number };
  droite: { x: number; y: number };
  /** Le haut du pignon ou du pan au-dessus du sol, en metres ; le pied du mur est au sol (0). */
  hautM: number;
}

/** La camera posee par `poseFacadeEntiere` : sa position (repere du plan), sa hauteur, son cap et son inclinaison. */
export interface PoseFacadeEntiere {
  x: number;
  y: number;
  hauteurM: number;
  azimutDeg: number;
  inclinaisonDeg: number;
  /** De combien la camera a recule derriere la position de la prise, en metres. */
  reculM: number;
  /** Les quatre coins tiennent dans l'image (sinon c'est le meilleur recul trouve). */
  entiere: boolean;
}

/** Un peu d'air autour de la facade : elle occupe au plus cette part de l'image, dans chaque sens. */
export const PART_IMAGE_FACADE = 0.92;
/** On ne recule pas plus loin : au-dela la facade n'a plus de detail, et la camera traverserait le voisinage. */
export const RECUL_MAX_M = 45;
const PAS_RECUL_M = 0.5;
/** Plus pres que cela du milieu du mur, ou de son mauvais cote, la direction de la prise ne dit rien : on se met face au mur. */
const DISTANCE_REPLI_M = 10;

/**
 * La pose qui montre la facade entiere (voir l'en-tete). La camera regarde vers le milieu de la
 * facade depuis la position de la prise, puis recule sur cette ligne par pas de 50 cm jusqu'a ce que
 * les quatre coins (pied et haut du mur, aux deux bouts) tiennent dans le champ, a PART_IMAGE_FACADE
 * pres. L'inclinaison vise le milieu de la hauteur, de sorte que le pied et le haut s'equilibrent.
 */
export function poseFacadeEntiere(p: PriseRendu, cible: CibleFacadeRendu, largeur = LARGEUR_RENDU_PX, hauteur = HAUTEUR_RENDU_PX): PoseFacadeEntiere {
  const ux = cible.droite.x - cible.gauche.x, uy = cible.droite.y - cible.gauche.y;
  const l = Math.hypot(ux, uy) || 1;
  // La normale sortante : de dehors, la facade se lit de gauche a droite (facade/geometrie.ts).
  const n = { x: uy / l, y: -ux / l };
  const milieu = { x: (cible.gauche.x + cible.droite.x) / 2, y: (cible.gauche.y + cible.droite.y) / 2 };
  let dx = milieu.x - p.x, dy = milieu.y - p.y;
  const d0 = Math.hypot(dx, dy);
  // Du bon cote du mur, assez loin : la direction de la prise. Sinon face au mur, a distance de repli.
  const dehors = (p.x - milieu.x) * n.x + (p.y - milieu.y) * n.y;
  let depart = { x: p.x, y: p.y };
  if (d0 < 0.5 || dehors < 0.3) {
    dx = -n.x; dy = -n.y;
    depart = { x: milieu.x + n.x * DISTANCE_REPLI_M, y: milieu.y + n.y * DISTANCE_REPLI_M };
  } else { dx /= d0; dy /= d0; }
  const d = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / d, y: dy / d };
  const droite = { x: dir.y, y: -dir.x };
  const champH = p.champDeg ?? CHAMP_DEFAUT_DEG;
  const tanH = Math.tan(rad(champH) / 2) * PART_IMAGE_FACADE;
  const tanV = Math.tan(rad(champVertical(champH, largeur, hauteur)) / 2) * PART_IMAGE_FACADE;
  const coins: { x: number; y: number; h: number }[] = [
    { ...cible.gauche, h: 0 }, { ...cible.droite, h: 0 }, { ...cible.gauche, h: cible.hautM }, { ...cible.droite, h: cible.hautM },
  ];
  const milieuH = cible.hautM / 2;
  const essai = (recul: number) => {
    const c = { x: depart.x - dir.x * recul, y: depart.y - dir.y * recul };
    const devant = Math.max(0.5, (milieu.x - c.x) * dir.x + (milieu.y - c.y) * dir.y);
    const incl = Math.atan2(milieuH - HAUTEUR_PRISE_M, devant);
    const ci = Math.cos(incl), si = Math.sin(incl);
    const entiere = coins.every((q) => {
      const a = (q.x - c.x) * dir.x + (q.y - c.y) * dir.y;
      const lat = (q.x - c.x) * droite.x + (q.y - c.y) * droite.y;
      const dv = q.h - HAUTEUR_PRISE_M;
      const z = a * ci + dv * si, v = -a * si + dv * ci;
      return z > 0.1 && Math.abs(lat) / z <= tanH && Math.abs(v) / z <= tanV;
    });
    return { c, incl, entiere };
  };
  let recul = 0, e = essai(0);
  while (!e.entiere && recul < RECUL_MAX_M) { recul += PAS_RECUL_M; e = essai(recul); }
  return {
    x: e.c.x, y: e.c.y, hauteurM: HAUTEUR_PRISE_M,
    azimutDeg: ((Math.atan2(dir.x, dir.y) * 180) / Math.PI + 360) % 360,
    inclinaisonDeg: (e.incl * 180) / Math.PI, reculM: recul, entiere: e.entiere,
  };
}

/** Le champ vertical de la camera three.js, d'apres le champ horizontal et les proportions de l'image. */
export function champVertical(champHorizontalDeg: number, largeur: number, hauteur: number): number {
  return (2 * Math.atan(Math.tan(rad(champHorizontalDeg) / 2) * hauteur / largeur) * 180) / Math.PI;
}

/** Le point vise a 10 m devant la prise : azimut depuis le nord (x = est, z = sud), inclinaison au-dessus de l'horizon. */
export function ciblePrise(p: PriseRendu, local: { x: number; z: number }): { x: number; y: number; z: number } {
  const az = rad(p.azimutDeg), inc = rad(p.inclinaisonDeg ?? 0);
  const d = 10;
  return { x: local.x + Math.sin(az) * Math.cos(inc) * d, y: HAUTEUR_PRISE_M + Math.sin(inc) * d, z: local.z - Math.cos(az) * Math.cos(inc) * d };
}

export interface ImageRendu { base64: string; mediaType: 'image/jpeg'; largeur: number; hauteur: number }

/**
 * Le rendu du modele depuis cette prise, ou null si la Vue 3D n'est pas ouverte : c'est elle qui
 * porte la scene, et l'audit l'ouvre toujours avant les propositions.
 */
export function rendreDepuisPrise(prise: PriseRendu, cible: CibleFacadeRendu | null = null, largeur = LARGEUR_RENDU_PX, hauteur = HAUTEUR_RENDU_PX): ImageRendu | null {
  const s = vue3d.scene;
  if (!s) return null;
  // La facade visee entiere, ou la prise telle quelle (photo du toit, ou facade inconnue).
  let p = prise;
  if (cible) {
    const pose = poseFacadeEntiere(prise, cible, largeur, hauteur);
    p = { ...prise, x: pose.x, y: pose.y, azimutDeg: pose.azimutDeg, inclinaisonDeg: pose.inclinaisonDeg };
  }
  const { renderer, scene, camera } = s;
  const taille = { l: renderer.domElement.width, h: renderer.domElement.height };
  const pixelRatio = renderer.getPixelRatio();
  const local = versLocalDepuis(s.cen)({ x: p.x, y: p.y });
  const cam = new THREE.PerspectiveCamera(champVertical(p.champDeg ?? CHAMP_DEFAUT_DEG, largeur, hauteur), largeur / hauteur, camera.near, camera.far);
  cam.position.set(local.x, HAUTEUR_PRISE_M, local.z);
  const c = ciblePrise(p, local);
  cam.lookAt(c.x, c.y, c.z);
  cam.updateProjectionMatrix();
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(largeur, hauteur, false);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
    return { base64: url.slice(url.indexOf(',') + 1), mediaType: 'image/jpeg', largeur, hauteur };
  } catch {
    return null;
  } finally {
    // L'ecran reprend sa taille et sa camera : le cliche ne doit pas rester visible.
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(taille.l / pixelRatio, taille.h / pixelRatio, false);
    renderer.render(scene, camera);
  }
}
