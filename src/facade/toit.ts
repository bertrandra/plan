// Forme du toit d'un batiment (MD/spec-releve-facade.md §8).
//
// Un toit simple est l'enveloppe basse de quelques plans : deux pans, c'est le plus bas de deux
// plans qui montent du bord vers le faitage ; quatre pans, le plus bas de quatre ; un appentis, un
// seul plan incline ; un toit plat, le plan de l'egout. Decrire le toit ainsi le rend valable sur
// n'importe quel contour, pas seulement sur un rectangle : chaque pan est le morceau du contour ou
// son plan est le plus bas, et les pignons sont les murs sous lesquels la hauteur du toit n'est pas
// nulle.
//
// Le repere est celui du faitage : `u` le long du faitage, `v` en travers. Les etendues du contour
// sur ces deux axes donnent la demi-largeur (du bord au faitage) et la demi-longueur.

import { au } from '../util/tableaux.js';
import { sommetDe } from '../geometry/anneau.js';
import type { PtBrut, Toit, FormeToit } from '../model/types.js';
import { signedArea } from '../geometry/basic.js';

export type { Toit, FormeToit };

/** Couleur par defaut d'une couverture : tuile terre cuite. */
export const COULEUR_TOIT_DEFAUT = '#9a5b44';

export const LIBELLES_FORME_TOIT: Record<FormeToit, string> = {
  plat: 'Toit plat',
  appentis: 'Appentis (un pan)',
  'deux-pans': 'Deux pans',
  'quatre-pans': 'Quatre pans',
};

/** Un plan de toit : z = a x + b y + c, en metres au-dessus de l'egout. */
export interface PlanToit {
  a: number;
  b: number;
  c: number;
}

export interface P3 {
  x: number;
  y: number;
  z: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Angle du plus long cote du contour, en degres : le faitage par defaut le suit. */
export function angleDuPlusLongCote(pts: readonly PtBrut[]): number {
  let best = 0,
    ang = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = au(pts, i),
      b = sommetDe(pts, i + 1);
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > best) {
      best = l;
      ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
  }
  return ((ang % 180) + 180) % 180;
}

/** Le repere du faitage : origine au centre des etendues, demi-longueur `hl` et demi-largeur `hw`. */
export function repereFaitage(pts: readonly PtBrut[], angleFaitage: number) {
  const ux = Math.cos(rad(angleFaitage)),
    uy = Math.sin(rad(angleFaitage));
  const vx = -uy,
    vy = ux;
  let umin = Infinity,
    umax = -Infinity,
    vmin = Infinity,
    vmax = -Infinity;
  for (const p of pts) {
    const u = p.x * ux + p.y * uy,
      v = p.x * vx + p.y * vy;
    umin = Math.min(umin, u);
    umax = Math.max(umax, u);
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
  }
  return { ux, uy, vx, vy, u0: (umin + umax) / 2, v0: (vmin + vmax) / 2, hl: (umax - umin) / 2, hw: (vmax - vmin) / 2 };
}

/** Pente d'un toit, en degres, pour affichage. */
export function penteDeg(pts: readonly PtBrut[], toit: Toit): number {
  if (toit.forme === 'plat' || toit.hauteur <= 0) return 0;
  const r = repereFaitage(pts, toit.angleFaitage);
  const course = toit.forme === 'appentis' ? 2 * r.hw : r.hw;
  return course > 0 ? (Math.atan(toit.hauteur / course) * 180) / Math.PI : 0;
}

/**
 * Les plans du toit. Un plan `z = s (k - (v - v0))` s'ecrit `a x + b y + c` en developpant
 * `v = x vx + y vy`.
 */
