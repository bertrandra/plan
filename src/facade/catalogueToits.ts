// Le catalogue des formes de toit que la 3D sait dessiner, en vue isometrique (Admin › Chaine).
//
// Chaque forme est un petit corps de reference (10 m sur 7 m) dont les facettes viennent du meme code que la 3D :
// `facettesEtendues` pour le brisis, le gambrel et la demi-croupe (croupe meuniere), `facettesLucarnes` pour les
// lucarnes, et des plans simples pour deux-pans, croupes, appentis et plat. Rien n'est dessine a la main : si le calcul
// d'une forme change, sa vignette change avec lui.

import { facettesEtendues, facettesLucarnes, type Sommet } from './toitFormes.js';
import { couperDemiPlan } from './toit.js';
import type { CorpsToit, Lucarne, PtBrut, TypeLucarne } from '../model/types.js';

/** Un corps de reference : tout ce qui decrit le toit, sans le contour (le rectangle est donne par la longueur, la largeur et le decalage). */
type Corps = Pick<CorpsToit, 'posFaitage' | 'faitage' | 'egouts'> & Partial<Pick<CorpsToit, 'croupes' | 'profil' | 'bouts' | 'speciale' | 'terrasse'>> & { lucarnes?: Lucarne[] };

export interface ExempleToit {
  id: string;
  titre: string;
  /** Le nom courant, quand il y en a un autre. */
  aussi?: string;
  famille: 'toit' | 'lucarne';
  /** Un ou plusieurs corps accoles ; `t0` : le decalage en travers du corps, `w` : sa largeur, `l` : sa longueur (defauts : `LARGEUR_M`, `LONGUEUR_M`). */
  corps: readonly { corps: Corps; t0?: number; w?: number; l?: number }[];
}

export const LONGUEUR_M = 10;
export const LARGEUR_M = 7;

/** Le corps de l'exemple, avec son contour : de quoi demander sa forme au modele. */
export function corpsDeLExemple(e: ExempleToit): CorpsToit[] {
  return e.corps.map(({ corps, t0 = 0, w = LARGEUR_M, l = LONGUEUR_M }) => ({
    ...corps, pts: [{ x: 0, y: t0 }, { x: l, y: t0 }, { x: l, y: t0 + w }, { x: 0, y: t0 + w }], pignons: [], ecart: 0,
  }) as CorpsToit);
}

const base: Corps = { posFaitage: 3.5, faitage: 7, egouts: [3, 3] };
const un = (corps: Corps, plus: { t0?: number; w?: number; l?: number } = {}) => ({ corps, ...plus });
const lucarne = (type: TypeLucarne): Lucarne => ({ type, pan: 1, debutM: 3.5, finM: 6.5, faitageM: 5.2, profondeurM: 1.4, source: 'observation' });
const brise = { type: 'brise' as const, largeurBrisisM: 1.6, hauteurBrisM: 5 };
const arc = (fleche: number) => ({ type: 'courbe' as const, flecheM: fleche });
const coyau = { type: 'coyau' as const, largeurM: 1.4, penteDeg: 12 };
const tourelle = (speciale: NonNullable<Corps['speciale']>, faitage: number): Corps => ({ posFaitage: 3, faitage, egouts: [3, 3], speciale });
const appentis = (faitage: number): Corps => ({ posFaitage: 0, faitage, egouts: [3, 3] });

