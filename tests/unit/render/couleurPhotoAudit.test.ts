import { describe, it, expect } from 'vitest';
import { pointDansPhoto, pointsCentrauxDuMur, lireFacadeSurPhoto, teinteAuToucher, HAUTEUR_TELEPHONE_M, type VueAudit } from '../../../src/render/couleurPhotoAudit.js';
import { pointDansImage, obstacle, HAUTEUR_CAMERA_M, type Pixels } from '../../../src/render/couleurMurPhoto.js';
import type { PhotoRue } from '../../../src/geo/panoramax.js';
import type { PtBrut } from '../../../src/model/types.js';
import { photoDeSynthese, enduit, ecartHex, type Pan, type Rgb } from './photoSynthese.js';

// La couleur d'une facade sur une photo de l'audit (MD/spec-audit.md §6.2) : la projection d'une photo
// plate prise a la main (focale, inclinaison, roulis), la moitie centrale du mur, les clotures, et la
// teinte au toucher, sur des photos de synthese d'un mur de couleur connue.

const p = (x: number, y: number): PtBrut => ({ x, y });
const W = 480, H = 360;
/** Une facade sud de 10 m (de x = 0 a 10, en y = 0), egout a 6 m, enduit beige avec deux fenetres. */
const BEIGE: Rgb = [201, 180, 154];
const FENETRES = [{ s0: 0.3, s1: 0.4, z0: 3.4, z1: 4.8 }, { s0: 0.6, s1: 0.7, z0: 3.4, z1: 4.8 }];
const facade = (couleur: (s: number, z: number) => Rgb = enduit(BEIGE, FENETRES)): Pan => ({ a: p(0, 0), b: p(10, 0), z0: 0, z1: 6, couleur });
const MUR = { a: p(0, 0), b: p(10, 0), egout: 6 };
/** Plein sud de la facade, a 12 m, vers le nord : elle est au milieu de la photo. */
const vue = (plus: Partial<VueAudit> = {}): VueAudit => ({ x: 5, y: -12, azimutDeg: 0, inclinaisonDeg: 0, roulisDeg: 0, champDeg: 69, ...plus });

describe('pointDansPhoto', () => {
  it('telephone d aplomb : la projection plate de Panoramax', () => {
    const photo = { id: 'x', lat: 0, lon: 0, azimut: 30, champ: 60, panoramique: false } as PhotoRue;
    const v: VueAudit = { x: 1, y: 2, azimutDeg: 30, champDeg: 60, inclinaisonDeg: 0, roulisDeg: 0 };
    for (const q of [{ x: 6, y: 12, z: 4 }, { x: 3, y: 15, z: 1 }, { x: 9, y: 9, z: 3 }]) {
      const a = pointDansImage({ photo, x: 1, y: 2 }, q, 1200, 900)!;
      const b = pointDansPhoto(v, q, 1200, 900, HAUTEUR_CAMERA_M)!;
      expect(b.u).toBeCloseTo(a.u, 6);
      expect(b.v).toBeCloseTo(a.v, 6);
    }
  });

  it('le champ se lit sur le grand cote : en portrait, sur la hauteur', () => {
    // Un point a mi-champ, a droite : au bord de l'image en paysage ; en portrait, le champ porte
    // sur la hauteur, la largeur en voit moins et le point en sort.
    const q = { x: 5 + 12 * Math.tan((30 * Math.PI) / 180), y: 0, z: HAUTEUR_TELEPHONE_M };
    expect(pointDansPhoto(vue({ champDeg: 61 }), q, 1200, 900)!.u).toBeGreaterThan(1150);
    expect(pointDansPhoto(vue({ champDeg: 61 }), q, 900, 1200)).toBeNull();
  });

  it('visee inclinee vers le haut : le point vise est au centre, l horizon descend', () => {
    const haut = { x: 5, y: 0, z: HAUTEUR_TELEPHONE_M + 12 * Math.tan((10 * Math.PI) / 180) };
    const c = pointDansPhoto(vue({ inclinaisonDeg: 10 }), haut, W, H)!;
    expect(c.u).toBeCloseTo(W / 2, 6);
    expect(c.v).toBeCloseTo(H / 2, 6);
    const horizon = pointDansPhoto(vue({ inclinaisonDeg: 10 }), { x: 5, y: 0, z: HAUTEUR_TELEPHONE_M }, W, H)!;
    expect(horizon.v).toBeGreaterThan(H / 2 + 20);
  });

  it('telephone tourne dans le sens horaire : le haut du mur part vers la gauche de l image', () => {
    const q = { x: 5, y: 0, z: 5 };
    const droit = pointDansPhoto(vue(), q, W, H)!, penche = pointDansPhoto(vue({ roulisDeg: 10 }), q, W, H)!;
    expect(droit.u).toBeCloseTo(W / 2, 6);
    expect(penche.u).toBeLessThan(W / 2 - 5);
  });

  it('rien sans cap, ni derriere l objectif', () => {
    expect(pointDansPhoto(vue({ azimutDeg: null }), { x: 5, y: 0, z: 3 }, W, H)).toBeNull();
    expect(pointDansPhoto(vue({ azimutDeg: 180 }), { x: 5, y: 0, z: 3 }, W, H)).toBeNull();
  });
});

