// Le recalage de plusieurs photos d'une meme facade, par points d'interet (MD/spec-facades-calage-detection.md §8).
//
// Chaque photo est redressee par ses propres coins dans l'elevation du mur (largeur du plan, hauteur mesuree, bande au-dessus
// de l'egout), avec le masque des pixels reellement vus. Des coins poses a quelques decimetres pres decalent les elevations les
// unes des autres ; ce module trouve ce decalage et dit quelles photos se recalent :
//
// 1. **Les points communs.** ORB (facade/vision/orb.ts) sur chaque elevation, limite aux pixels vus, puis appariement de chaque paire,
//    borne a la portee d'un decalage plausible.
// 2. **Le recalage.** RANSAC (facade/vision/ransac.ts) cherche la similitude qui explique le plus de correspondances. Une facade repete
//    ses fenetres : un decalage d'une travee aligne beaucoup de points a tort. La similitude trouvee est donc **verifiee sur les
//    pixels** : on la compare au recalage nul (les coins sont le plus souvent justes) par la correlation de la partie commune, et
//    on garde le meilleur.
// 3. **Les criteres.** Une paire n'est acceptee que si elle tient tous les criteres de `CRITERES_FUSION` (points communs,
//    echelle, rotation, erreur, decalage, ressemblance) ; sinon le motif est dit.
// 4. **Le plus grand groupe.** Les paires acceptees relient les photos en groupes ; le plus grand est recale (fusion partielle),
//    les autres photos restent independantes. **Aucune photo n'est jamais supprimee** : une photo hors du groupe garde son motif
//    et reste utilisable seule.
//
// La composition (la meilleure vue, la mediane, les occlusions) est dans facade/fusion.ts. Pas de navigateur ici ; le calcul est
// deterministe (graine fixe de RANSAC).

import { au } from '../../util/tableaux.js';
import type { Image } from './homographie.js';
import { detecterOrb, apparier, type DescripteurOrb } from './orb.js';
import { ransacSimilitude, appliquerSimilitude, composer, inverse, echelleDe, rotationDeg, IDENTITE, type Paire, type Similitude } from './ransac.js';

/**
 * Quand une paire de photos est acceptee. Les photos sont redressees a la meme echelle : la similitude qui les recale est
 * proche d'une translation. Un recalage qui s'en eloigne n'est pas un recalage, c'est un faux appariement.
 */
export const CRITERES_FUSION = {
  /** Le moins de correspondances retenues par RANSAC (inliers) pour croire a un recouvrement reel. */
  POINTS_COMMUNS_MIN: 10,
  /** Les inliers doivent etre au moins cette part des correspondances : en deca, RANSAC a trouve un alignement par hasard dans du bruit. */
  PART_INLIERS_MIN: 0.2,
  /** L'echelle du recalage entre deux elevations a la meme resolution : de 0,85 a 1,18 (resolutions de source differentes, coins un peu faux). */
  ECHELLE_MIN: 0.85,
  ECHELLE_MAX: 1.18,
  /** La rotation maximale du recalage, en degres : des verticales redressees a 0,5 pres ne tournent pas de plus de quelques degres l'une par rapport a l'autre. */
  ROTATION_MAX_DEG: 3,
  /** L'erreur quadratique moyenne des inliers apres recalage, en pixels de l'elevation. */
  ERREUR_MAX_PX: 3.5,
  /** Le decalage maximal entre deux elevations, en metres : des coins predits par les capteurs peuvent etre faux d'un metre et demi, pas de plus. */
  DEPLACEMENT_MAX_M: 2,
  /** Le seuil de RANSAC : un inlier est a moins de ce nombre de pixels de son homologue. */
  SEUIL_INLIER_PX: 4,
  /** La correlation minimale de la partie commune apres recalage (de -1 a 1) : en deca, les deux photos ne montrent pas la meme chose a cet endroit. */
  RESSEMBLANCE_MIN: 0.3,
  /** Le moins d'echantillons communs pour que la correlation compte (une partie commune plus petite ne dit rien). */
  ECHANTILLONS_MIN: 300,
} as const;

