import { describe, it, expect } from 'vitest';
import {
  projeterPoint,
  coinsPredits,
  zonesDeRecherche,
  incertitudeDe,
  calageGrossier,
  biaisDepuisCap,
  priseVisantLeMilieu,
  coinsDuReleve,
  priseDeVueDepuisPhoto,
  coinsDeLaPhoto,
  pxParMetre,
  pxParMetreSource,
  pxParMetreDesCoins,
  precisionCm,
  murDeFacade,
  INCERTITUDE_BOUSSOLE_DEG,
  INCERTITUDE_MARCHE_DEG,
  type PriseDeVue,
  type MurVu,
} from '../../../../src/facade/calage/calage.js';
import { coinsProposes } from '../../../../src/facade/analyse.js';
import { focalePx } from '../../../../src/facade/vision/cadrage.js';
import { facadesDuContour } from '../../../../src/geometry/cotesVusDeDehors.js';
import type { PrisePhoto } from '../../../../src/model/audit.js';

// Le calage grossier (spec-facades-calage-detection §5) : la prise de vue projette le mur dans la
// photo par un stenope ; aux bornes de l'incertitude, une zone de recherche par coin.

const W = 1280,
  H = 960;
const F = focalePx(W, H);

/** Un mur de 10 m sur 6 m, face au sud, de (0, 0) a (10, 0) : vu de dehors, la gauche est a l'ouest. */
const MUR: MurVu = { gauche: { x: 0, y: 0 }, droite: { x: 10, y: 0 }, hauteur: 6 };

/** Devant le milieu du mur, a 12 m au sud, visee vers le nord, telephone d'aplomb. */
const prise = (plus: Partial<PriseDeVue> = {}): PriseDeVue => ({
  x: 5,
  y: -12,
  precisionM: 5,
  azimutDeg: 0,
  sourceAzimut: 'boussole',
  inclinaisonDeg: 0,
  roulisDeg: 0,
  focalePx: F,
  largeurPx: W,
  hauteurPx: H,
  sourceFocale: 'exif',
  ...plus,
});

describe('projection stenope', () => {
  it('projette au centre de l image le point vise a hauteur d objectif', () => {
    const q = projeterPoint(prise(), 5, 0, 1.5);
    expect(q?.x).toBeCloseTo(W / 2, 9);
    expect(q?.y).toBeCloseTo(H / 2, 9);
    // Derriere l'objectif : rien.
    expect(projeterPoint(prise(), 5, -20, 1.5)).toBeNull();
  });

  it('de face et d aplomb, rend les coins centres d avant', () => {
    const c = coinsPredits(MUR, prise());
    const attendus = coinsProposes(W, H, F, 12, 10, 6);
    c?.forEach((q, i) => {
      expect(q.x).toBeCloseTo(attendus[i]!.x, 6);
      expect(q.y).toBeCloseTo(attendus[i]!.y, 6);
    });
  });

  it('telephone leve : le mur descend dans l image ; boussole a droite : il part a gauche', () => {
    const aplomb = coinsPredits(MUR, prise())!;
    const leve = coinsPredits(MUR, prise({ inclinaisonDeg: 6 }))!;
    // A 12 m, 6 degres de tangage descendent le pied du mur d'environ f * tan 6 degres.
    expect(leve[3]!.y - aplomb[3]!.y).toBeGreaterThan(0.9 * F * Math.tan((6 * Math.PI) / 180));
    const droite = coinsPredits(MUR, prise({ azimutDeg: 10 }))!;
    expect(droite[0]!.x).toBeLessThan(aplomb[0]!.x - 100);
  });

  it('roulis horaire : la droite de l image monte (l image tourne a l inverse du telephone)', () => {
    const c = coinsPredits(MUR, prise({ roulisDeg: 5 }))!;
    expect(c[1]!.y).toBeLessThan(c[0]!.y);
    expect(c[2]!.y).toBeLessThan(c[3]!.y);
  });

  it('suit la gauche et la droite d une facade du plan', () => {
    // Un carre de 10 m, trace dans le sens trigonometrique ; sa facade sud va de (0, 0) a (10, 0).
    const sud = facadesDuContour([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], 6).find((f) => f.orientation === 'Sud')!;
    const c = coinsPredits(murDeFacade(sud), prise())!;
    expect(c[0]!.x).toBeLessThan(c[1]!.x);
    expect(c[0]!.y).toBeLessThan(c[3]!.y);
  });
});

