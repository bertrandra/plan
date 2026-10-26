// La reprise d un contour de biais : lecture de secours, corps par les formes, boite orientee, completion sur le contour (MD/spec-toit-ign.md §13).
// Un morceau de facade/toits/toitCorps.ts, qui le reexporte : le reste du programme importe depuis lui.

import { pointInPolygon } from '../../../geometry/basic.js';
import { rectanglesEnTranches } from '../../../model/volumesToit.js';
import { ajusterToit, diagnostiquerToit, type EchantillonHauteur, type ToitAjuste } from '../toitLidar.js';
import { repereFaitage } from '../../../geometry/faitage.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../model/types.js';
import { REGLAGES_TOITS as R, SEUILS_TOITS as S } from '../../../regles/toits/reglages.js';
import { dixieme, cm, penteMaxRad, repere, point, type Grille, tourne, corpsAvecPignons } from './ajustement.js';
import { axeDesCotes, contourEquerre } from './recalage.js';

/** La hauteur de la grille a la cellule la plus proche d'un point ; null hors d'elle ou sans mesure. */
export function hauteurGrille(g: Grille, q: PtBrut): number | null {
  const i = Math.round((q.x - g.x0) / g.pas), j = Math.round((g.y0 - q.y) / g.pas);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return null;
  const z = g.z[j * g.nx + i];
  return z === null || z === undefined ? null : z;
}



/** En secours, un appentis au-dela de l'ecart admis doit battre la meilleure forme a faitage de cette part. */
export const GAIN_APPENTIS_SECOURS = R.GAIN_APPENTIS_SECOURS;

/**
 * La lecture de dernier recours, quand l'ajustement des formes ne rend rien : la meilleure forme
 * essayee sous ECART_MAX_M (80 cm). Un appentis y est admis au-dela de son propre seuil (40 cm, une
 * rampe expliquant a peu pres tout) s'il bat nettement la meilleure forme a faitage : le toit a un
 * pan des maisons de village provencales, sinon laissees a la surface brute. Pente de couverture
 * exigee, comme pour l'ajustement.
 */
function lectureDeSecours(rect: readonly PtBrut[], ech: readonly EchantillonHauteur[]): ToitAjuste | null {
  if (ech.length < S.MESURES_MIN) return null;
  const essais = diagnostiquerToit(rect, ech).filter((x) => x.ecart <= S.ECART_MAX_M);
  const pente = (x: { forme: string; angleFaitage: number; H: number }) => {
    const r = repereFaitage(rect, x.angleFaitage);
    const course = x.forme === 'appentis' ? 2 * r.hw : r.hw;
    return course > 0 ? Math.atan(x.H / course) : 0;
  };
  const admis = essais.filter((x) => pente(x) <= penteMaxRad()).sort((a, b) => a.ecart - b.ecart);
  let choix = admis[0];
  if (!choix) return null;
  if (choix.forme === 'appentis' && choix.ecart > S.ECART_MAX_APPENTIS_M) {
    const faitage = admis.find((x) => x.forme === 'deux-pans' || x.forme === 'quatre-pans' || x.forme === 'croupes');
    if (faitage && choix.ecart > S.GAIN_APPENTIS_SECOURS * faitage.ecart) choix = faitage;
  }
  return { toit: { forme: choix.forme, hauteur: cm(choix.H), angleFaitage: choix.angleFaitage, source: 'lidar' }, egout: cm(choix.e), ecart: cm(choix.ecart), echantillons: choix.gardes };
}

/**
 * Un pan seul ou un toit plat, a la meme regle que le modele des corps : l'ajustement des formes
 * simples rend plat tout toit sous 10 degres (la regle de la BD TOPO), et un appentis de garage a 6
 * degres devenait une terrasse. Quand il rend plat ou un appentis, le meilleur appentis essaye
 * l'emporte s'il monte d'au moins HAUTEUR_PLAT_M, a PENTE_PLAT_DEG au moins, et si son ecart tombe a
 * GAIN_PAN_SUR_PLAT de celui du plat ; le plat sinon.
 */