export type MotifRefus = 'peu-de-points' | 'peu-d-inliers' | 'echelle' | 'rotation' | 'erreur' | 'deplacement' | 'ressemblance' | 'illisible';

export const TEXTES_MOTIF: Record<MotifRefus, string> = {
  'peu-de-points': 'trop peu de points communs',
  'peu-d-inliers': 'les points communs ne s’accordent pas sur un même recalage',
  echelle: 'les échelles des deux photos ne concordent pas',
  rotation: 'les deux photos tournent trop l’une par rapport à l’autre',
  erreur: 'l’erreur de recalage dépasse le seuil',
  deplacement: 'le décalage entre les deux photos est trop grand pour des coins posés à quelques décimètres près',
  ressemblance: 'les deux photos ne se ressemblent pas sur leur partie commune',
  illisible: 'une des photos ne se redresse pas',
};

/** Ce que le recalage dit d'une paire de photos. */
export interface BilanPaire {
  a: number;
  b: number;
  /** Les correspondances apres le test du rapport et la verification croisee. */
  appariements: number;
  /** Celles que le recalage explique. */
  inliers: number;
  echelle: number;
  rotationDeg: number;
  /** L'ecart quadratique moyen des inliers apres recalage, en pixels. */
  erreurPx: number;
  /** La correlation de la partie commune apres recalage, de -1 a 1 ; `null` quand elle est trop petite pour en juger. */
  ressemblance: number | null;
  /** Le recalage retenu est le recalage nul : les points communs confirment le recouvrement, les coins etaient justes. */
  recalageNul: boolean;
  accepte: boolean;
  motif: MotifRefus | null;
}

/** Une elevation redressee : l'image, le masque des pixels vus. */
export interface ElevationRecalee {
  image: Image;
  vu: Uint8Array;
}

/** `seule` : une seule photo ; `fusionnee` : toutes ; `partielle` : un groupe et des independantes ; `independantes` : aucune paire acceptee. */
export type StatutFusion = 'seule' | 'fusionnee' | 'partielle' | 'independantes';

/* ------------------------------------------------------------------------------------------------
 * La ressemblance de la partie commune
 * --------------------------------------------------------------------------------------------- */

const luminance = (img: Image, i: number): number => 0.299 * (img.donnees[i * 4] ?? 0) + 0.587 * (img.donnees[i * 4 + 1] ?? 0) + 0.114 * (img.donnees[i * 4 + 2] ?? 0);

/**
 * La correlation normalisee de A(x, y) et B(modele(x, y)) sur les pixels vus des deux, une ligne et une colonne sur `pas`, a partir de
 * la ligne `depuis` (le mur, sans la bande du toit). `n` : combien d'echantillons communs.
 */
export function ressemblance(A: ElevationRecalee, B: ElevationRecalee, modele: Similitude, depuis: number, pas = 3): { correlation: number; n: number } {
  const { largeur: LA, hauteur: HA } = A.image, { largeur: LB, hauteur: HB } = B.image;
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = depuis; y < HA; y += pas) {
    for (let x = 0; x < LA; x += pas) {
      const ia = y * LA + x;
      if (!A.vu[ia]) continue;
      const p = appliquerSimilitude(modele, { x, y });
      const xb = Math.round(p.x), yb = Math.round(p.y);
      if (xb < 0 || yb < 0 || xb >= LB || yb >= HB) continue;
      const ib = yb * LB + xb;
      if (!B.vu[ib]) continue;
      const a = luminance(A.image, ia), b = luminance(B.image, ib);
      n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    }
  }
  if (n < 2) return { correlation: -1, n };
  const cov = sab - (sa * sb) / n, va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n;
  return { correlation: va > 1e-9 && vb > 1e-9 ? cov / Math.sqrt(va * vb) : -1, n };
}

