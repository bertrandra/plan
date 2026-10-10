import { describe, it, expect } from 'vitest';
import { toitMesureDepuisGrille, hauteurToitMesure, egoutDansRect, modeToitActif, hauteurMurMesuree, decouperParHauteur, decouperParHauteurs, SEUIL_MARCHE_M, LARGEUR_BLOC_MIN_M, nettoyer, boucher, lisser, SAILLIE_M, DEPASSEMENT_M, SOL_M, RETRAIT_EGOUT_M, SOUS_EGOUT_M, CELLULES_MIN } from '../../../src/model/toitMesure.js';
import type { GrilleRelief } from '../../../src/model/relief.js';
import type { PtBrut, ToitMesure, VolumeToit } from '../../../src/model/types.js';

// Le toit tel que le LiDAR le mesure (MD/spec-toit-ign.md §12) : la grille du MNH recadree sur le
// contour, nettoyee des arbres et des trous, et ce qu'on en lit (egout, faite, hauteur en un point).

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const maison = rect(0, 0, 8, 6);

/** Une grille a 50 cm, 0,75 m de marge autour de l'emprise (les cellules a 25 cm des murs), dont `z(x, y)` donne la hauteur ; 0 au sol. */
function grille(emprise: readonly PtBrut[], z: (x: number, y: number) => number | null, pas = 0.5): GrilleRelief {
  const xs = emprise.map((q) => q.x), ys = emprise.map((q) => q.y);
  const x0 = Math.min(...xs) - 0.75, y0 = Math.max(...ys) + 0.75;
  const nx = Math.round((Math.max(...xs) + 0.75 - x0) / pas) + 1, ny = Math.round((y0 - (Math.min(...ys) - 0.75)) / pas) + 1;
  const out: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push(z(x0 + i * pas, y0 - j * pas));
  return { pas, x0, y0, nx, ny, z: out };
}
const dedans = (x: number, y: number, r: readonly PtBrut[]) => x > r[0]!.x && x < r[2]!.x && y > r[0]!.y && y < r[2]!.y;

describe('toitMesureDepuisGrille', () => {
  it('recadre la grille sur les cellules du contour, lit l egout et le faite', () => {
    const t = toitMesureDepuisGrille(grille(maison, (x, y) => (dedans(x, y, maison) ? 5 : 0)), maison)!;
    expect(t).not.toBeNull();
    expect(t.source).toBe('lidar');
    expect(t.pas).toBe(0.5);
    // 8 m de long : les cellules de 0,25 a 7,75, soit 16 colonnes ; 6 m de haut : 12 lignes.
    expect([t.nx, t.ny]).toEqual([16, 12]);
    expect(t.x0).toBeCloseTo(0.25, 9);
    expect(t.y0).toBeCloseTo(5.75, 9);
    expect(t.egout).toBe(5);
    expect(t.faite).toBe(5);
    // Hors du contour, rien ; au mur, la surface prolonge les cellules presentes.
    expect(t.z.filter((v) => v === null)).toHaveLength(0);
    expect(hauteurToitMesure(t, 0, 3)).toBeCloseTo(5, 6);
  });

  it('efface un arbre qui couvre un coin, une cheminee, un trou, le sol vu a travers et le mur vu de biais', () => {
    const z = (x: number, y: number): number | null => {
      if (!dedans(x, y, maison)) return 0;
      if (x <= 2 && y <= 2) return 10 + x + y; // un arbre sur 4 x 4 cellules, bien au-dessus du toit
      if (x === 6 && y === 2) return 7.5; // une cheminee
      if (x === 5 && y === 3) return null; // pas de donnee
      if (x === 6 && y === 4) return 0.2; // le sol
      if (x === 7.75) return 1.6; // le mur est, vu de biais
      return 5;
    };
    const t = toitMesureDepuisGrille(grille(maison, z), maison)!;
    expect(t.faite).toBe(5);
    expect(t.egout).toBe(5);
    [[1, 1], [2, 2], [0.5, 0.5], [6, 2], [5, 3], [6, 4], [7.75, 3]].forEach(([x, y]) => expect(hauteurToitMesure(t, x!, y!), x + ',' + y).toBeCloseTo(5, 6));
    expect(SAILLIE_M).toBe(2);
    expect(DEPASSEMENT_M).toBe(1);
    expect(SOL_M).toBe(0.5);
    expect(RETRAIT_EGOUT_M).toBe(0.5);
    expect(SOUS_EGOUT_M).toBe(0.3);
  });

  it('garde un vrai relief : un corps haut et une aile basse, et lit l egout de chacun', () => {
    const corps = rect(0, 0, 8, 6), aile = rect(8, 0, 5, 4);
    const L = [p(0, 0), p(13, 0), p(13, 4), p(8, 4), p(8, 6), p(0, 6)];
    const t = toitMesureDepuisGrille(grille(L, (x, y) => (dedans(x, y, corps) ? 7 : dedans(x, y, aile) ? 3.5 : 0)), L)!;
    expect(t.egout).toBe(3.5);
    expect(t.faite).toBe(7);
    expect(hauteurToitMesure(t, 4, 3)).toBeCloseTo(7, 6);
    expect(hauteurToitMesure(t, 11, 2)).toBeCloseTo(3.5, 6);
    expect(egoutDansRect(t, corps, L)).toBe(7);
    expect(egoutDansRect(t, aile, L)).toBe(3.5);
    expect(egoutDansRect(t, aile)).toBe(3.5);
    // Un rectangle sans cellule : l'egout du toit entier.
    expect(egoutDansRect(t, rect(50, 50, 1, 1))).toBe(3.5);
  });

  it('renonce quand le LiDAR n y voit pas de toit : trop petit, ou le sol partout', () => {
    expect(toitMesureDepuisGrille(grille(rect(0, 0, 1.5, 1.5), () => 5), rect(0, 0, 1.5, 1.5))).toBeNull();
    expect(toitMesureDepuisGrille(grille(maison, () => 0), maison)).toBeNull();
    expect(toitMesureDepuisGrille(grille(maison, () => null), maison)).toBeNull();
    expect(toitMesureDepuisGrille(grille(maison, () => 5), [p(0, 0), p(1, 0)])).toBeNull();
    expect(CELLULES_MIN).toBe(20);
  });
});

