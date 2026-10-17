import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import {
  anneeDe, carreauxSelonEpoque, carreauxDesDetails, maconnerieSelonEpoque, poserFenetreEnCreux, poserPorteEnCreux, poserGarageEnCreux, poserMaconnerie, batisseursBaies, couleurPierre,
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

  it('le vitrage et l ouvrant vus l emportent sur l epoque ; sans eux, rien ne change', () => {
    const epoque = carreauxSelonEpoque(1900, 1.4);
    expect(carreauxDesDetails(undefined, 1.4, epoque)).toBe(epoque);
    expect(carreauxDesDetails({ volets: 'battants' }, 1.4, epoque)).toBe(epoque);
    expect(carreauxDesDetails({ vitrage: 'plein' }, 1.4, epoque)).toEqual({ colonnes: 2, rangs: 1 });
    expect(carreauxDesDetails({ vitrage: 'plein', ouvrant: 'fixe' }, 1.4, epoque)).toBe(null);
    expect(carreauxDesDetails({ vitrage: 'petits-bois' }, 1.4, null)).toEqual({ colonnes: 2, rangs: 3 });
    expect(carreauxDesDetails({ vitrage: 'petits-bois', ouvrant: 'guillotine' }, 1.4, null)).toEqual({ colonnes: 2, rangs: 4, traverse: true });
    expect(carreauxDesDetails({ ouvrant: 'guillotine' }, 1.4, epoque)).toEqual({ colonnes: 1, rangs: 2, traverse: true });
    expect(carreauxDesDetails({ vitrage: 'imposte-petits-bois' }, 1.4, null)).toEqual({ colonnes: 2, rangs: 1, imposte: { part: 0.3, colonnes: 4 } });
  });

  it('une imposte a petits bois : une traverse large, ses petits bois au-dessus seulement', () => {
    const b = batisseursBaies();
    poserFenetreEnCreux(b, pt, { x: 0, y: 1, l: 1.2, h: 1.4 }, { colonnes: 1, rangs: 1, imposte: { part: 0.3, colonnes: 4 } }, 6);
    const nu = batisseursBaies();
    poserFenetreEnCreux(nu, pt, { x: 0, y: 1, l: 1.2, h: 1.4 }, null, 6);
    // La traverse et trois petits bois : quatre paves de plus (20 sommets chacun).
    expect(sommets(b.menuiserie).length).toBe(sommets(nu.menuiserie).length + 4 * 20);
    const traverse = 1 + 1.4 - 0.06 - (1.4 - 0.12) * 0.3;
    const hautsBois = sommets(b.menuiserie).slice(sommets(nu.menuiserie).length + 20);
    expect(Math.min(...hautsBois.map((q) => q[1]))).toBeGreaterThan(traverse);
  });

  it('la porte vitree pose sa vitre a la place des panneaux, le garage suit son type', () => {
    const porte = (r?: 'vitree' | 'semi-vitree') => { const b = batisseursBaies(); poserPorteEnCreux(b, pt, { x: 0, y: 0, l: 1, h: 2.1 }, 6, r); return b; };
    expect(sommets(porte().vitre)).toHaveLength(0);
    expect(sommets(porte('vitree').vitre)).toHaveLength(4);
    expect(sommets(porte('vitree').porte).length).toBe(sommets(porte().porte).length - 2 * 20);
    expect(sommets(porte('semi-vitree').porte).length).toBe(sommets(porte().porte).length - 20);
    const garage = (g?: 'sectionnelle' | 'basculante' | 'battants' | 'enroulable') => { const b = batisseursBaies(); poserGarageEnCreux(b, pt, { x: 0, y: 0, l: 2.4, h: 2 }, 6, g); return sommets(b.porte).length; };
    expect(garage('sectionnelle')).toBe(garage());
    expect(garage('basculante')).toBe(4);
    expect(garage('battants')).toBe(4 + 20);
    expect(garage('enroulable')).toBeGreaterThan(garage());
  });
});