/**
 * L'affinage du recalage : RANSAC place les deux elevations au pixel pres, ce qui suffit pour dire qu'elles se recalent mais pas pour
 * comparer pixel a pixel (les occlusions de la fusion). On cherche, autour de la similitude, la translation de `plage` pixels au plus
 * qui donne la meilleure correlation de la partie commune. La similitude n'est changee que si le gain depasse `GAIN_AFFINAGE`.
 */
export const PLAGE_AFFINAGE_PX = 3;
const GAIN_AFFINAGE = 0.003;
function affiner(A: ElevationRecalee, B: ElevationRecalee, modele: Similitude, depuis: number): Similitude {
  let meilleur = modele, score = ressemblance(A, B, modele, depuis, 2).correlation;
  for (let dy = -PLAGE_AFFINAGE_PX; dy <= PLAGE_AFFINAGE_PX; dy++) {
    for (let dx = -PLAGE_AFFINAGE_PX; dx <= PLAGE_AFFINAGE_PX; dx++) {
      if (!dx && !dy) continue;
      const m = { ...modele, tx: modele.tx + dx, ty: modele.ty + dy };
      const c = ressemblance(A, B, m, depuis, 2).correlation;
      if (c > score + GAIN_AFFINAGE) { score = c; meilleur = m; }
    }
  }
  return meilleur;
}

/* ------------------------------------------------------------------------------------------------
 * Une paire
 * --------------------------------------------------------------------------------------------- */

/**
 * Recale la photo `b` sur la photo `a` (une similitude de a vers b, en pixels de l'elevation) et dit si la paire est acceptee. Quand
 * les elevations sont fournies, la similitude de RANSAC est verifiee sur les pixels contre le recalage nul, et la meilleure est gardee.
 */
export function recalerPaire(a: number, b: number, pa: readonly DescripteurOrb[], pb: readonly DescripteurOrb[], pxParM: number, elevations?: { a: ElevationRecalee; b: ElevationRecalee; egout: number }): { bilan: BilanPaire; modele: Similitude | null } {
  const C = CRITERES_FUSION;
  const base: BilanPaire = { a, b, appariements: 0, inliers: 0, echelle: 1, rotationDeg: 0, erreurPx: 0, ressemblance: null, recalageNul: false, accepte: false, motif: null };
  const refus = (motif: MotifRefus, extra: Partial<BilanPaire> = {}) => ({ bilan: { ...base, motif, ...extra }, modele: null as Similitude | null });
  const m = apparier(pa, pb, { portee: C.DEPLACEMENT_MAX_M * pxParM });
  if (m.length < C.POINTS_COMMUNS_MIN) return refus('peu-de-points', { appariements: m.length });
  const paires: Paire[] = m.map(({ i, j }) => ({ de: { x: au(pa, i).x, y: au(pa, i).y }, vers: { x: au(pb, j).x, y: au(pb, j).y } }));
  const r = ransacSimilitude(paires, { seuilPx: C.SEUIL_INLIER_PX });
  if (!r) return refus('peu-d-inliers', { appariements: m.length });
  let modele = r.modele;
  let recalageNul = false;
  let corr: number | null = null;
  if (elevations) {
    // La similitude de RANSAC contre le recalage nul : la partie commune doit ressembler au moins autant avec la premiere.
    const ra = ressemblance(elevations.a, elevations.b, r.modele, elevations.egout);
    const r0 = ressemblance(elevations.a, elevations.b, IDENTITE, elevations.egout);
    const juge = ra.n >= C.ECHANTILLONS_MIN || r0.n >= C.ECHANTILLONS_MIN;
    if (juge && r0.n >= C.ECHANTILLONS_MIN && (ra.n < C.ECHANTILLONS_MIN || r0.correlation >= ra.correlation)) {
      // Les coins etaient justes : le recalage nul explique mieux la partie commune que le decalage que les points proposent.
      modele = IDENTITE;
      recalageNul = true;
      corr = r0.correlation;
    } else if (ra.n >= C.ECHANTILLONS_MIN) corr = ra.correlation;
    // Le recalage nul lui-meme, ou celui de RANSAC, est affine au pixel pres sur la partie commune.
    if (juge) {
      modele = affiner(elevations.a, elevations.b, modele, elevations.egout);
      recalageNul = recalageNul && modele.tx === 0 && modele.ty === 0;
    }
  }
  const echelle = echelleDe(modele), rot = rotationDeg(modele);
  const bilan: BilanPaire = {
    ...base, appariements: m.length, inliers: r.inliers.length, echelle: Math.round(echelle * 1000) / 1000, rotationDeg: Math.round(rot * 100) / 100,
    erreurPx: Math.round(r.rms * 100) / 100, ressemblance: corr === null ? null : Math.round(corr * 100) / 100, recalageNul,
  };
  const motif: MotifRefus | null =
    r.inliers.length < C.POINTS_COMMUNS_MIN ? 'peu-d-inliers'
    : r.inliers.length < C.PART_INLIERS_MIN * m.length ? 'peu-d-inliers'
    : echelleDe(r.modele) < C.ECHELLE_MIN || echelleDe(r.modele) > C.ECHELLE_MAX ? 'echelle'
    : Math.abs(rotationDeg(r.modele)) > C.ROTATION_MAX_DEG ? 'rotation'
    : r.rms > C.ERREUR_MAX_PX ? 'erreur'
    : Math.hypot(modele.tx, modele.ty) > C.DEPLACEMENT_MAX_M * pxParM ? 'deplacement'
    : corr !== null && corr < C.RESSEMBLANCE_MIN ? 'ressemblance'
    : null;
  return { bilan: { ...bilan, accepte: motif === null, motif }, modele: motif === null ? modele : null };
}