describe('les points lus', () => {
  it('la moitie centrale du mur seulement', () => {
    const pts = pointsCentrauxDuMur(p(0, 0), p(10, 0), 6);
    expect(pts).toHaveLength(96);
    expect(Math.min(...pts.map((q) => q.x))).toBeGreaterThanOrEqual(2.5);
    expect(Math.max(...pts.map((q) => q.x))).toBeLessThanOrEqual(7.5);
  });
});

describe('la couleur d un mur connu sur une photo de synthese', () => {
  it('retrouve l enduit, fenetres ecartees', () => {
    const v = vue();
    const l = lireFacadeSurPhoto(photoDeSynthese(v, [facade()], W, H), v, MUR);
    expect(l.couleur).not.toBeNull();
    expect(ecartHex(l.couleur!, BEIGE)).toBeLessThan(8);
    expect(l.pixels).toBeGreaterThan(60);
  });

  it('avec la focale, l inclinaison et le roulis de la prise', () => {
    const v = vue({ x: 3, y: -9, azimutDeg: 15, inclinaisonDeg: 12, roulisDeg: -6, champDeg: 75 });
    const l = lireFacadeSurPhoto(photoDeSynthese(v, [facade()], 360, 480), v, MUR);
    expect(ecartHex(l.couleur!, BEIGE)).toBeLessThan(8);
  });

  it('une boussole fausse de 12 degres : la moitie centrale reste sur le mur', () => {
    const vraie = vue();
    const img = photoDeSynthese(vraie, [facade()], W, H);
    const l = lireFacadeSurPhoto(img, { ...vraie, azimutDeg: 12 }, MUR);
    expect(ecartHex(l.couleur!, BEIGE)).toBeLessThan(8);
  });

  it('une brique rouge se lit rouge', () => {
    const BRIQUE: Rgb = [160, 82, 59];
    const v = vue();
    const l = lireFacadeSurPhoto(photoDeSynthese(v, [facade(enduit(BRIQUE))], W, H), v, MUR);
    expect(ecartHex(l.couleur!, BRIQUE)).toBeLessThan(8);
  });

  it('un mur qui n est pas sur la photo ne donne rien', () => {
    const v = vue({ azimutDeg: 90 });
    const l = lireFacadeSurPhoto(photoDeSynthese(v, [facade()], W, H), v, MUR);
    expect(l.couleur).toBeNull();
  });

  it('une palissade en limite de parcelle : sans la regle, on lit la cloture ; avec, elle est ecartee', () => {
    // Une palissade de bois brun de 2,5 m, a 3 m devant l'objectif, sur la limite de la parcelle.
    const BOIS: Rgb = [92, 70, 50];
    const palissade: Pan = { a: p(-20, -9), b: p(30, -9), z0: 0, z1: 2.5, couleur: enduit(BOIS) };
    const parcelle = obstacle([p(-20, -9), p(30, -9), p(30, 20), p(-20, 20)]);
    const v = vue();
    const img = photoDeSynthese(v, [facade(), palissade], W, H);
    const sansRegle = lireFacadeSurPhoto(img, v, MUR);
    expect(ecartHex(sansRegle.couleur!, BOIS)).toBeLessThan(10);
    const avecRegle = lireFacadeSurPhoto(img, v, MUR, [parcelle]);
    expect(avecRegle.couleur).toBeNull();
    expect(avecRegle.pixels).toBe(0);
  });

  it('une cloture plus loin ne cache que le bas du mur : le haut se lit', () => {
    const BOIS: Rgb = [92, 70, 50];
    const cloture: Pan = { a: p(-20, -4), b: p(30, -4), z0: 0, z1: 2.5, couleur: enduit(BOIS) };
    const parcelle = obstacle([p(-20, -4), p(30, -4), p(30, 20), p(-20, 20)]);
    const v = vue();
    const l = lireFacadeSurPhoto(photoDeSynthese(v, [facade(), cloture], W, H), v, MUR, [parcelle]);
    expect(ecartHex(l.couleur!, BEIGE)).toBeLessThan(8);
    expect(l.pixels).toBeLessThan(96);
  });
});

describe('la teinte au toucher', () => {
  const v = vue();
  const img = photoDeSynthese(v, [facade()], W, H);
  const ou = (x: number, z: number) => pointDansPhoto(v, { x, y: 0, z }, W, H)!;

  it('autour du doigt sur le mur, fenetre ecartee', () => {
    // Le doigt au bord d'une fenetre : la mediane est l'enduit, la vitre s'ecarte.
    const c = ou(2.85, 4.2);
    const t = teinteAuToucher(img, c.u, c.v)!;
    expect(ecartHex(t.couleur, BEIGE)).toBeLessThan(8);
    expect(t.pixels).toBeGreaterThan(50);
  });

  it('rien sur un fouillis de couleurs, ni hors de l image', () => {
    const data = new Uint8ClampedArray(100 * 100 * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) % 251;
    const fouillis: Pixels = { data, largeur: 100, hauteur: 100 };
    expect(teinteAuToucher(fouillis, 50, 50)).toBeNull();
    expect(teinteAuToucher(img, -100, -100)).toBeNull();
  });
});
