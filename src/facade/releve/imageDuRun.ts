// L'image que le run d'une facade de l'audit envoie a Claude (MD/spec-facade-calage-audit.md §8 ; lot F7, decision du proprietaire du
// 29 octobre 2026 : « fais-le dans F7 et utilise les formes pour completer les decisions »). Jusqu'ici, le mur seul, coupe a l'egout
// (le releve) : Claude n'y voyait ni pignon, ni cheminee, ni lucarne, et l'audit ne lui donnait aucune forme a lire (F4, interpretation
// 5). Desormais, la photo qui porte le releve, redressee dans le plan du mur par ses quatre coins (la meme homographie que la texture,
// prolongee vers le haut), du sol jusqu'au haut de la facade (le gabarit, et le faitage des corps qui la portent : une souche le
// depasse), avec une marge. La texture du releve ne sert pas : au-dessus de l'egout, son ciel est repeint de la teinte du mur.
// Ce qu'aucune photo ne montre est peint en gris, comme le prompt le dit. Le moteur d'image n'est pas touche (decision 16) : on
// appelle `redresser` tel quel. Pur.

import { appliquer, homographie, redresser, resolutionTexture, type Image } from '../vision/homographie.js';
import type { Morceau } from './serie.js';

/** Au-dessus du point haut de la facade (une pointe, un faitage), de quoi voir une souche entiere : elle depasse le faitage de 40 cm. */
const MARGE_HAUT_M = 1;
/** La bande ne monte pas au-dela de tant de fois la hauteur du mur : une photo n'en montre pas plus, et l'image garderait du vide. */
const BANDE_MAX = 2;

/** L'image du run, en JPEG, sa taille, et la place de l'egout (en part de sa hauteur, depuis le bas) que le texte du run dit a Claude. */
export interface ImageDuRun { image: string; largeur: number; hauteur: number; egoutPart: number }

/**
 * La hauteur (m, depuis le sol) jusqu'ou l'image du run montre la facade : le haut du gabarit (`hautV`, en hauteurs d'egout) ou le
 * faitage le plus haut des corps (`faitageM`), plus une marge ; au plus BANDE_MAX hauteurs de mur au-dessus de l'egout.
 */
export function hautDeLImage(hauteurM: number, hautV: number, faitageM: number | null): number {
  const haut = Math.max(hauteurM * Math.max(1, hautV), faitageM ?? 0) + MARGE_HAUT_M;
  return Math.min(haut, hauteurM * (1 + BANDE_MAX));
}

/**
 * La photo d'un morceau redressee dans le plan du mur, du sol a `hautM` (le mur de `largeurM` x `hauteurM`, puis la bande au-dessus de
 * l'egout), ce qu'elle ne montre pas peint en gris, encodee par `jpeg`. Null quand les coins ne font pas un mur.
 */
export function imageDuRunAvecLaBande(m: Morceau, largeurM: number, hauteurM: number, hautM: number, jpeg: (img: Image) => string): ImageDuRun | null {
  const versPhoto = homographie([{ x: 0, y: 0 }, { x: largeurM, y: 0 }, { x: largeurM, y: hauteurM }, { x: 0, y: hauteurM }], m.coins);
  if (!versPhoto || !(largeurM > 0) || !(hauteurM > 0)) return null;
  const E = Math.max(0, hautM - hauteurM);
  const etendus = [{ x: 0, y: -E }, { x: largeurM, y: -E }, { x: largeurM, y: hauteurM }, { x: 0, y: hauteurM }].map((q) => appliquer(versPhoto, q));
  const r = redresser(m.prise.photo.image, etendus, largeurM, hauteurM + E, resolutionTexture(largeurM, hauteurM + E));
  if (!r) return null;
  const d = new Uint8ClampedArray(r.image.donnees);
  r.vu.forEach((v, i) => { if (!v) { d[i * 4] = 128; d[i * 4 + 1] = 128; d[i * 4 + 2] = 128; d[i * 4 + 3] = 255; } });
  const image: Image = { largeur: r.image.largeur, hauteur: r.image.hauteur, donnees: d };
  return { image: jpeg(image), largeur: image.largeur, hauteur: image.hauteur, egoutPart: Math.round((hauteurM / (hauteurM + E)) * 1000) / 1000 };
}