export const EXEMPLES_TOITS: readonly ExempleToit[] = [
  { id: 'deux-pans', titre: 'Deux pans', famille: 'toit', corps: [un(base)] },
  { id: 'croupes', titre: 'Quatre pans', aussi: 'croupes', famille: 'toit', corps: [un({ ...base, croupes: [2.5, 2.5] })] },
  { id: 'pavillon', titre: 'Pavillon', aussi: 'pyramide', famille: 'toit', corps: [un({ posFaitage: 3.5, faitage: 7, egouts: [3, 3], croupes: [3.5, 3.5] }, { l: 7 })] },
  { id: 'appentis', titre: 'Un pan', aussi: 'appentis', famille: 'toit', corps: [un({ posFaitage: 0, faitage: 6, egouts: [3, 3] })] },
  { id: 'plat', titre: 'Toit plat', aussi: 'toit-terrasse', famille: 'toit', corps: [un({ posFaitage: 3.5, faitage: 3, egouts: [3, 3] })] },
  { id: 'demi-croupes', titre: 'Demi-croupe', aussi: 'croupe meunière', famille: 'toit', corps: [un({ ...base, bouts: [{ type: 'demi-croupe', profondeurM: 1.6, hauteurPignonM: 2.6 }, { type: 'pignon' }] })] },
  { id: 'mansart', titre: 'Mansart', aussi: 'brisis aux quatre côtés', famille: 'toit', corps: [un({ ...base, profil: [brise, brise], bouts: [{ type: 'brisis', largeurM: 1.6 }, { type: 'brisis', largeurM: 1.6 }] })] },
  { id: 'asymetrique', titre: 'Asymétrique', aussi: 'saltbox', famille: 'toit', corps: [un({ posFaitage: 2.2, faitage: 7, egouts: [4, 1.8] })] },
  { id: 'deux-pans-decales', titre: 'Deux pans décalés', famille: 'toit', corps: [un({ posFaitage: 2.5, faitage: 6, egouts: [3, 3] }, { w: 5 }), un({ posFaitage: 2.5, faitage: 7.5, egouts: [3, 3] }, { t0: 5, w: 5 })] },
  { id: 'toit-en-m', titre: 'Toit en M', aussi: 'double pignon', famille: 'toit', corps: [un({ posFaitage: 2.5, faitage: 6.5, egouts: [3, 3] }, { w: 5 }), un({ posFaitage: 2.5, faitage: 6.5, egouts: [3, 3] }, { t0: 5, w: 5 })] },
  { id: 'papillon', titre: 'Papillon', aussi: 'en V', famille: 'toit', corps: [un({ posFaitage: 3.5, faitage: 3, egouts: [5, 5] })] },
  { id: 'gambrel', titre: 'Gambrel', aussi: 'toit brisé, à la hollandaise', famille: 'toit', corps: [un({ ...base, profil: [brise, brise], bouts: [{ type: 'pignon' }, { type: 'pignon' }] })] },
  { id: 'coyau', titre: 'Coyau', aussi: 'toit retroussé', famille: 'toit', corps: [un({ ...base, profil: [coyau, coyau] })] },
  { id: 'shed', titre: 'Shed', aussi: 'dents de scie', famille: 'toit', corps: [un(appentis(5.6), { w: 4 }), un(appentis(5.6), { t0: 4, w: 4 }), un(appentis(5.6), { t0: 8, w: 4 })] },
  { id: 'berceau', titre: 'Berceau', aussi: 'voûte', famille: 'toit', corps: [un({ posFaitage: 3.5, faitage: 6, egouts: [3, 3], profil: [arc(0.8), arc(0.8)] })] },
  { id: 'carene', titre: 'Carène', aussi: 'coque renversée', famille: 'toit', corps: [un({ posFaitage: 3.5, faitage: 6.8, egouts: [3, 3], profil: [arc(1.3), arc(1.3)], bouts: [{ type: 'croupe', profondeurM: 2.5 }, { type: 'croupe', profondeurM: 2.5 }] })] },
  { id: 'conique', titre: 'Conique', aussi: 'poivrière', famille: 'toit', corps: [un(tourelle({ type: 'conique' }, 8), { l: 6, w: 6 })] },
  { id: 'polygonal', titre: 'Polygonal', aussi: 'kiosque', famille: 'toit', corps: [un(tourelle({ type: 'polygonal', cotes: 6 }, 7), { l: 6, w: 6 })] },
  { id: 'fleche', titre: 'Flèche', aussi: 'clocher', famille: 'toit', corps: [un(tourelle({ type: 'fleche', cotes: 8 }, 12), { l: 5, w: 5 })] },
  { id: 'dome', titre: 'Dôme', aussi: 'coupole', famille: 'toit', corps: [un(tourelle({ type: 'dome' }, 6.2), { l: 6, w: 6 })] },
  { id: 'imperiale', titre: 'Impériale', aussi: 'bulbe', famille: 'toit', corps: [un(tourelle({ type: 'imperiale' }, 9), { l: 6, w: 6 })] },
  { id: 'jacobine', titre: 'Lucarne jacobine', famille: 'lucarne', corps: [un({ ...base, lucarnes: [lucarne('jacobine')] })] },
  { id: 'capucine', titre: 'Lucarne capucine', aussi: 'à croupe', famille: 'lucarne', corps: [un({ ...base, lucarnes: [lucarne('capucine')] })] },
  { id: 'chien-assis', titre: 'Lucarne chien-assis', famille: 'lucarne', corps: [un({ ...base, lucarnes: [lucarne('chien-assis')] })] },
  { id: 'rampante', titre: 'Lucarne rampante', aussi: 'à un pan', famille: 'lucarne', corps: [un({ ...base, lucarnes: [lucarne('rampante')] })] },
  { id: 'meuniere', titre: 'Lucarne meunière', aussi: 'dans le mur d’égout', famille: 'lucarne', corps: [un({ ...base, lucarnes: [lucarne('meuniere')] })] },
  { id: 'oeil-de-boeuf', titre: 'Œil-de-bœuf', aussi: 'lucarne ronde', famille: 'lucarne', corps: [un({ ...base, lucarnes: [{ ...lucarne('oeil-de-boeuf'), debutM: 4.4, finM: 5.6, profondeurM: 1.2 }] })] },
  { id: 'outeau', titre: 'Outeau', aussi: 'petite lucarne à croupe', famille: 'lucarne', corps: [un({ ...base, lucarnes: [{ ...lucarne('outeau'), debutM: 4.2, finM: 5.8 }] })] },
  { id: 'lanterneau', titre: 'Lanterneau', aussi: 'sur toit plat', famille: 'lucarne', corps: [un({ posFaitage: 3.5, faitage: 3, egouts: [3, 3], lucarnes: [{ ...lucarne('lanterneau'), faitageM: 3.6, profondeurM: 2.2, debutM: 3.5, finM: 5.5 }] })] },
];

