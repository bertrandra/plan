import { describe, it, expect } from 'vitest';
import {
  ajusterPose, calerDepuisExif, champVerticalDeg, focale35DepuisChamp, gesteDeLaTouche, gesteDuGlisser, hauteurHorizon, phrasesDuCalage, poseParDefaut, positionDansLePlan,
  rapportDeRendu, regardDe, tailleRamenee, BORNES_POSE, PAS_POSE, COTE_MAX_PHOTO, DISTANCE_MAX_GPS_M, FOCALE_DEFAUT_35, OEIL_PHOTO_M,
  type CibleProjet,
} from '../../../src/core/photomontage.js';
import { lireExif } from '../../../src/facade/vision/exif.js';
import { avecExif } from '../../fixtures/photomontage/exif.mjs';
import type { ExifPhoto, GpsExif } from '../../../src/model/audit.js';

// Le calage du photomontage : ce que l'EXIF d'une photo dit de la camera, et ce qu'on fait quand il ne le dit pas.

/** L'origine du plan de la demonstration (le calage du cadastre d'AE 101). */
const ORIGINE = { lat: 48.9053664, lon: 2.1328776 };
/** Un degre de latitude et de longitude, en metres, a cette latitude. */
const M_PAR_DEG_LAT = 111_200, M_PAR_DEG_LON = 73_200;
const CIBLE: CibleProjet = { centre: { x: 0, y: -15 }, rayon: 3, hauteurM: 0.4, maison: { x: 0, y: -5 } };
const PAYSAGE = { l: 2048, h: 1536 }, PORTRAIT = { l: 1536, h: 2048 };

/** Une position a `est` et `nord` metres de l'origine du plan. */
const gpsA = (est: number, nord: number, capDeg: number | null = null): GpsExif =>
  ({ lat: ORIGINE.lat + nord / M_PAR_DEG_LAT, lon: ORIGINE.lon + est / M_PAR_DEG_LON, altitudeM: null, capDeg, nordCap: capDeg === null ? null : 'T' });
const exif = (plus: Partial<ExifPhoto>): ExifPhoto => ({ focale35: null, modele: null, ...plus });

describe('la photo ramenee et la zone de rendu', () => {
  it('ramene le grand cote a 2 048 px sans deformer, et n agrandit jamais', () => {
    expect(COTE_MAX_PHOTO).toBe(2048);
    expect(tailleRamenee(4032, 3024)).toEqual({ l: 2048, h: 1536 });
    expect(tailleRamenee(3024, 4032)).toEqual({ l: 1536, h: 2048 });
    expect(tailleRamenee(800, 600)).toEqual({ l: 800, h: 600 });
  });

  it('donne a la zone de rendu le rapport de la photo, en paysage comme en portrait', () => {
    expect(rapportDeRendu(PAYSAGE)).toBeCloseTo(4 / 3, 6);
    expect(rapportDeRendu(PORTRAIT)).toBeCloseTo(3 / 4, 6);
    expect(rapportDeRendu(tailleRamenee(6000, 4000))).toBeCloseTo(1.5, 2);
  });
});

describe('la focale equivalente 24x36 et le champ vertical', () => {
  it('rend le champ du 24x36 lui-meme : 27° de haut a 50 mm en paysage', () => {
    // Un 50 mm sur un 36 x 24 : 2 atan(12 / 50).
    expect(champVerticalDeg(50, { l: 3600, h: 2400 })).toBeCloseTo(26.99, 1);
  });

  it('tient compte de l orientation : en portrait, la hauteur de l image est son grand cote', () => {
    const paysage = champVerticalDeg(26, PAYSAGE), portrait = champVerticalDeg(26, PORTRAIT);
    expect(paysage).toBeCloseTo(53.1, 0);
    expect(portrait).toBeCloseTo(67.3, 0);
    // Le champ vertical du portrait est le champ horizontal du paysage.
    const horizontalPaysage = (2 * Math.atan(Math.tan((paysage * Math.PI) / 360) * (4 / 3)) * 180) / Math.PI;
    expect(portrait).toBeCloseTo(horizontalPaysage, 6);
  });

  it('s inverse : la focale se relit du champ', () => {
    expect(focale35DepuisChamp(champVerticalDeg(35, PAYSAGE), PAYSAGE)).toBeCloseTo(35, 6);
    expect(focale35DepuisChamp(champVerticalDeg(13, PORTRAIT), PORTRAIT)).toBeCloseTo(13, 6);
  });
});