function unPanPlutotQuePlat(rect: readonly PtBrut[], ech: readonly EchantillonHauteur[], a: ToitAjuste | null): ToitAjuste | null {
  if (!a || (a.toit.forme !== 'plat' && a.toit.forme !== 'appentis')) return a;
  const essais = diagnostiquerToit(rect, ech);
  const plat = essais.find((x) => x.forme === 'plat');
  const pan = essais.filter((x) => x.forme === 'appentis').sort((x, y) => x.ecart - y.ecart)[0];
  if (!plat || !pan) return a;
  const course = 2 * repereFaitage(rect, pan.angleFaitage).hw;
  const pentu = pan.H >= S.HAUTEUR_PLAT_M && course > 0 && Math.atan(pan.H / course) >= (S.PENTE_PLAT_DEG * Math.PI) / 180;
  if (pentu && pan.ecart <= S.GAIN_PAN_SUR_PLAT * plat.ecart) return { ...a, toit: { ...a.toit, forme: 'appentis', hauteur: pan.H, angleFaitage: pan.angleFaitage }, egout: pan.e, ecart: pan.ecart };
  return { ...a, toit: { ...a.toit, forme: 'plat', hauteur: 0 }, egout: plat.e, ecart: plat.ecart };
}

/**
 * Le corps d'une tranche lu par l'ajustement des formes simples (facade/toits/toitLidar.ts) : deux pans,
 * croupes et quatre pans (un faitage dans la longueur, des croupes a la pente des pans), appentis,
 * plat. Null quand aucune forme ne s'ajuste.
 */
export function corpsDepuisFormes(g: Grille, rect: readonly PtBrut[], contour: readonly PtBrut[] | null = null, secours = false): CorpsToit | null {
  const ech: EchantillonHauteur[] = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const z = g.z[j * g.nx + i];
    const p = { x: g.x0 + i * g.pas, y: g.y0 - j * g.pas };
    if (z !== null && z !== undefined && z >= S.SOL_M && pointInPolygon(p, rect) && (!contour || pointInPolygon(p, contour))) ech.push({ ...p, z });
  }
  const a = unPanPlutotQuePlat(rect, ech, ajusterToit(rect, ech) ?? (secours ? lectureDeSecours(rect, ech) : null));
  if (!a) return null;
  const { toit, egout } = a;
  const u = { x: Math.cos((toit.angleFaitage * Math.PI) / 180), y: Math.sin((toit.angleFaitage * Math.PI) / 180) };
  const r0 = repere(rect);
  let pts = Math.abs(u.x * r0.u.x + u.y * r0.u.y) >= Math.abs(u.x * r0.v.x + u.y * r0.v.y) ? [...rect] : tourne(rect);
  const quatre = toit.forme === 'croupes' || toit.forme === 'quatre-pans';
  if (quatre && repere(pts).L < repere(pts).W) pts = tourne(pts);
  const r = repere(pts);
  const H = Math.max(0, toit.hauteur), E = dixieme(egout), F = dixieme(egout + H);
  const base = { pts, pignons: [], ecart: cm(a.ecart) };
  if (toit.forme === 'plat' || H < S.HAUTEUR_PLAT_M) {
    const z = dixieme(toit.forme === 'appentis' ? egout + H / 2 : egout);
    return { ...base, posFaitage: cm(r.W / 2), faitage: z, egouts: [z, z] };
  }
  if (toit.forme === 'appentis') {
    // L'appentis monte vers la normale gauche de son faitage (facade/toits/toit.ts::plansDuToit).
    const haut = -u.y * r.v.x + u.x * r.v.y > 0;
    return haut ? { ...base, posFaitage: cm(r.W), faitage: F, egouts: [E, F] } : { ...base, posFaitage: 0, faitage: F, egouts: [F, E] };
  }
  const c: CorpsToit = { ...base, posFaitage: cm(r.W / 2), faitage: F, egouts: [E, E] };
  return quatre ? { ...c, croupes: [cm(r.W / 2), cm(r.W / 2)] } : c;
}

/**
 * Les corps d'un contour qui ne se decoupe pas tel quel (un cote de biais) : mis a l'equerre sur la
 * mesure, coupe en tranches (model/volumesToit.ts::rectanglesEnTranches), chaque tranche lue par les
 * formes simples, qui savent les croupes, la ou le modele des corps n'a que des pignons de bout ; a
 * defaut, par le modele des corps. Null quand meme les tranches ne se font pas.
 */
export function corpsDeReprise(m: ToitMesure, contour: readonly PtBrut[], grille: Grille | null): CorpsToit[] | null {
  const rects = rectanglesEnTranches(contourEquerre(contour) ?? contour);
  if (!rects) return corpsSurBoite(m, contour, grille);
  const corps = rects.map((r) => corpsDepuisFormes(grille ?? m, r) ?? corpsAvecPignons(m, r, contour)).filter((c): c is CorpsToit => c !== null);
  return corps.length ? completerSurContour(corps, contour, grille ?? m) : null;
}