export function plansDuToit(pts: readonly PtBrut[], toit: Toit): PlanToit[] {
  const H = Math.max(0, toit.hauteur);
  if (toit.forme === 'plat' || H === 0) return [{ a: 0, b: 0, c: 0 }];
  const r = repereFaitage(pts, toit.angleFaitage);
  if (r.hw <= 0) return [{ a: 0, b: 0, c: 0 }];
  // z = s * (k + signe * (w - w0)) ou w = x wx + y wy
  const plan = (s: number, k: number, signe: number, wx: number, wy: number, w0: number): PlanToit => ({
    a: s * signe * wx,
    b: s * signe * wy,
    c: s * (k - signe * w0),
  });
  if (toit.forme === 'appentis') {
    // Monte de v = v0 - hw (egout bas, z = 0) a v = v0 + hw (z = H).
    const s = H / (2 * r.hw);
    return [plan(s, r.hw, 1, r.vx, r.vy, r.v0)];
  }
  const s = H / r.hw;
  const pans = [plan(s, r.hw, -1, r.vx, r.vy, r.v0), plan(s, r.hw, 1, r.vx, r.vy, r.v0)];
  if (toit.forme === 'deux-pans') return pans;
  // Quatre pans : les croupes ont la meme pente que les longs pans. Si le batiment est plus large que
  // long, le "faitage" se reduit a un point, ce qui reste un toit valable (en pavillon).
  return [...pans, plan(s, r.hl, -1, r.ux, r.uy, r.u0), plan(s, r.hl, 1, r.ux, r.uy, r.u0)];
}

const zDe = (p: PlanToit, q: PtBrut) => p.a * q.x + p.b * q.y + p.c;

/** Hauteur du toit au-dessus de l'egout en un point du plan : l'enveloppe basse, jamais negative. */
export function hauteurToitEn(plans: readonly PlanToit[], q: PtBrut): number {
  let z = Infinity;
  for (const p of plans) z = Math.min(z, zDe(p, q));
  return Math.max(0, z);
}

/** Coupe un polygone (convexe ou non) par le demi-plan f(p) <= 0, avec f affine. */
function couperDemiPlan(poly: PtBrut[], f: (p: PtBrut) => number): PtBrut[] {
  const out: PtBrut[] = [];
  for (let i = 0; i < poly.length; i++) {
    const P = au(poly, i),
      Q = sommetDe(poly, i + 1);
    const fp = f(P),
      fq = f(Q);
    if (fp <= 1e-9) out.push(P);
    if ((fp <= 1e-9) !== (fq <= 1e-9)) {
      const t = fp / (fp - fq);
      out.push({ x: P.x + t * (Q.x - P.x), y: P.y + t * (Q.y - P.y) });
    }
  }
  return out;
}

/** Triangulation par oreilles d'un polygone simple ; renvoie des triplets d'indices. */
export function trianguler(poly: readonly PtBrut[]): [number, number, number][] {
  const n = poly.length;
  if (n < 3) return [];
  const idx = poly.map((_, i) => i);
  if (signedArea(poly) < 0) idx.reverse();
  const croix = (a: PtBrut, b: PtBrut, c: PtBrut) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const dedans = (p: PtBrut, a: PtBrut, b: PtBrut, c: PtBrut) => croix(a, b, p) >= -1e-12 && croix(b, c, p) >= -1e-12 && croix(c, a, p) >= -1e-12;
  const res: [number, number, number][] = [];
  let garde = 0;
  while (idx.length > 3 && garde++ < 10000) {
    let coupe = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = sommetDe(idx, k - 1),
        i1 = au(idx, k),
        i2 = sommetDe(idx, k + 1);
      const a = au(poly, i0),
        b = au(poly, i1),
        c = au(poly, i2);
      if (croix(a, b, c) <= 1e-12) continue;
      let vide = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (dedans(au(poly, j), a, b, c)) {
          vide = false;
          break;
        }
      }
      if (!vide) continue;
      res.push([i0, i1, i2]);
      idx.splice(k, 1);
      coupe = true;
      break;
    }
    // Polygone degenere (points alignes) : on retire un sommet plat plutot que de boucler.
    if (!coupe) idx.splice(0, 1);
  }
  if (idx.length === 3) res.push([au(idx, 0), au(idx, 1), au(idx, 2)]);
  return res;
}