/** Les facettes d'un toit simple : le toit est le plus bas de ses plans. */
function facettesSimples(c: Corps, L: number, W: number): { pans: Sommet[][]; murs: Sommet[][] } {
  const p = c.posFaitage, F = c.faitage, [e0, e1] = c.egouts;
  const plans: { a: number; b: number; c: number }[] = [];
  if (F - Math.min(e0, e1) < 0.05) plans.push({ a: 0, b: 0, c: F });
  else {
    if (p > 0.01) plans.push({ a: 0, b: (F - e0) / p, c: e0 });
    if (p < W - 0.01) plans.push({ a: 0, b: -(F - e1) / (W - p), c: e1 + ((F - e1) * W) / (W - p) });
    const [h0, h1] = c.croupes ?? [0, 0];
    if (h0 > 0) plans.push({ a: (F - e0) / h0, b: 0, c: e0 });
    if (h1 > 0) plans.push({ a: -(F - e1) / h1, b: 0, c: e1 + ((F - e1) * L) / h1 });
  }
  const z = (q: { a: number; b: number; c: number }, s: number, t: number) => q.a * s + q.b * t + q.c;
  const rect: PtBrut[] = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }];
  const pans: Sommet[][] = [];
  plans.forEach((q, i) => {
    let poly = rect;
    plans.forEach((r, j) => { if (j !== i && poly.length >= 3) poly = couperDemiPlan(poly, (m) => z(q, m.x, m.y) - z(r, m.x, m.y) - (j < i ? 1e-9 : 0)); });
    if (poly.length >= 3) pans.push(poly.map((m) => ({ s: m.x, t: m.y, z: z(q, m.x, m.y) })));
  });
  // Les murs de bout et de long pan, jusqu'au toit.
  const murs: Sommet[][] = [];
  const hauteur = (s: number, t: number) => Math.min(...plans.map((q) => z(q, s, t)));
  const bord: [Sommet, Sommet][] = [[{ s: 0, t: 0, z: 0 }, { s: L, t: 0, z: 0 }], [{ s: L, t: 0, z: 0 }, { s: L, t: W, z: 0 }], [{ s: L, t: W, z: 0 }, { s: 0, t: W, z: 0 }], [{ s: 0, t: W, z: 0 }, { s: 0, t: 0, z: 0 }]];
  for (const [a, b] of bord) {
    const n = 12, haut: Sommet[] = [];
    for (let k = 0; k <= n; k++) { const s = a.s + ((b.s - a.s) * k) / n, t = a.t + ((b.t - a.t) * k) / n; haut.push({ s, t, z: hauteur(s, t) }); }
    murs.push([a, b, ...haut.reverse()]);
  }
  return { pans, murs };
}