/**
 * Le rectangle qui englobe le contour, dans l'axe qui aligne le plus de ses cotes (`axeDesCotes`).
 */
export function boiteOrientee(contour: readonly PtBrut[]): PtBrut[] {
  const a = (axeDesCotes(contour) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const loc = contour.map((p) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos }));
  const xs = loc.map((p) => p.x), ys = loc.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map((p) => ({ x: cm(p.x * cos - p.y * sin), y: cm(p.x * sin + p.y * cos) }));
}

/**
 * Le dernier recours d'un contour qui ne se decoupe pas du tout (une maison de village en trapeze, en
 * parallelogramme, aux angles qui ne sont pas droits) : un seul corps, lu par les formes simples sur
 * le rectangle qui l'englobe, avec les seules mesures du contour. Le dessin le decoupe ensuite sur le
 * contour (three/toitCorps3d.ts::facettesSurContour) : la maison garde sa forme, et son toit est
 * construit au lieu d'etre la surface brute. Null si les formes ne lisent rien.
 */
function corpsSurBoite(m: ToitMesure, contour: readonly PtBrut[], grille: Grille | null): CorpsToit[] | null {
  const c = corpsDepuisFormes(grille ?? m, boiteOrientee(contour), contour, true);
  return c ? [c] : null;
}

// Les seuils de la completion, lus dans S (regles/toits/reglages.ts) a chaque appel :
// - S.PAS_COMPLETION_M, S.COMPLETION_MAX_M : le pas dont un corps s'etend pour couvrir le contour, et son
//   plus long trajet ;
// - S.PART_COMPLETION_MIN : la part de la bande devant un cote qui doit etre du contour sans toit pour que
//   le corps avance : un triangle laisse par une marche, pas la lisiere de quelques centimetres qu'une aile
//   un peu de biais laisse le long de son voisin - suivie sur 5 m, elle elargissait une aile de 5 m a
//   10 m, au-dessus de la cour, l'egout descendu a -1,3 m (Hucqueliers) ;
// - S.EGOUT_ETENDU_MIN_M : en travers, un corps n'avance pas au-dela du point ou un egout tomberait sous
//   cette hauteur ;
// - S.SOUS_EGOUT_ETENDU_M : ni sur une partie basse : la ou la mesure tombe a plus de cette hauteur sous son
//   egout le plus bas, le contour est un autre toit (un appentis, une annexe), pas un bout du sien. Le toit
//   a 8,6 m d'une maison couvrait sinon l'annexe a 3 m qui la prolonge (Hucqueliers).

/** Un cote d'un rectangle dans son repere : s = 0, s = L, t = 0, t = W. */
type Cote = 's0' | 'sL' | 't0' | 'tW';

/**
 * Les corps etendus jusqu'a couvrir le contour : la marche qui remplace un cote de biais laisse,
 * d'un cote du biais, un triangle du batiment que nul corps ne couvre - un toit qui manquait sur un
 * bout de maison. Chaque corps avance chacun de ses cotes libres (que les autres corps ne bordent pas
 * pour moitie) tant que la bande juste devant contient du contour que nul autre corps ne couvre ; il
 * garde sa forme et ses pentes (`corpsEtendu`). Le dessin decoupe ensuite les toits sur le contour.
 */
export function completerSurContour(corps: readonly CorpsToit[], contour: readonly PtBrut[], g: Grille | null = null): CorpsToit[] {
  // Les plus hauts d'abord, chacun voyant les corps deja etendus : un bout de maison revient au toit
  // qui le domine, pas a la terrasse plate d'a cote.
  const out = [...corps];
  const ordre = out.map((_, k) => k).sort((a, b) => (out[b] as CorpsToit).faitage - (out[a] as CorpsToit).faitage);
  for (const k of ordre) out[k] = etendreSurContour(out[k] as CorpsToit, out.filter((_, j) => j !== k).map((x) => x.pts), contour, g);
  return out;
}