/** Un pan de toit : son contour en 3D (z au-dessus de l'egout) et ses triangles. */
export interface Pan {
  contour: P3[];
  triangles: [number, number, number][];
}

/** Le profil haut d'un mur sous le toit : points (d, z), d en metres depuis `pts[cote]`. */
export interface Pignon {
  cote: number;
  profil: { d: number; z: number }[];
}

/** Les pans et les pignons d'un toit pose sur un contour. */
export function facettesToit(pts: readonly PtBrut[], toit: Toit): { pans: Pan[]; pignons: Pignon[] } {
  const plans = plansDuToit(pts, toit);
  const pans: Pan[] = [];
  plans.forEach((p, k) => {
    let poly: PtBrut[] = pts.map((q) => ({ x: q.x, y: q.y }));
    plans.forEach((autre, j) => {
      if (j === k || poly.length < 3) return;
      // Le pan k occupe la ou son plan est le plus bas : z_k - z_j <= 0.
      poly = couperDemiPlan(poly, (q) => zDe(p, q) - zDe(autre, q));
    });
    // Nettoyage : points confondus consecutifs.
    poly = poly.filter((q, i) => {
      const r = sommetDe(poly, i + 1);
      return Math.hypot(q.x - r.x, q.y - r.y) > 1e-6;
    });
    if (poly.length < 3 || Math.abs(signedArea(poly)) < 1e-6) return;
    pans.push({ contour: poly.map((q) => ({ x: q.x, y: q.y, z: hauteurToitEn(plans, q) })), triangles: trianguler(poly) });
  });

  const pignons: Pignon[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = au(pts, i),
      b = sommetDe(pts, i + 1);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) continue;
    const at = (t: number) => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    // Les cassures du profil : la ou deux plans s'egalent le long du cote.
    const ts = new Set<number>([0, 1]);
    for (let j = 0; j < plans.length; j++) {
      for (let k = j + 1; k < plans.length; k++) {
        const g0 = zDe(au(plans, j), a) - zDe(au(plans, k), a),
          g1 = zDe(au(plans, j), b) - zDe(au(plans, k), b);
        if (Math.abs(g0 - g1) > 1e-12) {
          const t = g0 / (g0 - g1);
          if (t > 1e-6 && t < 1 - 1e-6) ts.add(t);
        }
      }
    }
    const profil = [...ts].sort((x, y) => x - y).map((t) => ({ d: t * L, z: hauteurToitEn(plans, at(t)) }));
    if (profil.some((q) => q.z > 0.01)) pignons.push({ cote: i, profil });
  }
  return { pans, pignons };
}

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
}

/**
 * Classe le profil de la silhouette au-dessus de l'egout : `profil[i]` est la hauteur, en metres,
 * du bati au-dessus de l'egout dans la colonne i de l'elevation (0 = ciel juste au-dessus du mur).
 *
 * Quatre modeles, ajustes par moindres carres : bande nulle (toit plat, ou acrotere), triangle
 * centre (pignon : deux pans, faitage perpendiculaire), bande constante (egout : deux pans vus du
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

  // Triangle : h(x) = H (1 - |2x - 1|), H par moindres carres.
  const tri = t.map((x) => 1 - Math.abs(2 * x - 1));
  const Htri = profil.reduce((s, v, i) => s + v * au(tri, i), 0) / tri.reduce((s, w) => s + w * w, 0);
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
    { forme: 'deux-pans', faitage: 'perpendiculaire', hauteur: Htri, ecart: eqm((x) => Htri * (1 - Math.abs(2 * x - 1))), cout: 0 },
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
  const { forme, faitage, hauteur, ecart } = au(candidats, 0);
  return { forme, faitage, hauteur, ecart };
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