describe('nettoyer, boucher et lisser', () => {
  it('une saillie isolee revient a ses voisines, un trou se bouche, une cellule sans voisines reste nulle', () => {
    const z = [5, 5, 5, 5, 9, 5, 5, 5, 5];
    expect(nettoyer(z, 3, 3)[4]).toBe(5);
    expect(nettoyer([5, 5, 5, 5, null, 5, 5, 5, 5], 3, 3)[4]).toBe(5);
    expect(nettoyer([5, 5, 5, 5, 30, 5, 5, 5, 5], 3, 3, 8)[4]).toBe(5);
    expect(nettoyer([null, null, null, null, 5, null, null, null, null], 3, 3)).toEqual([null, null, null, null, 5, null, null, null, null]);
    // Un grand trou se bouche de proche en proche depuis ses bords.
    const grand: (number | null)[] = Array.from({ length: 49 }, (_, k) => (k % 7 === 0 || k % 7 === 6 || k < 7 || k >= 42 ? 4 : null));
    expect(boucher(grand, 7, 7).every((v) => v === 4)).toBe(true);
    // Lisse, une grille plate le reste et une marche s'arrondit sur une cellule.
    expect(lisser([5, 5, 5, 5, 5, 5, 5, 5, 5], 3, 3)).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 5]);
  });
});

describe('hauteurToitMesure', () => {
  const t: ToitMesure = { pas: 1, x0: 0, y0: 1, nx: 2, ny: 2, z: [4, 6, 4, 6], egout: 4, faite: 6, source: 'lidar' };
  it('interpole entre les cellules, prend les voisines presentes pour une cellule manquante, rien hors grille', () => {
    expect(hauteurToitMesure(t, 0.5, 0.5)).toBeCloseTo(5, 9);
    expect(hauteurToitMesure(t, 0, 1)).toBeCloseTo(4, 9);
    expect(hauteurToitMesure({ ...t, z: [4, null, 4, 6] }, 0.5, 0.5)).toBeCloseTo((4 + 4 + 6 + 14 / 3) / 4, 9);
    expect(hauteurToitMesure(t, 10, 10)).toBeNull();
  });
});

describe('modeToitActif', () => {
  const v = (n: number): VolumeToit[] => Array.from({ length: n }, () => ({ pts: maison, toit: { forme: 'deux-pans', hauteur: 2, angleFaitage: 0 } }));
  const t: ToitMesure = { pas: 0.5, x0: 0, y0: 6, nx: 2, ny: 2, z: [5, 5, 5, 5], egout: 5, faite: 5, source: 'lidar' };
  it('la surface mesuree quand elle existe, sinon les corps quand il y en a deux, sinon le toit unique ; le choix l emporte', () => {
    expect(modeToitActif({})).toBe('simple');
    expect(modeToitActif({ volumesToit: v(1) })).toBe('simple');
    expect(modeToitActif({ volumesToit: v(2) })).toBe('volumes');
    expect(modeToitActif({ toitMesure: t })).toBe('mesure');
    expect(modeToitActif({ toitMesure: t, volumesToit: v(2) })).toBe('mesure');
    expect(modeToitActif({ toitMesure: t, volumesToit: v(2), modeToit: 'volumes' })).toBe('volumes');
    expect(modeToitActif({ toitMesure: t, volumesToit: v(2), modeToit: 'simple' })).toBe('simple');
    // Un choix que l'objet ne peut pas honorer retombe sur ce qu'il a.
    expect(modeToitActif({ toitMesure: t, modeToit: 'volumes' })).toBe('simple');
    expect(modeToitActif({ volumesToit: v(2), modeToit: 'mesure' })).toBe('volumes');
    // Les corps et pignons l'emportent quand ils existent ; « tel que mesure » se choisit encore.
    const corps = [{}];
    expect(modeToitActif({ toitMesure: t, volumesToit: v(2), corpsToit: corps })).toBe('corps');
    expect(modeToitActif({ toitMesure: t, corpsToit: corps, modeToit: 'mesure' })).toBe('mesure');
    expect(modeToitActif({ toitMesure: t, corpsToit: corps, modeToit: 'simple' })).toBe('simple');
    expect(modeToitActif({ corpsToit: [], toitMesure: t })).toBe('mesure');
  });
});