/** Un corps etendu sur le contour que les `autres` ne couvrent pas (`completerSurContour`). */
function etendreSurContour(c: CorpsToit, autres: readonly PtBrut[][], contour: readonly PtBrut[], g: Grille | null): CorpsToit {
  const r = repere(c.pts);
  const b: Record<Cote, number> = { s0: 0, sL: r.L, t0: 0, tW: r.W };
  // Les points d'une bande parallele au cote, a la position `v` de son axe, sur toute la longueur de l'autre.
  const bande = (cote: Cote, v: number): PtBrut[] => {
    const out: PtBrut[] = [];
    if (cote === 's0' || cote === 'sL') for (let t = b.t0 + 0.125; t < b.tW; t += S.PAS_COMPLETION_M) out.push(point(r, v, t));
    else for (let sv = b.s0 + 0.125; sv < b.sL; sv += S.PAS_COMPLETION_M) out.push(point(r, sv, v));
    return out;
  };
  const ailleurs = (q: PtBrut) => autres.some((a) => pointInPolygon(q, a));
  const bas = Math.min(...c.egouts) - S.SOUS_EGOUT_ETENDU_M;
  const aSaHauteur = (q: PtBrut) => { const z = g ? hauteurGrille(g, q) : null; return z === null || z >= bas; };
  for (const cote of ['s0', 'sL', 't0', 'tW'] as const) {
    const signe = cote === 's0' || cote === 't0' ? -1 : 1;
    const devant = bande(cote, b[cote] + signe * 0.3);
    if (devant.filter(ailleurs).length > devant.length / 2) continue;
    for (let d = S.PAS_COMPLETION_M; d <= S.COMPLETION_MAX_M + 1e-6; d += S.PAS_COMPLETION_M) {
      const pts = bande(cote, b[cote] + (signe * S.PAS_COMPLETION_M) / 2);
      if (pts.filter((q) => pointInPolygon(q, contour) && !ailleurs(q) && aSaHauteur(q)).length < Math.max(1, S.PART_COMPLETION_MIN * pts.length)) break;
      const essai = { ...b, [cote]: b[cote] + signe * S.PAS_COMPLETION_M };
      if ((cote === 't0' || cote === 'tW') && Math.min(...corpsEtendu(c, essai).egouts) < S.EGOUT_ETENDU_MIN_M) break;
      b[cote] = essai[cote];
    }
  }
  return corpsEtendu(c, b);
}

/**
 * Le corps sur un rectangle agrandi (bornes dans son repere, `s0 <= 0 <= L <= sL`, idem en t), sa
 * forme et ses pentes gardees : etendu le long du faitage, le faitage s'allonge, croupes et hauteurs
 * restent ; en travers, les pans s'elargissent a leur pente et le faitage monte.
 */
export function corpsEtendu(c: CorpsToit, b: Record<Cote, number>): CorpsToit {
  const r = repere(c.pts);
  if (b.s0 === 0 && b.sL === r.L && b.t0 === 0 && b.tW === r.W) return c;
  const pts = [point(r, b.s0, b.t0), point(r, b.sL, b.t0), point(r, b.sL, b.tW), point(r, b.s0, b.tW)].map((q) => ({ x: cm(q.x), y: cm(q.y) }));
  const W2 = b.tW - b.t0;
  if (W2 === r.W) return { ...c, pts };
  const [e0, e1] = c.egouts, p = c.posFaitage;
  const plat = c.faitage - Math.min(e0, e1) < S.HAUTEUR_PLAT_M;
  if (plat) return { ...c, pts };
  // En travers : le faitage reste au meme endroit du batiment, chaque pan descend a sa pente jusqu'au
  // nouveau mur ; un appentis garde son egout bas et monte d'autant.
  const p2 = p - b.t0;
  if (p <= 0.01 || p >= r.W - 0.01) {
    const k = (c.faitage - Math.min(e0, e1)) / r.W, F = dixieme(Math.min(e0, e1) + k * W2);
    return p <= 0.01 ? { ...c, pts, posFaitage: 0, faitage: F, egouts: [F, Math.min(e0, e1)] } : { ...c, pts, posFaitage: cm(W2), faitage: F, egouts: [Math.min(e0, e1), F] };
  }
  const k0 = (c.faitage - e0) / p, k1 = (c.faitage - e1) / (r.W - p);
  const egouts: [number, number] = [dixieme(c.faitage - k0 * p2), dixieme(c.faitage - k1 * (W2 - p2))];
  const croupes = c.croupes ? { croupes: c.croupes.map((h) => (h > 0 ? cm(W2 / 2) : 0)) as [number, number] } : {};
  return { ...c, pts, posFaitage: cm(p2), egouts, ...croupes };
}
