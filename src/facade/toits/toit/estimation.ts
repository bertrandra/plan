// Le toit estime depuis une photo : la silhouette au-dessus d une facade, le ciel, la fuite (MD/spec-releve-facade.md §8).
// Un morceau de facade/toits/toit.ts, qui le reexporte : le reste du programme importe depuis lui.

import { au } from '../../../util/tableaux.js';
import { sommetDe } from '../../../geometry/anneau.js';
import type { PtBrut, Toit, FormeToit } from '../../../model/types.js';
import { repereFaitage } from '../../../geometry/faitage.js';

/* ------------------------------------------------------------------------------------------------
 * Estimation depuis une photo
 * --------------------------------------------------------------------------------------------- */

/** Ce que la silhouette au-dessus d'une facade dit du toit. */
export interface ToitEstime {
  forme: FormeToit;
  /** Le faitage est-il parallele au mur photographie (vu de l'egout) ou perpendiculaire (pignon) ? */
  faitage: 'parallele' | 'perpendiculaire';
  /** Hauteur du faitage au-dessus de l'egout, en metres. */
  hauteur: number;
  /** Ecart quadratique moyen du modele retenu, en metres. */
  ecart: number;
  /** Un pignon : la position de son sommet le long du mur, de 0 a 1 (0,5 au milieu) ; absente, au milieu. */
  sommet?: number;
}

/**
 * Classe le profil de la silhouette au-dessus de l'egout : `profil[i]` est la hauteur, en metres,
 * du bati au-dessus de l'egout dans la colonne i de l'elevation (0 = ciel juste au-dessus du mur).
 *
 * Quatre modeles, ajustes par moindres carres : bande nulle (toit plat, ou acrotere), triangle
 * (pignon : deux pans, faitage perpendiculaire, sommet au centre ou decentre), bande constante (egout : deux pans vus du
 * long pan), trapeze (quatre pans vus du long pan), rampe (appentis). Le plus simple l'emporte a
 * erreur comparable.
 */
export function classerProfil(profil: readonly number[]): ToitEstime {
  const n = profil.length;
  const plat: ToitEstime = { forme: 'plat', faitage: 'parallele', hauteur: 0, ecart: 0 };
  if (n < 5) return plat;
  const hmax = Math.max(...profil);
  if (hmax < 0.3) return { ...plat, ecart: Math.sqrt(profil.reduce((s, v) => s + v * v, 0) / n) };
  const t = profil.map((_, i) => (i + 0.5) / n);
  const eqm = (f: (x: number) => number) => Math.sqrt(profil.reduce((s, v, i) => s + (v - f(au(t, i))) ** 2, 0) / n);

  // Triangle : sommet en s (0,5 = centre), h(x) = H x/s puis H (1-x)/(1-s), H par moindres carres. On balaye s : un pignon
  // decentre (pans de longueurs inegales) n'est pas un trapeze. Un sommet decentre coute un peu, le centre l'emporte a egalite.
  let meilleurTri = { e: Infinity, H: 0, s: 0.5 };
  for (let k = 0; k <= 12; k++) {
    const s = 0.2 + 0.05 * k;
    const w = t.map((x) => (x <= s ? x / s : (1 - x) / (1 - s)));
    const H = profil.reduce((q, v, i) => q + v * au(w, i), 0) / w.reduce((q, z) => q + z * z, 0);
    const e = Math.sqrt(profil.reduce((q, v, i) => q + (v - H * au(w, i)) ** 2, 0) / n) + (Math.abs(s - 0.5) > 0.01 ? 0.01 : 0);
    if (e < meilleurTri.e) meilleurTri = { e, H, s };
  }
  // Bande : la mediane, robuste aux cheminees.
  const Hband = au([...profil].sort((a, b) => a - b), Math.floor(n / 2));
  // Rampe : droite par moindres carres, dans un sens ou l'autre.
  const mx = t.reduce((s, x) => s + x, 0) / n,
    my = profil.reduce((s, v) => s + v, 0) / n;
  const pente = t.reduce((s, x, i) => s + (x - mx) * (au(profil, i) - my), 0) / t.reduce((s, x) => s + (x - mx) ** 2, 0);
  const ord = my - pente * mx;
  // Trapeze : monte sur une fraction r de chaque cote puis plateau. On balaye r.
  let meilleurTrap = { e: Infinity, H: 0 };
  for (let r = 0.1; r <= 0.45; r += 0.05) {
    const w = t.map((x) => Math.min(1, x / r, (1 - x) / r));
    const H = profil.reduce((s, v, i) => s + v * au(w, i), 0) / w.reduce((s, q) => s + q * q, 0);
    const e = Math.sqrt(profil.reduce((s, v, i) => s + (v - H * au(w, i)) ** 2, 0) / n);
    if (e < meilleurTrap.e) meilleurTrap = { e, H };
  }

  const candidats: (ToitEstime & { cout: number })[] = [
    { forme: 'deux-pans', faitage: 'perpendiculaire', hauteur: meilleurTri.H, ecart: meilleurTri.e, cout: 0, ...(Math.abs(meilleurTri.s - 0.5) > 0.01 ? { sommet: Math.round(meilleurTri.s * 100) / 100 } : {}) },
    { forme: 'deux-pans', faitage: 'parallele', hauteur: Hband, ecart: eqm(() => Hband), cout: 0 },
    { forme: 'quatre-pans', faitage: 'parallele', hauteur: meilleurTrap.H, ecart: meilleurTrap.e, cout: 0.02 },
    {
      forme: 'appentis',
      faitage: 'perpendiculaire',
      hauteur: Math.max(ord, ord + pente),
      ecart: eqm((x) => ord + pente * x),
      cout: Math.abs(pente) > 0.6 * hmax && Math.min(ord, ord + pente) < 0.35 * hmax ? 0 : 1,
    },
  ];
  candidats.forEach((c) => (c.cout += c.ecart));
  candidats.sort((a, b) => a.cout - b.cout);
  const { forme, faitage, hauteur, ecart, sommet } = au(candidats, 0);
  return { forme, faitage, hauteur, ecart, ...(sommet !== undefined ? { sommet } : {}) };
}

