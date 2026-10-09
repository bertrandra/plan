import { describe, it, expect } from 'vitest';
import { arbreNu, houppier, houppierDe, portDe, essenceDe, portParNature, PORTS } from '../../../src/model/arbre.js';

describe('port et essence', () => {
  it('reviennent au defaut quand le champ manque ou est inconnu', () => {
    expect(portDe({})).toBe('rond');
    expect(portDe({ portArbre: 'conique' })).toBe('conique');
    expect(portDe({ portArbre: 'boule' as never })).toBe('rond');
    expect(essenceDe({})).toBe('caduc');
    expect(essenceDe({ essenceArbre: 'persistant' })).toBe('persistant');
  });
  it('se devinent de la nature BD TOPO', () => {
    expect(portParNature('Forêt fermée de conifères')).toEqual({ port: 'conique', essence: 'persistant' });
    expect(portParNature('Bois de conifères').port).toBe('conique');
    expect(portParNature('Verger')).toEqual({ port: 'etale', essence: 'caduc' });
    expect(portParNature('Haie').port).toBe('colonnaire');
    expect(portParNature('Peupleraie')).toEqual({ port: 'colonnaire', essence: 'caduc' });
    expect(portParNature('Bois')).toEqual({ port: 'rond', essence: 'caduc' });
    expect(portParNature(undefined).port).toBe('rond');
  });
});

describe('arbreNu', () => {
  it('un caduc est nu de novembre a mars, jamais un persistant', () => {
    expect(arbreNu('caduc', '2026-11-01')).toBe(true);
    expect(arbreNu('caduc', '2027-01-15')).toBe(true);
    expect(arbreNu('caduc', '2027-03-31')).toBe(true);
    expect(arbreNu('caduc', '2027-04-01')).toBe(false);
    expect(arbreNu('caduc', '2026-10-09')).toBe(false);
    expect(arbreNu('persistant', '2027-01-15')).toBe(false);
  });
  it('une date illisible laisse l arbre en feuilles', () => {
    expect(arbreNu('caduc', '')).toBe(false);
    expect(arbreNu('caduc', null)).toBe(false);
    expect(arbreNu('caduc', 'hier')).toBe(false);
  });
});

describe('houppier', () => {
  const dansLeDiametre = (port: (typeof PORTS)[number], d: number) => {
    const h = houppier(port, d, 42);
    return h.lobes.every((l) => Math.hypot(l.x, l.z) + Math.max(l.rx, l.rz) <= d / 2 * 1.02 + 1e-9);
  };
  it('est reproductible pour la meme graine, different pour une autre', () => {
    expect(houppier('rond', 4, 7)).toEqual(houppier('rond', 4, 7));
    expect(houppier('rond', 4, 7)).not.toEqual(houppier('rond', 4, 8));
    expect(houppierDe({ key: 'a', portArbre: 'rond', diametreArbre: 4 })).toEqual(houppierDe({ key: 'a', portArbre: 'rond', diametreArbre: 4 }));
  });
  it('un rond est aussi haut que large, un colonnaire bien plus haut, un etale et un parasol plus bas', () => {
    expect(houppier('rond', 4, 1).hauteur).toBeCloseTo(4, 9);
    expect(houppier('colonnaire', 2, 1).hauteur).toBeGreaterThan(4);
    expect(houppier('etale', 6, 1).hauteur).toBeLessThan(4);
    expect(houppier('parasol', 6, 1).hauteur).toBeLessThan(3);
  });
  it('un conique est un seul lobe en pointe, sans branche', () => {
    const h = houppier('conique', 3, 1);
    expect(h.lobes).toHaveLength(1);
    expect(h.branches).toHaveLength(0);
    expect(h.lobes[0]!.rx).toBeCloseTo(1.5, 9);
    expect(h.lobes[0]!.ry * 2).toBeCloseTo(h.hauteur, 9);
  });
  it('les lobes tiennent dans le diametre et les branches vont du tronc vers chaque satellite', () => {
    for (const port of PORTS) expect(dansLeDiametre(port, 5), port).toBe(true);
    const h = houppier('rond', 5, 3);
    expect(h.lobes.length).toBe(7);
    expect(h.branches.length).toBe(6);
    for (const b of h.branches) {
      expect(b.de).toEqual({ x: 0, y: -0.05, z: 0 });
      expect(b.a.y).toBeGreaterThan(0);
      expect(b.rayon).toBeGreaterThan(0);
    }
    // Le lobe central est au milieu, les satellites autour.
    expect(h.lobes[0]!.x).toBe(0);
    expect(h.lobes.slice(1).every((l) => Math.hypot(l.x, l.z) > 0.3)).toBe(true);
  });
  it('un diametre absent ou nul vaut 3 m', () => {
    expect(houppierDe({ key: 'k' }).hauteur).toBeCloseTo(3, 9);
    expect(houppierDe({ key: 'k', diametreArbre: 0 }).hauteur).toBeCloseTo(3, 9);
  });
});
