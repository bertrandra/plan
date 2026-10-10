import { describe, it, expect } from 'vitest';
import { arbreNu, houppier, houppierDe, portDe, essenceDe, portParNature, PORTS, feuillesDuHouppier, dansLobe, aireEllipsoide, MAX_FEUILLES_PAR_ARBRE, TAILLE_FEUILLE_MIN_M, TAILLE_FEUILLE_MAX_M } from '../../../src/model/arbre.js';

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

describe('feuillesDuHouppier', () => {
  it('est reproductible, plafonnee, et des feuilles de taille lisible', () => {
    const h = houppier('rond', 4, 9);
    const a = feuillesDuHouppier(h, 'rond', 9);
    expect(a).toEqual(feuillesDuHouppier(h, 'rond', 9));
    expect(a.forme).toBe('feuille');
    expect(a.feuilles.length).toBeGreaterThan(200);
    expect(a.feuilles.length).toBeLessThanOrEqual(MAX_FEUILLES_PAR_ARBRE);
    expect(a.taille).toBeGreaterThanOrEqual(TAILLE_FEUILLE_MIN_M);
    expect(a.taille).toBeLessThanOrEqual(TAILLE_FEUILLE_MAX_M);
  });
  it('pose chaque feuille sur la surface d un lobe, hors des autres, la normale vers l exterieur', () => {
    const h = houppier('rond', 4, 9);
    const { feuilles, taille } = feuillesDuHouppier(h, 'rond', 9);
    for (const f of feuilles) {
      expect(Math.hypot(f.nx, f.ny, f.nz)).toBeCloseTo(1, 9);
      // Le point d'attache, ramene de son decollement, est sur un lobe et dans aucun autre.
      const d = taille * 0.2 + 1e-9;
      const valeurs = h.lobes.map((l) => dansLobe(l, f.x - f.nx * d, f.y - f.ny * d, f.z - f.nz * d));
      expect(Math.min(...valeurs)).toBeLessThanOrEqual(1.0001);
      expect(h.lobes.map((l) => dansLobe(l, f.x, f.y, f.z)).every((v) => v >= 0.9)).toBe(true);
      expect(f.echelle).toBeGreaterThan(0.7);
      expect(f.teinte).toBeGreaterThan(0.8);
    }
  });
  it('un conifere porte des aiguilles sur son cone, la normale vers le haut et le dehors', () => {
    const h = houppier('conique', 3, 2);
    const a = feuillesDuHouppier(h, 'conique', 2);
    expect(a.forme).toBe('aiguille');
    const l = h.lobes[0]!;
    for (const f of a.feuilles) {
      expect(f.ny).toBeGreaterThan(0);
      expect(f.y).toBeGreaterThanOrEqual(l.y - l.ry - 1e-9);
      expect(f.y).toBeLessThanOrEqual(l.y + l.ry + a.taille);
    }
  });
  it('un grand arbre ne depasse pas le plafond, ses feuilles grandissent', () => {
    const petit = feuillesDuHouppier(houppier('rond', 2, 1), 'rond', 1);
    const grand = feuillesDuHouppier(houppier('rond', 10, 1), 'rond', 1);
    expect(grand.feuilles.length).toBeLessThanOrEqual(MAX_FEUILLES_PAR_ARBRE);
    expect(grand.taille).toBeGreaterThan(petit.taille);
  });
  it('aireEllipsoide : une sphere de rayon 1 vaut 4 pi', () => {
    expect(aireEllipsoide({ rx: 1, ry: 1, rz: 1 })).toBeCloseTo(4 * Math.PI, 6);
  });
});