/* ------------------------------------------------------------------------------------------------
 * Les groupes et leurs recalages
 * --------------------------------------------------------------------------------------------- */

/** Les groupes de photos reliees par des paires acceptees, le plus grand d'abord (a egalite, celui qui a le plus d'inliers). */
function groupes(n: number, paires: readonly BilanPaire[]): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const racine = (i: number): number => { while (parent[i] !== i) { parent[i] = au(parent, au(parent, i)); i = au(parent, i); } return i; };
  for (const p of paires) if (p.accepte) parent[racine(p.a)] = racine(p.b);
  const parRacine = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = racine(i); parRacine.set(r, [...(parRacine.get(r) ?? []), i]); }
  const inliers = (g: number[]) => paires.filter((p) => p.accepte && g.includes(p.a) && g.includes(p.b)).reduce((s, p) => s + p.inliers, 0);
  return [...parRacine.values()].sort((x, y) => y.length - x.length || inliers(y) - inliers(x) || au(x, 0) - au(y, 0));
}

/**
 * Pour chaque photo du groupe, la similitude qui l'envoie dans le repere de la reference : on descend l'arbre couvrant des paires
 * acceptees les plus fournies en inliers, depuis la reference, en composant les recalages.
 */
function modelesVersReference(n: number, groupe: readonly number[], reference: number, aretes: readonly { a: number; b: number; modele: Similitude; inliers: number }[]): (Similitude | null)[] {
  const out: (Similitude | null)[] = Array.from({ length: n }, () => null);
  out[reference] = IDENTITE;
  const dans = new Set(groupe);
  const liens = aretes.filter((e) => dans.has(e.a) && dans.has(e.b)).sort((x, y) => y.inliers - x.inliers);
  let progres = true;
  while (progres) {
    progres = false;
    for (const e of liens) {
      const A = out[e.a], B = out[e.b];
      // e.modele envoie a vers b. Pour la photo nouvelle, on veut son image dans le repere de la reference.
      if (A && !B) { const inv = inverse(e.modele); if (inv) { out[e.b] = composer(A, inv); progres = true; } }
      else if (B && !A) { out[e.a] = composer(B, e.modele); progres = true; }
    }
  }
  return out;
}

