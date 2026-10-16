// Le rendu du modele depuis la prise de vue d'une photo (MD/spec-regles-toits.md §14.1, lot L17) :
// la Vue 3D ouverte, vue par une camera posee la ou le telephone etait, avec son champ ; dessinee
// hors ecran a 1 024 px et rendue en JPEG. C'est l'image que Claude compare a la photo : « le modele,
// pas la realite ».
//
// Quand la facade visee est connue (`CibleFacadeRendu`), le rendu est son ELEVATION : la camera se
// pose sur la normale du mur, en son milieu, regarde droit vers lui (a l'horizontale) et recule
// jusqu'a ce que les quatre coins tiennent dans l'image. Elle est a mi-hauteur du mur, donc pas
// d'inclinaison ni de fuyantes : les verticales restent verticales, les ouvertures gardent leur
// forme, et c'est ce que Claude compare a la photo (demande de l'utilisateur du 16 octobre : les
// rendus precedents, pris depuis la position de la personne, montraient la facade de biais, de loin,
// sous les surimpressions de l'audit). Pendant l'image, la facade surlignee, le point GPS et le trait
// renforce de l'audit sont caches : ce sont des reperes d'ecran, pas le modele.
//
// La scene et son rendu sont ceux de la Vue 3D (le tampon est garde, `preserveDrawingBuffer`) : on
// change la taille du rendu et la camera le temps d'une image, puis on remet tout en place et on
// redessine la vue, pour que l'ecran ne garde pas le cliche.

import { vue3d } from './etat3d.js';
import { versLocalDepuis } from './primitives.js';
import { NOM_FACADE_DEVANT, NOM_FACADES_FAITES } from './facadeDevant3d.js';
import { NOM_POSITION_GPS } from './positionGps3d.js';
import { NOM_TRAIT_DE_PRES } from './traitDePres.js';

/** Le telephone tenu a hauteur des yeux (render/couleurPhotoAudit.ts fait de meme). */
export const HAUTEUR_PRISE_M = 1.5;
/** Le champ horizontal d'un telephone en grand-angle normal, quand l'EXIF ne le donne pas (facade/cadrage.ts). */
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

/** La camera posee par `poseFacadeEntiere`: sa position (repere du plan), sa hauteur au-dessus du pied du mur, son cap. */
export interface PoseFacadeEntiere {
  x: number;
  y: number;
  /** Mi-hauteur du mur, au-dessus de son pied : la camera regarde droit devant, sans inclinaison. */
  hauteurM: number;
  azimutDeg: number;
  /** Toujours 0 : la vue est perpendiculaire au mur. */
  inclinaisonDeg: number;
  /** La distance de la camera au mur, en metres, mesuree sur sa normale. */
  reculM: number;
  /** Les quatre coins tiennent dans l'image (sinon c'est la distance maximale). */
  entiere: boolean;
}

/** Un peu d'air autour de la facade : elle occupe au plus cette part de l'image, dans chaque sens. */
export const PART_IMAGE_FACADE = 0.92;
/** On ne recule pas plus loin : au-dela la facade n'a plus de detail. */
export const RECUL_MAX_M = 45;
/** Le toit deborde et les gouttieres sortent du mur : la distance compte cela de plus, vers la camera. */
const SAILLIE_M = 0.6;
/** Plus pres, le rendu n'aurait plus rien d'un cliche de facade. */
const RECUL_MIN_M = 2;

/**
 * La pose qui montre la facade en elevation (voir l'en-tete) : sur la normale sortante du mur, en son
 * milieu, a la distance ou la plus contraignante de la largeur et de la hauteur remplit
 * PART_IMAGE_FACADE de l'image. Ne depend ni de la position ni du capteur de la photo : la meme
 * facade donne toujours la meme image.
 */