describe('la position de la photo dans le plan', () => {
  it('ramene une longitude et une latitude aux metres du plan (x vers l est, y vers le nord)', () => {
    const p = positionDansLePlan(ORIGINE, { lat: ORIGINE.lat - 0.0001, lon: ORIGINE.lon + 0.0001 });
    expect(p.x).toBeCloseTo(7.33, 1);
    expect(p.y).toBeCloseTo(-11.12, 1);
    expect(positionDansLePlan(ORIGINE, ORIGINE)).toEqual({ x: 0, y: 0 });
  });
});

describe('le calage depuis l EXIF', () => {
  it('sans EXIF : la pose par defaut face au projet, la maison en fond, a hauteur d oeil, et il le dit', () => {
    const c = calerDepuisExif(null, ORIGINE, CIBLE, PAYSAGE);
    expect(c.position).toBe('sansGps');
    expect(c.cap).toBe('versLeProjet');
    expect(c.focale35).toBeNull();
    // La maison est au nord du projet : la camera est au sud, et regarde vers le nord.
    expect(c.pose.capDeg).toBeCloseTo(0, 6);
    expect(c.pose.x).toBeCloseTo(0, 6);
    expect(c.pose.y).toBeLessThan(CIBLE.centre.y - 4 + 1e-9);
    expect(c.pose.hauteurM).toBe(OEIL_PHOTO_M);
    expect(c.pose.champDeg).toBeCloseTo(champVerticalDeg(FOCALE_DEFAUT_35, PAYSAGE), 6);
    // Le regard plonge un peu vers le platelage.
    expect(c.pose.inclinaisonDeg).toBeLessThan(0);
    const p = phrasesDuCalage(c);
    expect(p.position).toMatch(/pas de GPS/);
    expect(p.cap).toMatch(/non lue/);
    expect(p.focale).toMatch(/non lue.*26 mm/);
  });

  it('sans maison connue : depuis le sud ; le projet entier tient dans l image', () => {
    const c = calerDepuisExif(exif({}), null, { ...CIBLE, maison: null, rayon: 6 }, PORTRAIT);
    expect(c.pose.capDeg).toBe(0);
    const recul = CIBLE.centre.y - c.pose.y;
    const demiH = Math.atan(Math.tan((c.pose.champDeg * Math.PI) / 360) * rapportDeRendu(PORTRAIT));
    expect(Math.atan(6 / recul)).toBeLessThan(demiH);
  });

  it('GPS, cap et focale lus : la camera a cet endroit, a 1,6 m du sol, dans cette direction, avec ce champ', () => {
    const c = calerDepuisExif(exif({ focale35: 24, gps: gpsA(8, -30, 310) }), ORIGINE, CIBLE, PAYSAGE);
    expect(c.position).toBe('gps');
    expect(c.cap).toBe('exif');
    expect(c.focale35).toBe(24);
    expect(c.pose.x).toBeCloseTo(8, 0);
    expect(c.pose.y).toBeCloseTo(-30, 0);
    expect(c.pose.hauteurM).toBe(1.6);
    expect(c.pose.capDeg).toBe(310);
    expect(c.pose.champDeg).toBeCloseTo(champVerticalDeg(24, PAYSAGE), 6);
    expect(c.distanceM).toBeCloseTo(Math.hypot(8, 15), 0);
    const p = phrasesDuCalage(c);
    expect(p.position).toMatch(/à quelques mètres près/);
    expect(p.position).not.toMatch(/exact/i);
    expect(p.cap).toMatch(/boussole/);
    expect(p.focale).toBe('Focale lue : 24 mm.');
  });

  it('GPS sans cap : la camera regarde vers le projet', () => {
    const c = calerDepuisExif(exif({ gps: gpsA(10, -25) }), ORIGINE, CIBLE, PAYSAGE);
    expect(c.position).toBe('gps');
    expect(c.cap).toBe('versLeProjet');
    // Du point (10, -25) vers (0, -15) : plein nord-ouest.
    expect(c.pose.capDeg).toBeCloseTo(315, 0);
  });

  it('focale absente : le champ d un telephone, en tenant compte du portrait', () => {
    const c = calerDepuisExif(exif({ gps: gpsA(0, -30, 0) }), ORIGINE, CIBLE, PORTRAIT);
    expect(c.focale35).toBeNull();
    expect(c.pose.champDeg).toBeCloseTo(champVerticalDeg(26, PORTRAIT), 6);
    expect(c.pose.champDeg).toBeGreaterThan(champVerticalDeg(26, PAYSAGE));
  });

  it('une position hors de la parcelle est acceptee : on photographie de la rue ou de chez le voisin', () => {
    const c = calerDepuisExif(exif({ gps: gpsA(60, -80, 320) }), ORIGINE, CIBLE, PAYSAGE);
    expect(c.position).toBe('gps');
    expect(c.pose.x).toBeCloseTo(60, 0);
    expect(c.distanceM).toBeLessThan(DISTANCE_MAX_GPS_M);
  });

  it('trop loin du projet : repli sur la pose par defaut, et il le dit ; le cap et la focale lus restent', () => {
    const c = calerDepuisExif(exif({ focale35: 28, gps: gpsA(900, 400, 90) }), ORIGINE, CIBLE, PAYSAGE);
    expect(c.position).toBe('tropLoin');
    expect(c.distanceM).toBeGreaterThan(DISTANCE_MAX_GPS_M);
    expect(c.pose.capDeg).toBe(90);
    // Le regard vers l'est : la camera est a l'ouest du projet, et le voit.
    expect(c.pose.x).toBeLessThan(CIBLE.centre.x - 4 + 1e-9);
    expect(c.pose.y).toBeCloseTo(CIBLE.centre.y, 6);
    expect(c.focale35).toBe(28);
    expect(phrasesDuCalage(c).position).toMatch(/trop loin/);
  });

  it('un plan qui n est pas cale sur le cadastre : la position ne se place pas, et il le dit', () => {
    const c = calerDepuisExif(exif({ gps: gpsA(8, -30, 310) }), null, CIBLE, PAYSAGE);
    expect(c.position).toBe('planNonCale');
    expect(c.pose.capDeg).toBe(310);
    expect(phrasesDuCalage(c).position).toMatch(/pas calé sur le cadastre/);
  });

  it('une position confondue avec le centre du projet ne donne pas de cap fou', () => {
    const c = calerDepuisExif(exif({ gps: gpsA(0, -15) }), ORIGINE, CIBLE, PAYSAGE);
    expect(Number.isFinite(c.pose.capDeg)).toBe(true);
    expect(c.pose.capDeg).toBeCloseTo(0, 6);
  });
});

