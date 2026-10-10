import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reconstruireCorps, contourEquerre, corpsDepuisFormes, corpsEtendu, decalageSurMesure, partVideSous, PART_VIDE_RECALAGE } from '../../../src/facade/toitCorps.js';
import { rectanglesEnTranches } from '../../../src/model/volumesToit.js';
import { toitMesureDepuisGrille } from '../../../src/model/toitMesure.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';
import { distancePointContour } from '../../../src/geometry/proximite.js';
import type { GrilleRelief } from '../../../src/model/relief.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../src/model/types.js';

// La reprise des contours qui ne se decoupent pas tels quels (MD/spec-toit-ign.md §13.7), sur deux
// releves reels du Vesinet : AE 101, dont les corps ont ete valides et ne doivent pas bouger d'un
// centimetre, et AE 103, dont la BD TOPO trace la maison en biais et deux metres trop au nord.

interface Releve { contour: PtBrut[]; toitMesure: ToitMesure; corps: CorpsToit[] | null; grille: GrilleRelief; grilleLarge?: GrilleRelief }
const releve = (n: string): Releve => JSON.parse(readFileSync(new URL(`../../fixtures/toits/vesinet-${/^\d{8}$/.test(n) ? n : 'ae' + n}.json`, import.meta.url), 'utf8'));
const p = (x: number, y: number): PtBrut => ({ x, y });

