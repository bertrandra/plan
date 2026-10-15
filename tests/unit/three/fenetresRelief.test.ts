import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import {
  anneeDe, carreauxSelonEpoque, maconnerieSelonEpoque, poserFenetreEnCreux, poserMaconnerie, batisseursBaies, couleurPierre,
  ENCADREMENT, APPUI, LINTEAU_M, CORNICHE, type Point3
} from '../../../src/three/fenetresRelief.js';
import { Batisseur } from '../../../src/three/batisseur.js';

beforeAll(() => { Object.assign(globalThis, { THREE: THREE_NS }); });

// Un mur dans le plan x / y, la saillie en z : les sommets se lisent tels quels.
const pt: Point3 = (x, y, s) => [x, y, s];
const sommets = (b: Batisseur) => {
  const p = (b as unknown as { positions: number[] }).positions;
  const out: [number, number, number][] = [];
  for (let i = 0; i < p.length; i += 3) out.push([p[i] ?? 0, p[i + 1] ?? 0, p[i + 2] ?? 0]);
  return out;
};

describe('les facades de pres (R2)', () => {
  it('lit l annee d une date BD TOPO, et rien d absurde', () => {
    expect(anneeDe('1925-01-01')).toBe(1925);
    expect(anneeDe(1968)).toBe(1968);
    expect(anneeDe('')).toBeNull();
    expect(anneeDe('0000-01-01')).toBeNull();
    expect(anneeDe(null)).toBeNull();
  });

  it('les petits bois et la maconnerie suivent l epoque, rien sans epoque', () => {
    expect(carreauxSelonEpoque(1900, 1.4)).toEqual({ colonnes: 2, rangs: 3 });
    expect(carreauxSelonEpoque(1900, 0.9)).toEqual({ colonnes: 2, rangs: 2 });
    expect(carreauxSelonEpoque(1960, 1.4)).toEqual({ colonnes: 2, rangs: 1 });
    expect(carreauxSelonEpoque(1990, 1.4)).toBeNull();
    expect(carreauxSelonEpoque(null, 1.4)).toBeNull();
    expect(maconnerieSelonEpoque(1900)).toEqual({ corniche: true, bandeaux: true, chaines: true });
    expect(maconnerieSelonEpoque(1940)).toEqual({ corniche: true, bandeaux: true, chaines: false });
    expect(maconnerieSelonEpoque(1960)).toEqual({ corniche: true, bandeaux: false, chaines: false });
    expect(maconnerieSelonEpoque(null)).toEqual({ corniche: false, bandeaux: false, chaines: false });
  });

  it('creuse la baie : l encadrement avance, la vitre reste au nu du mur, l appui deborde', () => {
    const b = batisseursBaies();
    const o = { x: 2, y: 1, l: 1, h: 1.3 };
    poserFenetreEnCreux(b, pt, o, null, 6);
    const enc = sommets(b.encadrement), vit = sommets(b.vitre);
    expect(Math.max(...enc.map((s) => s[2]))).toBeCloseTo(ENCADREMENT.saillie + APPUI.saillie);
    expect(Math.max(...vit.map((s) => s[2]))).toBeLessThan(0.02);
    // La vitre couvre exactement la baie.
    expect(Math.min(...vit.map((s) => s[0]))).toBeCloseTo(o.x);
    expect(Math.max(...vit.map((s) => s[1]))).toBeCloseTo(o.y + o.h);
    // Le linteau monte au-dessus de la baie, l'appui descend en dessous.
    expect(Math.max(...enc.map((s) => s[1]))).toBeCloseTo(o.y + o.h + LINTEAU_M);
    expect(Math.min(...enc.map((s) => s[1]))).toBeCloseTo(o.y - APPUI.hauteur);
  });

  it('le linteau ne passe jamais l egout', () => {
    const b = batisseursBaies();
    poserFenetreEnCreux(b, pt, { x: 0, y: 4.5, l: 1, h: 1.3 }, null, 5.9);
    expect(Math.max(...sommets(b.encadrement).map((s) => s[1]))).toBeLessThanOrEqual(5.85 + 1e-9);
  });

  it('les petits bois ajoutent leurs barres a la menuiserie', () => {
    const sans = batisseursBaies(), avec = batisseursBaies();
    poserFenetreEnCreux(sans, pt, { x: 0, y: 1, l: 1, h: 1.4 }, null, 6);
    poserFenetreEnCreux(avec, pt, { x: 0, y: 1, l: 1, h: 1.4 }, { colonnes: 2, rangs: 3 }, 6);
    expect(sommets(avec.menuiserie).length).toBe(sommets(sans.menuiserie).length + 3 * 20);
  });

  it('la corniche court sous l egout, les bandeaux s ecartent des baies', () => {
    const b = new Batisseur();
    const baie = { x: 3, y: 2.6, l: 1, h: 1.3 };
    poserMaconnerie(b, pt, { largeur: 8, hauteur: 6 }, { corniche: true, bandeaux: true, chaines: false }, { n: 2, hauteur: 3 }, { gauche: false, droite: false }, [baie]);
    const s = sommets(b);
    expect(Math.max(...s.map((v) => v[1]))).toBeCloseTo(6);
    expect(s.some((v) => Math.abs(v[1] - (6 - CORNICHE.hauteur)) < 1e-9)).toBe(true);
    // Aucun sommet du bandeau (y autour de 3) dans l'emprise de la baie et de son encadrement.
    const bandeau = s.filter((v) => v[1] > 2.9 && v[1] < 3.1);
    expect(bandeau.length).toBeGreaterThan(0);
    expect(bandeau.every((v) => v[0] <= baie.x - ENCADREMENT.largeur + 1e-9 || v[0] >= baie.x + baie.l + ENCADREMENT.largeur - 1e-9)).toBe(true);
  });

  it('les chaines d angle ne se posent qu aux angles demandes', () => {
    const b = new Batisseur();
    poserMaconnerie(b, pt, { largeur: 6, hauteur: 3 }, { corniche: false, bandeaux: false, chaines: true }, { n: 1, hauteur: 3 }, { gauche: true, droite: false }, []);
    const s = sommets(b);
    expect(s.length).toBeGreaterThan(0);
    expect(Math.max(...s.map((v) => v[0]))).toBeLessThan(1);
  });

  it('la pierre est plus claire que le mur', () => {
    const p = couleurPierre(0x8a6a50);
    const m = new THREE_NS.Color(0x8a6a50);
    expect(p.r + p.g + p.b).toBeGreaterThan(m.r + m.g + m.b);
  });
});