describe('l ajustement a la main', () => {
  const depart = poseParDefaut(CIBLE, PAYSAGE, 50, 90);

  it('avance et se decale selon la direction du regard, au sol', () => {
    // Regard vers l'est : avancer va vers l'est, se decaler a droite va vers le sud.
    const p = ajusterPose(depart, { avancerM: 2, decalerM: 1 });
    expect(p.x - depart.x).toBeCloseTo(2, 6);
    expect(p.y - depart.y).toBeCloseTo(-1, 6);
    expect(p.hauteurM).toBe(depart.hauteurM);
  });

  it('tourne sur elle-meme : la position ne bouge pas, le cap reste entre 0 et 360', () => {
    const p = ajusterPose(depart, { tournerDeg: -100, inclinerDeg: 5 });
    expect(p.x).toBe(depart.x);
    expect(p.y).toBe(depart.y);
    expect(p.capDeg).toBeCloseTo(350, 6);
    expect(p.inclinaisonDeg).toBeCloseTo(depart.inclinaisonDeg + 5, 6);
  });

  it('reste dans ses bornes : ni sous le sol, ni a la verticale, ni un champ absurde', () => {
    const p = ajusterPose(depart, { monterM: -50, inclinerDeg: 500, champFois: 100 });
    expect(p.hauteurM).toBe(BORNES_POSE.hauteurMin);
    expect(p.inclinaisonDeg).toBe(BORNES_POSE.inclinaisonMax);
    expect(p.champDeg).toBe(BORNES_POSE.champMax);
    expect(ajusterPose(depart, { champFois: 0.001 }).champDeg).toBe(BORNES_POSE.champMin);
  });

  it('le regard est unitaire, et l horizon tombe au milieu de l image quand il est horizontal', () => {
    const r = regardDe({ ...depart, inclinaisonDeg: 20 });
    expect(Math.hypot(r.est, r.nord, r.haut)).toBeCloseTo(1, 9);
    expect(r.est).toBeGreaterThan(0.9);
    expect(hauteurHorizon({ ...depart, inclinaisonDeg: 0 })).toBeCloseTo(0.5, 9);
    // Le regard plonge : l'horizon monte dans l'image ; a la moitie du champ, il est sur le bord haut.
    expect(hauteurHorizon({ ...depart, inclinaisonDeg: -25 })).toBeCloseTo(0, 9);
    expect(hauteurHorizon({ ...depart, inclinaisonDeg: 25 })).toBeCloseTo(1, 9);
  });
});