describe('zones de recherche', () => {
  it('contiennent les coins predits, et s elargissent avec la marche', () => {
    const p = prise();
    const c = coinsPredits(MUR, p)!;
    const zb = zonesDeRecherche(MUR, p);
    zb.forEach((z, i) => {
      expect(z.bornee).toBe(true);
      expect(c[i]!.x).toBeGreaterThanOrEqual(z.x0);
      expect(c[i]!.x).toBeLessThanOrEqual(z.x1);
      expect(c[i]!.y).toBeGreaterThanOrEqual(z.y0);
      expect(c[i]!.y).toBeLessThanOrEqual(z.y1);
    });
    const zm = zonesDeRecherche(MUR, prise({ sourceAzimut: 'deplacement' }));
    expect(zm[0]!.x1 - zm[0]!.x0).toBeGreaterThan(zb[0]!.x1 - zb[0]!.x0);
    expect(incertitudeDe(p).azimutDeg).toBe(INCERTITUDE_BOUSSOLE_DEG);
    expect(incertitudeDe(prise({ sourceAzimut: 'deplacement' })).azimutDeg).toBe(INCERTITUDE_MARCHE_DEG);
  });

  it('contiennent le vrai coin quand la boussole se trompe de 10 degres et le GPS de 3 m', () => {
    const vrais = coinsPredits(MUR, prise({ azimutDeg: 10, x: 7, y: -14 }))!;
    const z = zonesDeRecherche(MUR, prise());
    vrais.forEach((q, i) => {
      expect(q.x).toBeGreaterThanOrEqual(z[i]!.x0);
      expect(q.x).toBeLessThanOrEqual(z[i]!.x1);
    });
  });

  it('sont l image entiere quand un coin passe derriere l objectif aux bornes', () => {
    // A 2 m du mur, 15 m d'incertitude : l'objectif peut etre de l'autre cote du mur.
    const z = zonesDeRecherche(MUR, prise({ y: -2, precisionM: null }));
    expect(z.every((zk) => !zk.bornee && zk.x0 === 0 && zk.x1 === W)).toBe(true);
  });

  it('elargit la focale par defaut, pas celle de l EXIF', () => {
    expect(incertitudeDe(prise()).focale).toBe(0);
    expect(incertitudeDe(prise({ sourceFocale: 'defaut' })).focale).toBeGreaterThan(0);
  });
});

describe('calage grossier', () => {
  it('rend coins, zones, distance au milieu du mur et resolution', () => {
    const c = calageGrossier(MUR, prise());
    expect(c.coins).toHaveLength(4);
    expect(c.zones).toHaveLength(4);
    expect(c.distance).toBeCloseTo(12, 9);
    expect(c.pxParM).toBeCloseTo(F / 12, 9);
  });
});

describe('releve : visee sur le milieu du mur', () => {
  it('lit le biais sur le cap, a droite positif, rien au-dela de 60 degres', () => {
    // La facade regarde au sud (180) : de face, on vise le nord.
    expect(biaisDepuisCap(0, 180)).toBeCloseTo(0, 9);
    // Viser vers le nord-nord-ouest, c'est se tenir a droite du milieu.
    expect(biaisDepuisCap(348, 180)).toBeCloseTo(12, 9);
    expect(biaisDepuisCap(20, 180)).toBeCloseTo(-20, 9);
    expect(biaisDepuisCap(90, 180)).toBeNull();
  });

  it('sans cap ni attitude, rend les coins centres d avant', () => {
    const c = coinsDuReleve(8, 5, { largeurPx: W, hauteurPx: H, focalePx: F, distance: 9 });
    const attendus = coinsProposes(W, H, F, 9, 8, 5);
    c.forEach((q, i) => {
      expect(q.x).toBeCloseTo(attendus[i]!.x, 6);
      expect(q.y).toBeCloseTo(attendus[i]!.y, 6);
    });
  });

  it('de biais, vise toujours le milieu du mur, et le bout le plus loin parait plus petit', () => {
    const { mur, prise: p } = priseVisantLeMilieu(10, 6, { largeurPx: W, hauteurPx: H, focalePx: F, distance: 10, biaisDeg: 30 });
    const milieu = projeterPoint(p, 5, 0, 1.5)!;
    expect(milieu.x).toBeCloseTo(W / 2, 6);
    const c = coinsPredits(mur, p)!;
    // L'objectif est a droite : le bord gauche est le plus loin, donc le plus court.
    expect(c[3]!.y - c[0]!.y).toBeLessThan(c[2]!.y - c[1]!.y);
  });

  it('l inclinaison deplace les coins proposes', () => {
    const a = coinsDuReleve(8, 5, { largeurPx: W, hauteurPx: H, focalePx: F, distance: 9 });
    const b = coinsDuReleve(8, 5, { largeurPx: W, hauteurPx: H, focalePx: F, distance: 9, inclinaisonDeg: 8 });
    expect(b[0]!.y).toBeGreaterThan(a[0]!.y + 50);
  });
});