describe('les murs et les marches de la couverture (spec-toit-ign §11.2, §12.3)', () => {
  const marche = rect(0, 0, 14, 6);
  /** Un rectangle de 14 x 6 : deux niveaux a gauche de x = 8 (couverture a 7 m), un seul a droite (3,5 m). */
  const t = toitMesureDepuisGrille(grille(marche, (x, y) => (dedans(x, y, marche) ? (x < 8 ? 7 : 3.5) : 0)), marche)!;

  it('la hauteur d un mur est celle ou la couverture le rejoint', () => {
    // Le mur sud (cote 0) court sous les deux niveaux : son dixieme centile est le bas, 3,5 m ; le mur ouest (cote 3) est a 7 m.
    expect(hauteurMurMesuree(t, marche, 0)).toBe(3.5);
    expect(hauteurMurMesuree(t, marche, 3)).toBe(7);
    expect(hauteurMurMesuree(t, marche, 1)).toBe(3.5);
    expect(hauteurMurMesuree(t, rect(50, 50, 4, 4), 0)).toBeNull();
  });

  it('coupe un rectangle la ou la couverture fait une marche, pas sous un pan en pente', () => {
    const deux = decouperParHauteur(t, marche)!;
    expect(deux).not.toBeNull();
    const [a, b] = deux;
    expect(a[1]!.x).toBeCloseTo(8, 1);
    expect(b[0]!.x).toBeCloseTo(8, 1);
    expect(a.map((q) => q.y)).toEqual([0, 0, 6, 6]);
    expect(SEUIL_MARCHE_M).toBe(0.8);
    expect(LARGEUR_BLOC_MIN_M).toBe(1.5);
    // Un appentis qui monte de 3 a 6 m sur 14 m, ou un deux-pans : aucune marche.
    const pente = toitMesureDepuisGrille(grille(marche, (x, y) => (dedans(x, y, marche) ? 3 + (3 * x) / 14 : 0)), marche)!;
    expect(decouperParHauteur(pente, marche)).toBeNull();
    const deuxPans = toitMesureDepuisGrille(grille(marche, (x, y) => (dedans(x, y, marche) ? 4 + 2 * (1 - Math.abs(y - 3) / 3) : 0)), marche)!;
    expect(decouperParHauteur(deuxPans, marche)).toBeNull();
    // Une marche a 1 m du bord ne fait pas un bloc.
    const bord = toitMesureDepuisGrille(grille(marche, (x, y) => (dedans(x, y, marche) ? (x < 1 ? 7 : 3.5) : 0)), marche)!;
    expect(decouperParHauteur(bord, marche)).toBeNull();
  });

  it('recoupe les rectangles d un contour, et oublie un morceau qu un autre rectangle couvre deja', () => {
    const blocs = decouperParHauteurs(t, [marche]);
    expect(blocs).toHaveLength(2);
    expect(blocs.map((r) => Math.round(Math.abs(r[1]!.x - r[0]!.x)))).toEqual([8, 6]);
    // Un corps et une aile qui le penetre : le corps recoupe a la marche de l'aile rend un morceau que l'aile couvre deja.
    const corps = rect(0, 0, 12, 8), aile = rect(8, 0, 4, 14);
    const L = [p(0, 0), p(12, 0), p(12, 14), p(8, 14), p(8, 8), p(0, 8)];
    const tl = toitMesureDepuisGrille(grille(L, (x, y) => (dedans(x, y, aile) ? 3.5 : dedans(x, y, corps) ? 7 : 0)), L)!;
    const blocsL = decouperParHauteurs(tl, [corps, aile]);
    expect(blocsL).toHaveLength(2);
    expect(blocsL[0]!.map((q) => q.x)).toEqual([0, 8, 8, 0]);
    expect(blocsL[1]).toEqual(aile);
  });
});