describe('le clavier et le glisser', () => {
  it('les fleches tournent et inclinent ; avec Maj elles deplacent ; + et - zooment ; les pages montent et descendent', () => {
    expect(gesteDeLaTouche('ArrowLeft', false)).toEqual({ tournerDeg: -PAS_POSE.tournerDeg });
    expect(gesteDeLaTouche('ArrowUp', false)).toEqual({ inclinerDeg: PAS_POSE.inclinerDeg });
    expect(gesteDeLaTouche('ArrowUp', true)).toEqual({ avancerM: PAS_POSE.deplacerM });
    expect(gesteDeLaTouche('ArrowRight', true)).toEqual({ decalerM: PAS_POSE.deplacerM });
    expect(gesteDeLaTouche('+', true)?.champFois).toBeLessThan(1);
    expect(gesteDeLaTouche('-', false)?.champFois).toBeGreaterThan(1);
    expect(gesteDeLaTouche('PageDown', false)).toEqual({ monterM: -PAS_POSE.monterM });
    expect(gesteDeLaTouche('a', false)).toBeNull();
  });

  it('un glisser de toute la hauteur de l image tourne du champ vertical, a l oppose du doigt', () => {
    const g = gesteDuGlisser(600, -300, 600, 50);
    expect(g.tournerDeg).toBeCloseTo(-50, 9);
    expect(g.inclinerDeg).toBeCloseTo(-25, 9);
  });
});

describe('la photo de test de la fumee', () => {
  /** Le plus petit JPEG : un debut et une fin d'image. */
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

  it('porte un EXIF que le lecteur de Plan relit : position, direction, focale', () => {
    const lu = lireExif(avecExif(JPEG, { lat: 48.9051, lon: 2.1329, capDeg: 312.5, focale35: 24 }).buffer as ArrayBuffer);
    expect(lu.focale35).toBe(24);
    expect(lu.gps?.lat).toBeCloseTo(48.9051, 6);
    expect(lu.gps?.lon).toBeCloseTo(2.1329, 6);
    expect(lu.gps?.capDeg).toBe(312.5);
    expect(lu.gps?.nordCap).toBe('T');
  });

  it('n ecrit que ce qu on lui donne : une position sans direction, ou rien', () => {
    const sansCap = lireExif(avecExif(JPEG, { lat: -33.9, lon: -70.6 }).buffer as ArrayBuffer);
    expect(sansCap.gps?.lat).toBeCloseTo(-33.9, 6);
    expect(sansCap.gps?.lon).toBeCloseTo(-70.6, 6);
    expect(sansCap.gps?.capDeg).toBeNull();
    expect(sansCap.focale35).toBeNull();
    const rien = lireExif(avecExif(JPEG, { focale35: 26 }).buffer as ArrayBuffer);
    expect(rien.gps ?? null).toBeNull();
    expect(rien.focale35).toBe(26);
    // Et le calage s'en sert tel quel.
    expect(calerDepuisExif(sansCap, ORIGINE, CIBLE, PAYSAGE).position).toBe('tropLoin');
  });
});