/**
 * Hauteur reelle du faitage vu depuis l'egout. Un toit dont le faitage est parallele au mur fuit :
 * vu d'en bas, a `distance` metres du mur, son faitage (a `profondeur` metres derriere le mur) se
 * projette plus bas qu'il n'est. `bande` est la hauteur apparente au-dessus de l'egout, sur le plan
 * du mur. `oeil` est la hauteur de l'objectif.
 */
export function corrigerFuite(bande: number, hauteurMur: number, distance: number, profondeur: number, oeil = 1.5): number {
  if (!(distance > 0) || !(profondeur > 0)) return bande;
  const vraie = ((hauteurMur + bande - oeil) * (distance + profondeur)) / distance - hauteurMur + oeil;
  return Math.max(bande, vraie);
}

/**
 * Le toit du batiment, deduit de l'estimation faite sur la facade `cote` : le faitage parallele au
 * mur prend l'angle de ce mur, perpendiculaire l'angle plus 90 degres.
 */
export function toitDepuisEstimation(pts: readonly PtBrut[], cote: number, e: ToitEstime, hauteurMur: number, distance: number | null): Toit {
  const a = au(pts, cote),
    b = sommetDe(pts, cote + 1);
  const angleMur = (((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 180 + 180) % 180;
  const angleFaitage = e.faitage === 'parallele' ? angleMur : (angleMur + 90) % 180;
  let hauteur = e.hauteur;
  if (e.faitage === 'parallele' && e.forme !== 'plat' && distance) {
    const r = repereFaitage(pts, angleFaitage);
    hauteur = corrigerFuite(e.hauteur, hauteurMur, distance, r.hw);
  }
  return { forme: e.forme, hauteur: Math.round(hauteur * 100) / 100, angleFaitage, source: 'photo' };
}

/**
 * Silhouette du bati au-dessus de l'egout, sur une elevation redressee etendue vers le haut
 * (`img` : la bande au-dessus du mur, l'egout en bas). Un pixel est du ciel s'il ressemble au haut
 * de l'image quand celui-ci a l'air d'un ciel, ou s'il est tres clair et peu sature.
 */
type ImageBrute = { largeur: number; hauteur: number; donnees: Uint8ClampedArray };

/**
 * Le test « ce pixel est-il du ciel ? » pour une bande au-dessus de l'egout. Un pixel est du ciel
 * s'il ressemble au haut de l'image quand celui-ci a l'air d'un ciel, ou s'il est tres clair et peu
 * sature, ou franchement bleu. Ce que la photo n'a pas vu compte comme du ciel : mieux vaut
 * sous-estimer un faitage coupe par le cadre que prendre le remplissage uni pour une toiture.
 */
export function testeurCiel(img: ImageBrute, vu: Uint8Array | null = null): (x: number, y: number) => boolean {
  const { largeur: L, hauteur: H, donnees: d } = img;
  const px = (x: number, y: number) => {
    const o = (y * L + x) * 4;
    return [(d[o] ?? 0), (d[o + 1] ?? 0), (d[o + 2] ?? 0)] as const;
  };
  const ech: number[][] = [[], [], []];
  for (let y = 0; y < Math.min(3, H); y++)
    for (let x = 0; x < L; x++) {
      if (vu && !vu[y * L + x]) continue;
      const c = px(x, y);
      for (let k = 0; k < 3; k++) au(ech, k).push(au(c, k));
    }
  const med = ech.map((v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0);
  const lum = (c: readonly number[]) => 0.299 * au(c, 0) + 0.587 * au(c, 1) + 0.114 * au(c, 2);
  const refCiel = lum(med) > 110 && au(med, 2) >= au(med, 0) - 12;
  return (x, y) => {
    if (vu && !vu[y * L + x]) return true;
    const c = px(x, y);
    const sat = Math.max(...c) - Math.min(...c);
    if (lum(c) > 200 && sat < 40) return true;
    if (au(c, 2) > au(c, 0) + 15 && lum(c) > 120) return true;
    return refCiel && Math.hypot(au(c, 0) - au(med, 0), au(c, 1) - au(med, 1), au(c, 2) - au(med, 2)) < 30;
  };
}

/**
 * Repeint le ciel des `lignes` premieres lignes d'une texture a la teinte du mur. La 3D plaque cette
 * bande sur le pignon ; si le pignon modelise deborde de celui de la photo (faitage decentre sur un
 * contour irregulier, pente corrigee a la main), il montre du mur, pas un morceau de ciel.
 */
export function effacerCiel(img: ImageBrute, lignes: number, teinte: readonly number[], vu: Uint8Array | null = null): void {
  const bande = { largeur: img.largeur, hauteur: lignes, donnees: img.donnees.subarray(0, lignes * img.largeur * 4) };
  const ciel = testeurCiel(bande, vu ? vu.subarray(0, lignes * img.largeur) : null);
  for (let y = 0; y < lignes; y++)
    for (let x = 0; x < img.largeur; x++) {
      if (!ciel(x, y)) continue;
      const o = (y * img.largeur + x) * 4;
      img.donnees[o] = au(teinte, 0);
      img.donnees[o + 1] = au(teinte, 1);
      img.donnees[o + 2] = au(teinte, 2);
    }
}

export function profilSilhouette(img: ImageBrute, pxParM: number, colonnes = 60, vu: Uint8Array | null = null): number[] {
  const { largeur: L, hauteur: H } = img;
  const ciel = testeurCiel(img, vu);
  const res: number[] = [];
  const pas = L / colonnes;
  for (let k = 0; k < colonnes; k++) {
    const x0 = Math.floor(k * pas),
      x1 = Math.max(x0 + 1, Math.floor((k + 1) * pas));
    // Pour chaque ligne, la colonne est "batie" si la majorite de ses pixels ne sont pas du ciel.
    let haut = H;
    let suite = 0;
    for (let y = 0; y < H; y++) {
      let bati = 0;
      for (let x = x0; x < x1; x++) if (!ciel(x, y)) bati++;
      if (bati * 2 > x1 - x0) {
        suite++;
        if (suite >= 3) {
          haut = y - 2;
          break;
        }
      } else suite = 0;
    }
    res.push((H - haut) / pxParM);
  }
  // Filtre median sur 5 colonnes : une antenne ou une branche ne fait pas un faitage.
  return res.map((_, i) => {
    const v = res.slice(Math.max(0, i - 2), i + 3).sort((a, b) => a - b);
    return au(v, Math.floor(v.length / 2));
  });
}
