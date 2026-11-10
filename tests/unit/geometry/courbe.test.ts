import { describe, it, expect } from 'vitest';
import { estCourbe, tronconsBezier, pointBezier, echantillonnerTrace, longueurTrace, ECHANTILLONS_RENDU } from '../../../src/geometry/courbe.js';
import { ribbonChemin } from '../../../src/geometry/ruban.js';
import { pathD } from '../../../src/geometry/path.js';
import { pdfPathD } from '../../../src/export/pdfPlan.js';
import type { EtatScene } from '../../../src/geometry/vue.js';

type P = { x: number; y: number };

// La courbe des chemins etait ecrite quatre fois (plan a l'ecran, SVG, PDF, 3D). Les trois copies
// ci-dessous sont les anciennes, mot pour mot, gardees comme oracle : la mise en commun ne devait
// changer aucun octet des traces. (L'export SVG est garde par l'empreinte plan.svg, qui porte quatre
// chemins courbes.)
const borneDe = (s: P[]) => (i: number): P => s[Math.max(0, Math.min(s.length - 1, i))] as P;

function ancienPathD(s: P[], curve: boolean): string {
  if (s.length < 2) return '';
  if (!curve || s.length < 3) return 'M ' + s.map((p) => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' L ');
  const borne = borneDe(s);
  let d = 'M ' + borne(0).x.toFixed(1) + ',' + borne(0).y.toFixed(1) + ' ';
  for (let i = 0; i < s.length - 1; i++) {
    const p0 = borne(i - 1), p1 = borne(i), p2 = borne(i + 1), p3 = borne(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += 'C ' + c1.x.toFixed(1) + ',' + c1.y.toFixed(1) + ' ' + c2.x.toFixed(1) + ',' + c2.y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1) + ' ';
  }
  return d;
}

function ancienPdfPathD(s: P[], curve: boolean): string {
  const cmds: string[] = [];
  if (!curve || s.length < 3) {
    s.forEach((p, i) => { cmds.push(p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ' ' + (i === 0 ? 'm' : 'l')); });
    return cmds.join('\n') + '\n';
  }
  const borne = borneDe(s);
  cmds.push(borne(0).x.toFixed(2) + ' ' + borne(0).y.toFixed(2) + ' m');
  for (let i = 0; i < s.length - 1; i++) {
    const p0 = borne(i - 1), p1 = borne(i), p2 = borne(i + 1), p3 = borne(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    cmds.push(c1.x.toFixed(2) + ' ' + c1.y.toFixed(2) + ' ' + c2.x.toFixed(2) + ' ' + c2.y.toFixed(2) + ' ' + p2.x.toFixed(2) + ' ' + p2.y.toFixed(2) + ' c');
  }
  return cmds.join('\n') + '\n';
}

function ancienneCourbePolyligne(pts: P[], curve: boolean, segs = 12): P[] {
  const premier = pts[0];
  if (pts.length < 3 || !curve || !premier) return pts.slice();
  const borne = borneDe(pts);
  const out: P[] = [premier];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = borne(i - 1), p1 = borne(i), p2 = borne(i + 1), p3 = borne(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    for (let k = 1; k <= segs; k++) {
      const t = k / segs, mt = 1 - t;
      out.push({
        x: mt * mt * mt * p1.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p2.x,
        y: mt * mt * mt * p1.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p2.y
      });
    }
  }
  return out;
}

// Des polylignes de 2 a 8 points, tirees d'un generateur fixe : le test se rejoue a l'identique.
function polylignes(): P[][] {
  let graine = 7;
  const r = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  const out: P[][] = [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], [{ x: 1, y: 1 }, { x: 2, y: 2 }]];
  for (let n = 0; n < 40; n++) out.push(Array.from({ length: 2 + (n % 7) }, () => ({ x: (r() - 0.5) * 40, y: (r() - 0.5) * 40 })));
  return out;
}

