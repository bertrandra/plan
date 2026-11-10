import { describe, it, expect } from 'vitest';
import { materiauMurs, couvertureDesFichiersFonciers, couleurMursRetenue, couleurMurDepuisPixels, MATERIAUX_MURS } from '../../../src/model/couleurMur.js';

// La couleur des murs (MD/spec-toit-ign.md §6.5) : le materiau des fichiers fonciers, la photo de rue
// quand ses pixels sont coherents, et la source retenue.

/** `n` points d'une couleur (RGBA a plat). */
const points = (n: number, rgb: [number, number, number]) => Array.from({ length: n }, () => [...rgb, 255]).flat();

describe('materiauMurs', () => {
  it('lit les deux chiffres des fichiers fonciers : le premier connu donne la teinte', () => {
    expect(materiauMurs('24')).toEqual({ code: '24', libelle: 'meulière et brique', couleur: MATERIAUX_MURS['2']!.couleur, texture: 'meuliere' });
    expect(materiauMurs('40')?.libelle).toBe('brique');
    expect(materiauMurs('10')?.libelle).toBe('pierre');
    expect(materiauMurs('05')?.libelle).toBe('aggloméré enduit');
    expect(materiauMurs('39')?.libelle).toBe('béton');
  });
  it('ni indetermine, ni « autre », ni vide ne disent un materiau', () => {
    for (const c of ['00', '90', '99', '', null, undefined, 'xx']) expect(materiauMurs(c)).toBeNull();
  });
  it('la toiture : tuiles, ardoises, zinc, beton', () => {
    expect(couvertureDesFichiersFonciers('10')).toBe('tuile');
    expect(couvertureDesFichiersFonciers('20')).toBe('ardoise');
    expect(couvertureDesFichiersFonciers('03')).toBe('zinc');
    expect(couvertureDesFichiersFonciers('90')).toBeNull();
  });
});

describe('couleurMursRetenue', () => {
  const photo = { couleur: '#D9D2C4', id: 'p', date: null, auteur: null, licence: null };
  const meuliere = { bdtopo: { materiauxMurs: '20' } };
  it('automatique : la photo, sinon le materiau, sinon la couleur du plan', () => {
    expect(couleurMursRetenue({ ...meuliere, batiment: { couleurMurs: { photo } } })).toEqual({ couleur: '#D9D2C4', source: 'photo' });
    expect(couleurMursRetenue({ ...meuliere, batiment: { couleurMurs: { photo: null } } })).toEqual({ couleur: MATERIAUX_MURS['2']!.couleur, source: 'materiau' });
    expect(couleurMursRetenue({ bdtopo: { materiauxMurs: '90' } })).toBeNull();
    expect(couleurMursRetenue({})).toBeNull();
  });
  it('choisie a la main : le materiau malgre la photo, ou la couleur du plan', () => {
    expect(couleurMursRetenue({ ...meuliere, batiment: { couleurMurs: { photo, source: 'materiau' } } })?.source).toBe('materiau');
    expect(couleurMursRetenue({ ...meuliere, batiment: { couleurMurs: { photo, source: 'plan' } } })).toBeNull();
    // La photo choisie mais absente : le materiau la remplace.
    expect(couleurMursRetenue({ ...meuliere, batiment: { couleurMurs: { source: 'photo' } } })?.source).toBe('materiau');
  });
});

describe('couleurMurDepuisPixels', () => {
  it('un enduit uni, quelques fenetres sombres : la teinte de l enduit', () => {
    const l = couleurMurDepuisPixels([...points(100, [217, 210, 196]), ...points(20, [30, 32, 35])]);
    expect(l.couleur).toBe('#D9D2C4');
    expect(l.coherence).toBeGreaterThan(0.8);
  });
  it('une facade au-dessus d une haie se lit sur ce qui en reste ; trop peu de facade : rien', () => {
    expect(couleurMurDepuisPixels([...points(60, [217, 210, 196]), ...points(70, [60, 110, 50])]).couleur).toBe('#D9D2C4');
    expect(couleurMurDepuisPixels([...points(25, [217, 210, 196]), ...points(105, [60, 110, 50])]).couleur).toBeNull();
  });
  it('le ciel : trop de points dessus, la photo ne montre pas ce mur ; une teinte froide n est pas une facade', () => {
    // Le ciel bleu se reconnait a sa couleur ; le ciel blanc ou couvert, la photo le signale (cielPhoto).
    expect(couleurMurDepuisPixels([...points(100, [217, 210, 196]), ...points(30, [120, 160, 220])]).couleur).toBeNull();
    expect(couleurMurDepuisPixels(points(100, [217, 210, 196]), 30).couleur).toBeNull();
    expect(couleurMurDepuisPixels(points(100, [217, 210, 196]), 10).couleur).toBe('#D9D2C4');
    expect(couleurMurDepuisPixels(points(120, [205, 212, 225])).couleur).toBeNull();
  });
  it('trop peu de points : rien', () => {
    expect(couleurMurDepuisPixels(points(20, [217, 210, 196])).couleur).toBeNull();
    // Des points hors de l'image (alpha nul) ne comptent pas.
    expect(couleurMurDepuisPixels([...points(30, [217, 210, 196]), ...Array(400).fill(0)]).couleur).toBeNull();
  });
  it('une haie de thuyas a l ombre (olive sombre) n est pas un mur ; une meuliere ou une brique le sont', () => {
    expect(couleurMurDepuisPixels(points(120, [70, 70, 49])).couleur).toBeNull();
    // Un enduit beige a l'ombre devient gris : on ne le prend pas pour un mur gris.
    expect(couleurMurDepuisPixels(points(120, [92, 90, 93])).couleur).toBeNull();
    expect(couleurMurDepuisPixels(points(120, [190, 188, 185])).couleur).toBe('#BEBCB9');
    expect(couleurMurDepuisPixels(points(120, [179, 137, 90])).couleur).toBe('#B3895A');
    expect(couleurMurDepuisPixels(points(120, [160, 82, 59])).couleur).toBe('#A0523B');
  });
  it('deux teintes melees (une voiture, une cloture devant) : rien', () => {
    expect(couleurMurDepuisPixels([...points(60, [217, 210, 196]), ...points(60, [150, 70, 50])]).couleur).toBeNull();
  });
});