describe('reprise des contours de biais', () => {
  it('AE 101 : les corps d avant, au centimetre, et pas de recalage', () => {
    const r = releve('101');
    expect(reconstruireCorps(r.toitMesure, r.contour)).toEqual(r.corps);
    expect(reconstruireCorps(r.toitMesure, r.contour, { grille: r.grille })).toEqual(r.corps);
    expect(partVideSous(r.grille, r.contour)).toBeLessThan(PART_VIDE_RECALAGE);
    expect(r.corps?.every((c) => !c.croupes)).toBe(true);
  });

  it('AE 100 : un quatre-pans, lu par les formes simples la ou le modele des corps n avait qu un appentis', () => {
    const r = releve('100');
    const corps = reconstruireCorps(r.toitMesure, r.contour, { grille: r.grille })!;
    expect(corps).toHaveLength(1);
    const c = corps[0]!;
    expect(c.croupes?.every((h) => h > 3)).toBe(true);
    expect(c.egouts[0]).toBe(c.egouts[1]);
    expect(c.faitage).toBeGreaterThan(7.3);
    expect(c.egouts[0]).toBeGreaterThan(4.2);
    expect(c.egouts[0]).toBeLessThan(5.2);
  });

  it('AE 98 : un toit a deux pans entier, que la pente d un pan ne coupe plus en deux morceaux', () => {
    const r = releve('98');
    const corps = reconstruireCorps(r.toitMesure, r.contour, { grille: r.grille })!;
    expect(corps).toHaveLength(2);
    const [haut, bas] = [...corps].sort((a, b) => b.faitage - a.faitage) as [CorpsToit, CorpsToit];
    // Le corps principal : deux pans, faitage au milieu, egouts egaux.
    expect(haut.faitage).toBeGreaterThan(9.2);
    expect(haut.egouts[0]).toBe(haut.egouts[1]);
    expect(haut.egouts[0]).toBeLessThan(7.2);
    // L'annexe nord : un pan, de 3 a 5 m.
    expect(Math.min(...bas.egouts)).toBeLessThan(3.5);
    expect(bas.faitage).toBeLessThan(5.6);
  });

  it('la maison mitoyenne d AE 98 : un pavillon que les marches coupaient en trois bandes de 1,5 a 2,6 m', () => {
    const r = releve('98-voisin');
    const corps = reconstruireCorps(toitMesureDepuisGrille(r.grille, r.contour)!, r.contour, { grille: r.grille })!;
    expect(corps).toHaveLength(2);
    const principal = [...corps].sort((a, b) => b.faitage - a.faitage)[0]!;
    expect(principal.faitage).toBeGreaterThan(9.3);
    expect(principal.egouts[0]).toBe(principal.egouts[1]);
    expect(principal.egouts[0]).toBeLessThan(7);
  });

  it('un grand deux-pans du voisinage, que la pente de ses pans debitait en bandes paralleles au faitage', () => {
    const r = releve('28267713');
    const corps = reconstruireCorps(toitMesureDepuisGrille(r.grille, r.contour)!, r.contour, { grille: r.grille, coupes: false })!;
    const principal = [...corps].sort((a, b) => b.faitage - a.faitage)[0]!;
    expect(principal.faitage).toBeGreaterThan(10);
    expect(Math.abs(principal.egouts[0] - principal.egouts[1])).toBeLessThan(1);
    // Aucun corps plus etroit que 3 m : plus de bande.
    for (const c of corps) {
      const L = Math.hypot(c.pts[1]!.x - c.pts[0]!.x, c.pts[1]!.y - c.pts[0]!.y), W = Math.hypot(c.pts[3]!.x - c.pts[0]!.x, c.pts[3]!.y - c.pts[0]!.y);
      expect(Math.min(L, W)).toBeGreaterThanOrEqual(3);
    }
  });

  it('AE 103 : le contour recale sur le LiDAR, deux toits a quatre pans et un toit plat entre eux', () => {
    const r = releve('103');
    const large = r.grilleLarge as GrilleRelief;
    expect(partVideSous(r.grille, r.contour)).toBeGreaterThanOrEqual(PART_VIDE_RECALAGE);
    const d = decalageSurMesure(large, r.contour)!;
    // Deux metres vers le sud, un vers l'ouest : le batiment au milieu de ce que le LiDAR voit bati.
    expect(d).toEqual({ x: -1, y: -1.75 });
    const pts = r.contour.map((q) => p(q.x + d.x, q.y + d.y));
    const corps = reconstruireCorps(toitMesureDepuisGrille(large, pts)!, pts, { grille: large })!;
    expect(corps).toHaveLength(3);
    const quatrePans = corps.filter((c) => c.croupes && c.croupes[0] > 0 && c.croupes[1] > 0).sort((a, b) => b.faitage - a.faitage);
    expect(quatrePans).toHaveLength(2);
    // Le corps principal, a l'est : faitage vers 7,8 m ; l'aile ouest, plus basse, vers 6,3 m.
    expect(quatrePans[0]!.faitage).toBeGreaterThan(7.3);
    expect(quatrePans[1]!.faitage).toBeGreaterThan(5.8);
    expect(quatrePans[1]!.faitage).toBeLessThan(6.8);
    const cx = (c: CorpsToit) => c.pts.reduce((s, q) => s + q.x, 0) / 4;
    const plat = corps.find((c) => !quatrePans.includes(c))!;
    expect(plat.faitage).toBe(plat.egouts[0]);
    expect(plat.faitage).toBeLessThan(4.2);
    // Entre les deux.
    expect(cx(plat)).toBeGreaterThan(cx(quatrePans[1]!));
    expect(cx(plat)).toBeLessThan(cx(quatrePans[0]!));
    // Toute la maison est sous un toit (a la frange de 10 cm pres, les arrondis de la mise a
    // l'equerre) : le triangle que la marche laissait a cote du biais revient a l'aile, et la partie
    // plate garde sa taille.
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    for (let x = Math.min(...xs) + 0.1; x < Math.max(...xs); x += 0.25) for (let y = Math.min(...ys) + 0.1; y < Math.max(...ys); y += 0.25) {
      if (pointInPolygon(p(x, y), pts) && distancePointContour(p(x, y), pts) > 0.1) expect(corps.some((c) => pointInPolygon(p(x, y), c.pts))).toBe(true);
    }
    const aire = (c: CorpsToit) => Math.hypot(c.pts[1]!.x - c.pts[0]!.x, c.pts[1]!.y - c.pts[0]!.y) * Math.hypot(c.pts[3]!.x - c.pts[0]!.x, c.pts[3]!.y - c.pts[0]!.y);
    expect(aire(plat)).toBeLessThan(35);
  });

  it('AE 103 sans recalage (une maison voisine eloignee) : des corps quand meme, plus des donnees brutes', () => {
    const r = releve('103');
    const corps = reconstruireCorps(r.toitMesure, r.contour, { grille: r.grille })!;
    expect(corps).toHaveLength(3);
    expect(Math.max(...corps.map((c) => c.faitage))).toBeGreaterThan(6.8);
    expect(corps.some((c) => c.faitage === c.egouts[0] && c.faitage < 4.2)).toBe(true);
  });

  it('met un cote de biais a l equerre par une marche au droit d un autre sommet', () => {
    // Un L dont l'angle haut-gauche est tranche en biais, de (0, 4) a (8, 8) ; un sommet a x = 5.
    const L = [p(0, 0), p(5, 0), p(5, 2), p(12, 2), p(12, 8), p(8, 8), p(0, 4)];
    const eq = contourEquerre(L)!;
    expect(eq).toEqual([p(0, 0), p(5, 0), p(5, 2), p(12, 2), p(12, 8), p(8, 8), p(5, 8), p(5, 4), p(0, 4)]);
    expect(contourEquerre([p(0, 0), p(6, 0), p(6, 4), p(0, 4)])).toBeNull();
    // Ses tranches : la partie basse a gauche, la partie haute a droite.
    const tranches = rectanglesEnTranches(eq)!;
    expect(tranches).toHaveLength(2);
  });

  it('lit une tranche a croupes par les formes simples : faitage dans la longueur, croupes a la pente des pans', () => {
    // Un quatre-pans de 10 x 6, egout 4 m, pente 35 degres.
    const pas = 0.5, x0 = -2, y0 = 8, nx = 29, ny = 21, k = Math.tan((35 * Math.PI) / 180);
    const z: number[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * pas, y = y0 - j * pas;
      const d = Math.min(x, 10 - x, y, 6 - y);
      z.push(d > 0 ? 4 + k * d : 0);
    }
    const c = corpsDepuisFormes({ pas, x0, y0, nx, ny, z }, [p(0, 6), p(0, 0), p(10, 0), p(10, 6)])!;
    expect(c.croupes).toEqual([3, 3]);
    expect(Math.round(Math.hypot(c.pts[1]!.x - c.pts[0]!.x, c.pts[1]!.y - c.pts[0]!.y))).toBe(10);
    expect(c.faitage).toBeCloseTo(4 + 3 * k, 0);
  });

  it('etend un corps en gardant sa forme : le long du faitage, croupes et hauteurs restent ; en travers, les pans gardent leur pente', () => {
    const c: CorpsToit = { pts: [p(0, 0), p(10, 0), p(10, 6), p(0, 6)], posFaitage: 3, faitage: 7, egouts: [4, 4], croupes: [3, 3], pignons: [], ecart: 0.2 };
    const long = corpsEtendu(c, { s0: 0, sL: 12, t0: 0, tW: 6 });
    expect(long).toMatchObject({ posFaitage: 3, faitage: 7, egouts: [4, 4], croupes: [3, 3] });
    expect(long.pts[1]).toEqual(p(12, 0));
    const large = corpsEtendu(c, { s0: 0, sL: 10, t0: -1, tW: 7 });
    // Le faitage reste en y = 3 ; chaque pan descend d'un metre de plus a sa pente (1 m par metre).
    expect(large).toMatchObject({ posFaitage: 4, faitage: 7, egouts: [3, 3], croupes: [4, 4] });
    expect(corpsEtendu(c, { s0: 0, sL: 10, t0: 0, tW: 6 })).toBe(c);
  });
});
