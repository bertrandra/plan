import { describe, it, expect } from 'vitest';
import { projecteurLocal, TERRE_A, tuileX, tuileY, lonDeTuile, latDeTuile } from '../../src/geo/projection.js';
import { positionSoleil, decalageFuseauFrance } from '../../src/geo/soleil.js';

// Parcelle de reference du projet : 2 allee des limites, Le Vesinet.
const LAT = 48.9052;
const LON = 2.1328;

describe('projecteurLocal', () => {
  const proj = projecteurLocal(LAT, LON);

  it('place l origine exactement sur le point tangent', () => {
    expect(proj.versMetres(LON, LAT)).toEqual({ x: 0, y: 0 });
  });

  it('fait un aller-retour degres -> metres -> degres sans deriver', () => {
    const d = proj.versDegres(123.456, -78.9);
    const m = proj.versMetres(d.lon, d.lat);
    expect(m.x).toBeCloseTo(123.456, 9);
    expect(m.y).toBeCloseTo(-78.9, 9);
  });

  it('donne des echelles coherentes avec la latitude', () => {
    // A 48,9 degres, un degre de longitude fait environ 73 km et un degre de latitude 111 km.
    expect(proj.kx).toBeGreaterThan(72000);
    expect(proj.kx).toBeLessThan(74000);
    expect(proj.ky).toBeGreaterThan(111000);
    expect(proj.ky).toBeLessThan(112000);
    expect(proj.kx).toBeLessThan(proj.ky);
  });

  it('retombe sur le rayon equatorial a l equateur', () => {
    const equateur = projecteurLocal(0, 0);
    expect(equateur.kx).toBeCloseTo((TERRE_A * Math.PI) / 180, 6);
  });

  it('mesure 100 m avec moins d un millimetre d erreur sur l emprise utile', () => {
    // C'est la promesse du commentaire d'origine : exact au millimetre sous le kilometre.
    const cent = proj.versDegres(100, 0);
    const retour = proj.versMetres(cent.lon, cent.lat);
    expect(Math.abs(retour.x - 100)).toBeLessThan(0.001);
  });
});

describe('tuiles WMTS', () => {
  it('place Greenwich et l equateur au centre de la grille', () => {
    expect(tuileX(0, 1)).toBe(1);
    expect(tuileY(0, 1)).toBe(1);
  });
  it('fait un aller-retour indice -> degres -> indice', () => {
    const z = 19;
    const x = tuileX(LON, z), y = tuileY(LAT, z);
    expect(tuileX(lonDeTuile(x, z), z)).toBe(x);
    expect(tuileY(latDeTuile(y, z), z)).toBe(y);
  });
  it('double le nombre de tuiles a chaque niveau', () => {
    expect(tuileX(LON, 19)).toBe(Math.floor(tuileX(LON, 20) / 2));
  });
});

describe('decalageFuseauFrance', () => {
  it('rend UTC+1 en hiver et UTC+2 en ete', () => {
    expect(decalageFuseauFrance(2026, Date.UTC(2026, 0, 15, 12))).toBe(1);
    expect(decalageFuseauFrance(2026, Date.UTC(2026, 6, 15, 12))).toBe(2);
  });
  it('bascule au dernier dimanche de mars et d octobre', () => {
    // En 2026 : 29 mars et 25 octobre.
    expect(decalageFuseauFrance(2026, Date.UTC(2026, 2, 29, 0, 30))).toBe(1);
    expect(decalageFuseauFrance(2026, Date.UTC(2026, 2, 29, 1, 30))).toBe(2);
    expect(decalageFuseauFrance(2026, Date.UTC(2026, 9, 25, 0, 30))).toBe(2);
    expect(decalageFuseauFrance(2026, Date.UTC(2026, 9, 25, 1, 30))).toBe(1);
  });
});

describe('positionSoleil', () => {
  const degres = (rad: number) => (rad * 180) / Math.PI;

  it('met le soleil plus haut au solstice d ete qu au solstice d hiver', () => {
    const ete = positionSoleil(2026, 6, 21, 14, LAT, LON);
    const hiver = positionSoleil(2026, 12, 21, 13, LAT, LON);
    expect(degres(ete.elevRad)).toBeGreaterThan(60);
    expect(degres(hiver.elevRad)).toBeLessThan(20);
  });

  it('donne une hauteur negative en pleine nuit', () => {
    expect(positionSoleil(2026, 6, 21, 1, LAT, LON).elevRad).toBeLessThan(0);
  });

  it('place le soleil au sud a midi solaire, a l est le matin, a l ouest le soir', () => {
    // Azimut : 0 = Nord, 90 = Est, 180 = Sud, 270 = Ouest.
    expect(degres(positionSoleil(2026, 6, 21, 13, LAT, LON).azRad)).toBeGreaterThan(150);
    expect(degres(positionSoleil(2026, 6, 21, 13, LAT, LON).azRad)).toBeLessThan(210);
    expect(degres(positionSoleil(2026, 6, 21, 7, LAT, LON).azRad)).toBeLessThan(120);
    expect(degres(positionSoleil(2026, 6, 21, 19, LAT, LON).azRad)).toBeGreaterThan(240);
  });

  it('tient compte de l heure d ete : 14h en juillet est proche du midi solaire', () => {
    const midiLegal = positionSoleil(2026, 7, 15, 14, LAT, LON);
    const treize = positionSoleil(2026, 7, 15, 13, LAT, LON);
    expect(midiLegal.elevRad).toBeGreaterThan(treize.elevRad);
  });
});