export interface ResultatRecalage {
  statut: StatutFusion;
  paires: BilanPaire[];
  /** Les photos du groupe recale (la reference comprise), et les autres. */
  groupe: number[];
  independantes: number[];
  /** L'indice de la photo de reference : la mieux definie du groupe. */
  reference: number;
  /** Pour chaque photo, la similitude qui l'envoie dans le repere de la reference ; `null` hors groupe. */
  modeles: (Similitude | null)[];
  /** Pour chaque photo, ce qui l'a laissee hors du groupe ; `null` pour celles du groupe. */
  motifs: (string | null)[];
  /** Combien de correspondances ont relie chaque photo du groupe aux autres. */
  inliers: number[];
}

/**
 * Le recalage de toutes les photos d'une facade : points communs, paires, plus grand groupe, similitudes vers la reference. Une photo
 * `null` ne s'est pas redressee : elle reste independante, avec son motif. `qualites` choisit la reference (la mieux definie).
 */
export function recalerElevations(elevations: readonly (ElevationRecalee | null)[], qualites: readonly number[], pxParM: number, egout: number): ResultatRecalage {
  const n = elevations.length;
  const points = elevations.map((e) => (e ? detecterOrb(e.image, {}, e.vu) : []));
  const paires: BilanPaire[] = [];
  const aretes: { a: number; b: number; modele: Similitude; inliers: number }[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const ea = elevations[a], eb = elevations[b];
      if (!ea || !eb) { paires.push({ a, b, appariements: 0, inliers: 0, echelle: 1, rotationDeg: 0, erreurPx: 0, ressemblance: null, recalageNul: false, accepte: false, motif: 'illisible' }); continue; }
      const r = recalerPaire(a, b, au(points, a), au(points, b), pxParM, { a: ea, b: eb, egout });
      paires.push(r.bilan);
      if (r.modele) aretes.push({ a, b, modele: r.modele, inliers: r.bilan.inliers });
    }
  }
  const lisibles = Array.from({ length: n }, (_, k) => k).filter((k) => elevations[k]);
  const meilleure = (liste: readonly number[]) => liste.reduce((x, y) => (au(qualites, y) > au(qualites, x) ? y : x));
  const gs = groupes(n, paires).filter((g) => g.some((k) => elevations[k]));
  const groupeFusionne = (gs[0] ?? []).filter((k) => elevations[k]);
  // Sans paire acceptee, la meilleure photo lisible reste seule ; aucune photo n'est retiree pour autant.
  const groupe = groupeFusionne.length >= 2 ? groupeFusionne : lisibles.length ? [meilleure(lisibles)] : [];
  const reference = groupe.length ? meilleure(groupe) : 0;
  const modeles = groupe.length ? modelesVersReference(n, groupe, reference, aretes) : Array.from({ length: n }, () => null);
  const independantes = Array.from({ length: n }, (_, k) => k).filter((k) => !groupe.includes(k));
  const statut: StatutFusion = n === 1 ? 'seule' : groupe.length === n ? 'fusionnee' : groupe.length >= 2 ? 'partielle' : 'independantes';
  const motifs = Array.from({ length: n }, (_, k): string | null => {
    if (groupe.includes(k)) return null;
    if (!elevations[k]) return TEXTES_MOTIF.illisible;
    const proche = paires.filter((p) => (p.a === k || p.b === k) && p.motif !== 'illisible').sort((x, y) => y.appariements - x.appariements)[0];
    return proche?.motif ? TEXTES_MOTIF[proche.motif] : 'aucune autre photo à recaler';
  });
  const inliers = Array.from({ length: n }, (_, k) => (k === reference ? 0 : aretes.filter((e) => (e.a === k || e.b === k) && groupe.includes(e.a) && groupe.includes(e.b)).reduce((s, e) => s + e.inliers, 0)));
  return { statut, paires, groupe, independantes, reference, modeles, motifs, inliers };
}
