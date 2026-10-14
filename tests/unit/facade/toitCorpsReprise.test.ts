import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reconstruireCorps, contourEquerre, corpsDepuisFormes, corpsEtendu, decalageSurMesure, partVideSous, PART_VIDE_RECALAGE, PART_RECOUVERTE_MAX, LARGEUR_BANDE_M } from '../../../src/facade/toitCorps.js';
import { rectanglesEnTranches } from '../../../src/model/volumesToit.js';
import { toitMesureDepuisGrille } from '../../../src/model/toitMesure.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';
import { distancePointContour } from '../../../src/geometry/proximite.js';
import type { GrilleRelief } from '../../../src/model/relief.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../src/model/types.js';
import { corpsSelonFait } from '../../../src/facade/faitsToits.js';
import { faitDuBatiment } from '../../../src/model/faitsToits.js';

// La reprise des contours qui ne se decoupent pas tels quels (MD/spec-toit-ign.md §13.7), sur deux
// releves reels du Vesinet : AE 101, dont les corps ont ete valides et ne doivent pas bouger d'un
// centimetre, et AE 103, dont la BD TOPO trace la maison en biais et deux metres trop au nord.

interface Releve { contour: PtBrut[]; toitMesure: ToitMesure; corps: CorpsToit[] | null; grille: GrilleRelief; grilleLarge?: GrilleRelief; cleabs?: string; corpsAvecFaits?: CorpsToit[] }
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

  it('AE 101 avec ses faits : les corps d apres l appentis de la facade sud, au centimetre', () => {
    // La reference a change une fois, par decision de l'utilisateur (14 octobre 2026) : le calcul
    // ci-dessus ne bouge pas, le fait ajoute la galerie couverte de la facade sud.
    const r = releve('101');
    const fait = faitDuBatiment({ bdtopo: { cleabs: r.cleabs } });
    expect(fait).not.toBe(null);
    expect(corpsSelonFait(fait, reconstruireCorps(r.toitMesure, r.contour, { grille: r.grille }), r.toitMesure, r.contour, r.grille)).toEqual(r.corpsAvecFaits);
    expect(r.corpsAvecFaits).toHaveLength(4);
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

  it('AD 128 : deux pans sur la longueur, que le modele des corps ecrasait en travers', () => {
    // Le modele ecartait ce qui depasse le pan (un arbre sur un angle, le toit releve pour deux
    // fenetres d'etage) et posait un faitage a 7,3 m en travers, a 12 m sur 17,6 ; les formes
    // simples lisent le faitage dans la longueur, au milieu.
    const r = releve('28267696');
    const corps = reconstruireCorps(r.toitMesure, r.contour, { grille: r.grille })!;
    expect(corps).toHaveLength(1);
    const c = corps[0]!;
    const [a, b, d] = c.pts as [PtBrut, PtBrut, PtBrut, PtBrut];
    const L = Math.hypot(b.x - a.x, b.y - a.y), W = Math.hypot(d.x - b.x, d.y - b.y);
    expect(L).toBeGreaterThan(17);
    expect(W).toBeLessThan(8.5);
    expect(Math.abs(c.posFaitage - W / 2)).toBeLessThan(0.5);
    expect(c.faitage).toBeGreaterThan(8.5);
    expect(c.egouts[0]).toBe(c.egouts[1]);
    expect(c.egouts[0]).toBeGreaterThan(6);
    expect(c.egouts[0]).toBeLessThan(7.2);
    // Et en version allegee (un voisin loin du projet), le meme toit.
    expect(reconstruireCorps(r.toitMesure, r.contour, { grille: r.grille, coupes: false })).toEqual(corps);
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

  it('Gordes : une maison de village aux angles non droits recoit un toit construit, a un pan, decoupe sur son contour', () => {
    for (const k of ['16860179', '16860044']) {
      const r = JSON.parse(readFileSync(new URL(`../../fixtures/toits/gordes-${k}.json`, import.meta.url), 'utf8')) as Releve;
      // Le contour ne se decoupe pas en rectangles : sans le dernier recours, la surface brute.
      const corps = reconstruireCorps(toitMesureDepuisGrille(r.grille, r.contour)!, r.contour, { grille: r.grille, coupes: false })!;
      expect(corps).toHaveLength(1);
      const c = corps[0]!;
      const W = Math.hypot(c.pts[3]!.x - c.pts[0]!.x, c.pts[3]!.y - c.pts[0]!.y);
      // Un pan : le faitage sur un mur.
      expect(c.posFaitage === 0 || Math.abs(c.posFaitage - W) < 0.02).toBe(true);
      expect(c.faitage - Math.min(...c.egouts)).toBeGreaterThan(0.8);
      expect(c.pignons).toEqual([]);
    }
  });

  // Un village du Pas-de-Calais (place de la Mairie, Hucqueliers) : longeres en brique, pavillons
  // hauts aux bouts d'un corps bas, annexes basses.
  const hucqueliers = (k: string, coupes: boolean) => {
    const r = JSON.parse(readFileSync(new URL(`../../fixtures/toits/hucqueliers-${k}.json`, import.meta.url), 'utf8')) as Releve;
    return { r, corps: reconstruireCorps(toitMesureDepuisGrille(r.grille, r.contour)!, r.contour, { grille: r.grille, coupes })! };
  };
  const dimsDe = (c: CorpsToit) => [Math.hypot(c.pts[1]!.x - c.pts[0]!.x, c.pts[1]!.y - c.pts[0]!.y), Math.hypot(c.pts[3]!.x - c.pts[0]!.x, c.pts[3]!.y - c.pts[0]!.y)] as const;

  it('Hucqueliers : un toit complete ne suit pas la lisiere d une aile de biais, ni ne couvre l annexe basse', () => {
    // L : l'aile nord s'etirait de 5 m sur la cour le long de sa voisine, egout a -1,3 m.
    const { corps: l } = hucqueliers('37248520', false);
    l.forEach((c) => expect(Math.min(...c.egouts)).toBeGreaterThanOrEqual(2));
    const aile = l.find((c) => c.faitage > 4)!;
    expect(Math.min(...dimsDe(aile))).toBeLessThan(6);
    // Le toit a 8,6 m de la maison ne couvre plus son annexe a 3 m : elle garde son appentis.
    const { corps: m } = hucqueliers('37248524', false);
    const maison = m.find((c) => c.faitage > 8)!;
    expect(maison.egouts).toEqual([6.6, 6.6]);
    expect(pointInPolygon(p(-93, -2.5), maison.pts)).toBe(false);
    expect(m.some((c) => c.faitage < 4.5 && pointInPolygon(p(-93, -2.5), c.pts))).toBe(true);
  });

  it('Hucqueliers : une aile presque sous un rectangle plus grand n est plus debitee en bandes de 2 m', () => {
    for (const [k, coupes, avant] of [['37248484', true, 10], ['37248548', false, 10]] as const) {
      const { r, corps } = hucqueliers(k, coupes);
      expect(corps.length).toBeLessThan(avant);
      // Aucune bande de moins de 3 m que les autres corps recouvrent : des pignons en double en 3D.
      for (const c of corps) {
        const [L, W] = dimsDe(c);
        if (Math.min(L, W) >= LARGEUR_BANDE_M) continue;
        let n = 0, sous = 0;
        for (let a = 0.25; a < L; a += 0.5) for (let b = 0.25; b < W; b += 0.5) {
          const q = p(c.pts[0]!.x + ((c.pts[1]!.x - c.pts[0]!.x) * a) / L + ((c.pts[3]!.x - c.pts[0]!.x) * b) / W, c.pts[0]!.y + ((c.pts[1]!.y - c.pts[0]!.y) * a) / L + ((c.pts[3]!.y - c.pts[0]!.y) * b) / W);
          if (!pointInPolygon(q, r.contour)) continue;
          n++;
          if (corps.some((o) => o !== c && pointInPolygon(q, o.pts))) sous++;
        }
        expect(sous / n).toBeLessThanOrEqual(PART_RECOUVERTE_MAX);
      }
    }
    // Le pavillon ouest de la longere : son aile nord reste entiere (4,4 m), sur le toit a 11 m.
    const { corps } = hucqueliers('37248484', true);
    expect(corps.some((c) => c.faitage === 11)).toBe(true);
    expect(corps.some((c) => Math.abs(Math.min(...dimsDe(c)) - 4.4) < 0.05)).toBe(true);
  });
});