export interface FacettePlate { points: [number, number][]; ton: number; mur: boolean; lucarne: boolean }
export interface VueIso { facettes: FacettePlate[]; largeur: number; hauteur: number }

/**
 * Les facettes d'un exemple, en projection isometrique (x vers la droite, y vers le bas), de l'arriere vers l'avant.
 * `plus` : des facettes de plus, dans le repere de l'exemple (un element de facade pose contre son mur).
 */
export function vueIsometrique(e: ExempleToit, plus: readonly { f: Sommet[]; mur: boolean }[] = []): VueIso {
  const liste: { f: Sommet[]; mur: boolean; lucarne: boolean }[] = [];
  for (const { corps: c, t0 = 0, w: W = LARGEUR_M, l: L = LONGUEUR_M } of e.corps) {
    const etendu = facettesEtendues(c, L, W, { egout0: 0, egout1: 0, rive0: 0, rive1: 0 }, 0);
    const { pans, murs: mursSimples } = etendu ?? facettesSimples(c, L, W);
    // Le dessin etendu ne rend que les murs de bout : les murs d'egout sont ceux du prisme.
    const prisme = (t: number, z: number): Sommet[] => [{ s: 0, t, z: 0 }, { s: L, t, z: 0 }, { s: L, t, z }, { s: 0, t, z }];
    const murs = etendu ? [...etendu.murs, prisme(0, c.egouts[0]), prisme(W, c.egouts[1])] : mursSimples;
    const dormers = facettesLucarnes(c, L, W);
    const decale = (f: Sommet[]): Sommet[] => f.map((q) => ({ ...q, t: q.t + t0 }));
    liste.push(
      ...murs.map((f) => ({ f: decale(f), mur: true, lucarne: false })), ...pans.map((f) => ({ f: decale(f), mur: false, lucarne: false })),
      ...dormers.murs.map((f) => ({ f: decale(f), mur: true, lucarne: true })), ...dormers.pans.map((f) => ({ f: decale(f), mur: false, lucarne: true })),
    );
  }
  liste.push(...plus.map(({ f, mur }) => ({ f, mur, lucarne: false })));
  const K = 22, cos = Math.cos(Math.PI / 6), sin = Math.sin(Math.PI / 6);
  const proj = (m: Sommet): [number, number] => [(m.s - m.t) * cos * K, (m.s + m.t) * sin * K - m.z * K];
  const profondeur = (f: Sommet[]) => f.reduce((a, m) => a + m.s + m.t, 0) / f.length;
  const tries = liste.slice().sort((a, b) => profondeur(a.f) - profondeur(b.f) || Number(a.mur) - Number(b.mur));
  const plates = tries.map(({ f, mur, lucarne }) => {
    // Le ton vient de la normale : un pan face au soleil (haut-gauche) est clair.
    const [A, B, C] = [f[0] as Sommet, f[1] as Sommet, f[2] as Sommet];
    const [ux, uy, uz] = [B.s - A.s, B.t - A.t, B.z - A.z], [vx, vy, vz] = [C.s - A.s, C.t - A.t, C.z - A.z];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const n = Math.hypot(nx, ny, nz) || 1; nx /= n; ny /= n; nz /= n;
    const signe = nz < 0 && !mur ? -1 : 1;
    const ton = Math.max(0, Math.min(1, 0.55 + 0.45 * signe * (-0.4 * nx + 0.3 * ny + 0.85 * nz)));
    return { points: f.map(proj), ton, mur, lucarne };
  });
  const xs = plates.flatMap((p) => p.points.map((q) => q[0])), ys = plates.flatMap((p) => p.points.map((q) => q[1]));
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return {
    facettes: plates.map((p) => ({ ...p, points: p.points.map(([x, y]) => [Math.round((x - x0 + 6) * 10) / 10, Math.round((y - y0 + 6) * 10) / 10] as [number, number]) })),
    largeur: Math.max(...xs) - x0 + 12, hauteur: Math.max(...ys) - y0 + 12,
  };
}