describe('la courbe d un chemin, une seule definition', () => {
  const scene: EtatScene = { scale: 37.3, origine: { x: 412.7, y: 288.1 }, W: 800, H: 600 };
  const versPdf = (p: P): P => ({ x: 36 + p.x * 11.3, y: 500 - p.y * 11.3 });

  it('rend au plan a l ecran le meme attribut d qu avant, droit ou courbe', () => {
    for (const pts of polylignes()) {
      const s = pts.map((p) => ({ x: scene.origine.x + p.x * scene.scale, y: scene.origine.y - p.y * scene.scale }));
      for (const curve of [false, true]) expect(pathD(scene, pts, curve)).toBe(ancienPathD(s, curve));
    }
  });

  it('rend au PDF les memes operateurs qu avant, droit ou courbe', () => {
    for (const pts of polylignes()) {
      for (const curve of [false, true]) expect(pdfPathD({ toPdf: versPdf }, pts, curve)).toBe(ancienPdfPathD(pts.map(versPdf), curve));
    }
  });

  it('rend a la 3D les memes points qu avant, a 12 et a 8 echantillons', () => {
    for (const pts of polylignes()) {
      expect(echantillonnerTrace(pts, false)).toEqual(ancienneCourbePolyligne(pts, false));
      expect(echantillonnerTrace(pts, true)).toEqual(ancienneCourbePolyligne(pts, true));
      expect(echantillonnerTrace(pts, true, 8)).toEqual(ancienneCourbePolyligne(pts, true, 8));
    }
  });
});

describe('la primitive', () => {
  const carre = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];

  it('ne courbe qu un trace marque courbe d au moins trois points', () => {
    expect(estCourbe(carre, true)).toBe(true);
    expect(estCourbe(carre, false)).toBe(false);
    expect(estCourbe(carre.slice(0, 2), true)).toBe(false);
    expect(echantillonnerTrace(carre, false)).toEqual(carre);
    expect(echantillonnerTrace(carre.slice(0, 2), true)).toHaveLength(2);
  });

  it('passe par chaque point saisi, un troncon par cote', () => {
    const t = tronconsBezier(carre);
    expect(t).toHaveLength(3);
    t.forEach((b, i) => {
      expect(pointBezier(b, 0)).toEqual(carre[i]);
      expect(pointBezier(b, 1)).toEqual(carre[i + 1]);
    });
    const c = echantillonnerTrace(carre, true, 4);
    expect(c).toHaveLength(1 + 3 * 4);
    expect(c[0]).toEqual(carre[0]);
    expect(c.at(-1)).toEqual(carre.at(-1));
    expect(echantillonnerTrace(carre, true)).toHaveLength(1 + 3 * ECHANTILLONS_RENDU);
  });

  it('mesure la ligne brisee d un trace droit', () => {
    expect(longueurTrace(carre, false)).toBeCloseTo(11, 12);
    expect(longueurTrace(carre.slice(0, 2), true)).toBeCloseTo(4, 12);
    expect(longueurTrace([], true)).toBe(0);
  });

  it('mesure la courbe d un trace courbe : plus longue que ses cordes, au centimetre pres', () => {
    // Trois points alignes et equidistants : la courbe est le segment lui-meme.
    expect(longueurTrace([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }], true)).toBeCloseTo(10, 9);
    // Deux virages a angle droit : la courbe depasse la ligne brisee (11 m), et un echantillonnage
    // bien plus fin ne la change pas d'un millimetre (moins du dix-millieme de la longueur).
    const L = longueurTrace(carre, true);
    expect(L).toBeGreaterThan(11);
    const fine = echantillonnerTrace(carre, true, 2000);
    let Lfine = 0;
    for (let i = 1; i < fine.length; i++) Lfine += Math.hypot((fine[i] as P).x - (fine[i - 1] as P).x, (fine[i] as P).y - (fine[i - 1] as P).y);
    expect(Math.abs(L - Lfine)).toBeLessThan(1e-3);
    expect(Math.abs(L - Lfine) / Lfine).toBeLessThan(1e-4);
  });
});

describe('le ruban d un chemin', () => {
  it('elargit un chemin en ruban de sa largeur, deux bords par point', () => {
    expect(ribbonChemin([{ x: 0, y: 0 }], 1)).toBeNull();
    expect(ribbonChemin([{ x: 0, y: 0 }, { x: 4, y: 0 }], 0)).toBeNull();
    const r = ribbonChemin([{ x: 0, y: 0 }, { x: 4, y: 0 }], 2);
    expect(r).toEqual([{ x: 0, y: 1 }, { x: 4, y: 1 }, { x: 4, y: -1 }, { x: 0, y: -1 }]);
  });

  it('mitre un coin, et biseaute un virage trop serre', () => {
    const coin = ribbonChemin([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], 2);
    expect(coin?.[1]?.x).toBeCloseTo(3); expect(coin?.[1]?.y).toBeCloseTo(1);
    const epingle = ribbonChemin([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 0.01 }], 2);
    expect(epingle).toHaveLength(6);
    expect(Math.hypot((epingle?.[1]?.x ?? 0) - 4, epingle?.[1]?.y ?? 0)).toBeLessThan(4);
  });
});
