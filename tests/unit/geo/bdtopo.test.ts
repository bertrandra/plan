import { describe, it, expect } from 'vitest';
import {
  hauteurBatiment, hauteurVegetation, arbresEstimes, libelleParcelle,
  HAUTEUR_VEGETATION, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES
} from '../../../src/geo/bdtopo.js';

// Ces regles comblent les trous de la BD TOPO : ce sont des choix, pas des mesures. Les tests
// servent surtout a ce que personne ne les prenne pour des donnees et ne les « corrige ».

describe('hauteurBatiment', () => {
  it('retient la hauteur mesuree quand il y en a une', () => {
    expect(hauteurBatiment({ hauteur: '7,4', nombre_d_etages: '2' })).toBe(7.4);
  });

  it('lit les nombres a virgule francaise, comme les sert la BD TOPO', () => {
    // parseFloat('5,2') rend 5 : c'est le piege que nombreFr existe pour eviter.
    expect(hauteurBatiment({ hauteur: '5,2' })).toBe(5.2);
  });

  it('deduit la hauteur du nombre d etages quand elle manque', () => {
    expect(hauteurBatiment({ nombre_d_etages: '2' })).toBe(5.4);
  });

  it('arrondit la deduction au decimetre', () => {
    expect(hauteurBatiment({ nombre_d_etages: '3' })).toBe(8.1);
  });

  it('retombe sur 2,50 m plutot que sur un batiment plat', () => {
    // Une hauteur nulle donnerait une Vue 3D plate et une ombre inexistante : une estimation
    // avouee vaut mieux qu'un zero qui se fait passer pour une mesure.
    expect(hauteurBatiment({})).toBe(2.5);
    expect(hauteurBatiment({ hauteur: '0' })).toBe(2.5);
    expect(hauteurBatiment({ hauteur: null, nombre_d_etages: '0' })).toBe(2.5);
  });
});

describe('hauteurVegetation', () => {
  it('connait les natures de la BD TOPO', () => {
    expect(hauteurVegetation('Haie')).toBe(2);
    expect(hauteurVegetation('Forêt fermée de conifères')).toBe(18);
  });

  it('retombe sur 6 m pour une nature inconnue ou absente', () => {
    expect(hauteurVegetation('Bosquet imaginaire')).toBe(6);
    expect(hauteurVegetation(undefined)).toBe(6);
    expect(hauteurVegetation(null)).toBe(6);
  });

  it('garde les accents exacts des libelles IGN', () => {
    // Un libelle desaccentue ne correspondrait a rien et retomberait silencieusement sur 6 m.
    expect(Object.keys(HAUTEUR_VEGETATION)).toContain('Forêt fermée de feuillus');
    expect(hauteurVegetation('Foret fermee de feuillus')).toBe(6);
  });
});

describe('arbresEstimes', () => {
  const carre = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];

  it('donne exactement les memes arbres a chaque appel', () => {
    // C'est toute la raison du bruit deterministe : rouvrir un projet ne doit pas deplacer les
    // arbres, sinon les ombres changeraient sans que personne n'ait rien demande.
    const a = arbresEstimes(carre, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES);
    const b = arbresEstimes(carre, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('ne pose aucun arbre hors du polygone', () => {
    const triangle = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 40 }];
    const arbres = arbresEstimes(triangle, 5, 200);
    expect(arbres.every((a) => a.x + a.y < 40.0001)).toBe(true);
    expect(arbres.length).toBeGreaterThan(3);
  });

  it('respecte le plafond, meme sur un grand bois', () => {
    const grand = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 500 }, { x: 0, y: 500 }];
    expect(arbresEstimes(grand, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES)).toHaveLength(MAX_ARBRES_ESTIMES);
  });

  it('se densifie quand on resserre l espacement', () => {
    expect(arbresEstimes(carre, 4, 1000).length).toBeGreaterThan(arbresEstimes(carre, 10, 1000).length);
  });

  it('arrondit au centimetre', () => {
    const arbres = arbresEstimes(carre, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES);
    expect(arbres.every((a) => Math.abs(a.x * 100 - Math.round(a.x * 100)) < 1e-9)).toBe(true);
  });

  it('ne rend rien sur une forme trop petite pour la grille', () => {
    const minuscule = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }];
    expect(arbresEstimes(minuscule, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES)).toEqual([]);
  });
});

describe('libelleParcelle', () => {
  it('nettoie les zeros de tete du numero cadastral', () => {
    expect(libelleParcelle({ section: 'AE', numero: '0101', idu: '35238000AE0101' })).toBe('AE 101');
  });

  it('garde un numero qui n est que des zeros', () => {
    // Sans le repli, `'0'.replace(/^0+/,'')` rendrait la chaine vide et le libelle perdrait le numero.
    expect(libelleParcelle({ section: 'AE', numero: '0', idu: 'X' })).toBe('AE 0');
  });

  it('se passe de section', () => {
    expect(libelleParcelle({ numero: '42', idu: 'X' })).toBe('42');
  });

  it('retombe sur l identifiant unique quand il n y a ni section ni numero', () => {
    expect(libelleParcelle({ idu: '35238000AE0101' })).toBe('35238000AE0101');
  });
});