export function poseFacadeEntiere(cible: CibleFacadeRendu, champDeg: number = CHAMP_DEFAUT_DEG, largeur = LARGEUR_RENDU_PX, hauteur = HAUTEUR_RENDU_PX): PoseFacadeEntiere {
  const ux = cible.droite.x - cible.gauche.x, uy = cible.droite.y - cible.gauche.y;
  const l = Math.hypot(ux, uy) || 1;
  // La normale sortante : de dehors, la facade se lit de gauche a droite (facade/geometrie.ts).
  const n = { x: uy / l, y: -ux / l };
  const milieu = { x: (cible.gauche.x + cible.droite.x) / 2, y: (cible.gauche.y + cible.droite.y) / 2 };
  const tanH = Math.tan(rad(champDeg) / 2) * PART_IMAGE_FACADE;
  const tanV = Math.tan(rad(champVertical(champDeg, largeur, hauteur)) / 2) * PART_IMAGE_FACADE;
  const besoin = Math.max(l / 2 / tanH, cible.hautM / 2 / tanV) + SAILLIE_M;
  const recul = Math.min(RECUL_MAX_M, Math.max(RECUL_MIN_M, besoin));
  return {
    x: milieu.x + n.x * recul, y: milieu.y + n.y * recul,
    hauteurM: cible.hautM / 2,
    azimutDeg: ((Math.atan2(-n.x, -n.y) * 180) / Math.PI + 360) % 360,
    inclinaisonDeg: 0, reculM: recul, entiere: besoin <= RECUL_MAX_M,
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
  // La facade visee en elevation, ou la prise telle quelle (photo du toit, ou facade inconnue).
  let p = prise;
  let hauteurCam = HAUTEUR_PRISE_M;
  if (cible) {
    const pose = poseFacadeEntiere(cible, prise.champDeg ?? CHAMP_DEFAUT_DEG, largeur, hauteur);
    p = { ...prise, x: pose.x, y: pose.y, azimutDeg: pose.azimutDeg, inclinaisonDeg: pose.inclinaisonDeg };
    // Mi-hauteur du mur, au-dessus de son pied : sur un sol en relief, le pied n'est pas a zero.
    const milieu = { x: (cible.gauche.x + cible.droite.x) / 2, y: (cible.gauche.y + cible.droite.y) / 2 };
    hauteurCam = (s.hauteurSol?.(milieu) ?? 0) + pose.hauteurM;
  }
  const { renderer, scene, camera } = s;
  const taille = { l: renderer.domElement.width, h: renderer.domElement.height };
  const pixelRatio = renderer.getPixelRatio();
  const local = versLocalDepuis(s.cen)({ x: p.x, y: p.y });
  const cam = new THREE.PerspectiveCamera(champVertical(p.champDeg ?? CHAMP_DEFAUT_DEG, largeur, hauteur), largeur / hauteur, camera.near, camera.far);
  cam.position.set(local.x, hauteurCam, local.z);
  const c = ciblePrise(p, local);
  cam.lookAt(c.x, hauteurCam + (c.y - HAUTEUR_PRISE_M), c.z);
  cam.updateProjectionMatrix();
  // Les reperes de l'audit (facade surlignee, point GPS, trait renforce) ne sont pas le modele.
  const reperes = [NOM_FACADE_DEVANT, NOM_FACADES_FAITES, NOM_POSITION_GPS, NOM_TRAIT_DE_PRES]
    .map((nom) => scene.getObjectByName(nom)).filter((o): o is NonNullable<typeof o> => !!o && o.visible);
  for (const o of reperes) o.visible = false;
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(largeur, hauteur, false);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
    return { base64: url.slice(url.indexOf(',') + 1), mediaType: 'image/jpeg', largeur, hauteur };
  } catch {
    return null;
  } finally {
    for (const o of reperes) o.visible = true;
    // L'ecran reprend sa taille et sa camera : le cliche ne doit pas rester visible.
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(taille.l / pixelRatio, taille.h / pixelRatio, false);
    renderer.render(scene, camera);
  }
}