describe('audit : la photo situee', () => {
  const photo = (plus: Partial<PrisePhoto> = {}): PrisePhoto => ({
    t: '2026-10-13T09:00:00Z',
    x: 5,
    y: -12,
    lat: null,
    lon: null,
    precisionM: 4,
    azimutDeg: 0,
    sourceAzimut: 'boussole',
    inclinaisonDeg: 5,
    roulisDeg: 0,
    focale35: 26,
    champDeg: 69.4,
    sourceFocale: 'exif',
    modeleAppareil: 'iPhone 15',
    largeurSourcePx: 4032,
    hauteurSourcePx: 3024,
    ...plus,
  });

  it('devient une prise de vue, sauf sans azimut', () => {
    const p = priseDeVueDepuisPhoto(photo(), W, H)!;
    expect(p.focalePx).toBeCloseTo(focalePx(W, H, 69.4), 9);
    expect(p.inclinaisonDeg).toBe(5);
    expect(priseDeVueDepuisPhoto(photo({ azimutDeg: null }), W, H)).toBeNull();
    // Une photo de version 1, sans focale : le champ par defaut, annonce comme tel.
    const v1Photo: PrisePhoto = photo();
    delete v1Photo.champDeg;
    delete v1Photo.sourceFocale;
    const v1 = priseDeVueDepuisPhoto(v1Photo, W, H)!;
    expect(v1.sourceFocale).toBe('defaut');
    expect(v1.focalePx).toBeCloseTo(F, 9);
  });

  it('predit les coins quand la prise est connue, sinon les centre', () => {
    const predits = coinsDeLaPhoto(photo(), MUR, W, H);
    expect(predits.source).toBe('predit');
    expect(predits.zones.every((z) => z.bornee)).toBe(true);
    const centres = coinsDeLaPhoto(photo({ azimutDeg: null }), MUR, W, H);
    expect(centres.source).toBe('centre');
    // A la distance de la position au mur : 12 m.
    expect(centres.coins).toEqual(coinsProposes(W, H, focalePx(W, H, 69.4), 12, 10, 6));
    expect(centres.zones[0]).toEqual({ x0: 0, y0: 0, x1: W, y1: H, bornee: false });
    expect(coinsDeLaPhoto(null, MUR, W, H).source).toBe('centre');
  });

  it('donne les pixels par metre au mur sur la photo source, et la precision des cotes', () => {
    const px = pxParMetreSource(photo(), 12)!;
    expect(px).toBeCloseTo(focalePx(4032, 3024, 69.4) / 12, 9);
    expect(pxParMetreSource(photo({ largeurSourcePx: null }), 12)).toBeNull();
    expect(pxParMetre(1000, 25)).toBe(40);
    expect(precisionCm(40)).toBeCloseTo(2.5, 9);
    expect(precisionCm(0)).toBe(Infinity);
  });

  it('lit la resolution sur quatre coins poses : le cote le moins bien vu', () => {
    const c = [
      { x: 100, y: 100 },
      { x: 900, y: 120 },
      { x: 900, y: 480 },
      { x: 100, y: 500 },
    ];
    // Bord droit : 360 px pour 4 m, 90 px/m ; le haut, 800 px pour 8 m, 100 px/m.
    expect(pxParMetreDesCoins(c, 8, 4)).toBeCloseTo(90, 9);
    expect(pxParMetreDesCoins(c.slice(0, 3), 8, 4)).toBeNull();
  });
});
