// Le tri des vues qui montrent une facade (banc/src/facadesVues.ts ; demande du proprietaire, 15 novembre 2026 : des facades de maison
// ou d'immeuble, pas la route ou la campagne) : par la geometrie des batiments de la BD TOPO, sans lire l'image.
import { describe, it, expect } from 'vitest';
import { PART_DU_CHAMP_MIN_PLATE, DISTANCE_MAX_M, ECART_VISEE_MAX_DEG, lireBatiments, lireLesBatiments, PART_DU_CHAMP_MIN, ranger, regarder, SURFACE_MIN_M2, surfaceM2, urlBatiments, viserLaFacade, vuesDeFacade, type Batiment } from '../src/facadesVues.js';
import { ecartAngle, vuesAExtraire } from '../src/panoramax.js';

// 2 allee des Limites, Le Vesinet : la photo est la, dans une rue qui file vers le nord (l'est a droite, l'ouest a gauche).
const ici = { lat: 48.905067, lon: 2.132536 };
const R = 6371008.8;
/** Un point a (x metres a l'est, y metres au nord) de la photo. */
const pt = (x: number, y: number) => ({ lat: ici.lat + (y / R) * (180 / Math.PI), lon: ici.lon + (x / (R * Math.cos((ici.lat * Math.PI) / 180))) * (180 / Math.PI) });
/** Un batiment rectangulaire de centre (x, y), large de l (est-ouest) et profond de h (nord-sud), en metres. */
const maison = (id: string, x: number, y: number, l = 10, h = 10): Batiment => ({ id, contour: [pt(x - l / 2, y - h / 2), pt(x + l / 2, y - h / 2), pt(x + l / 2, y + h / 2), pt(x - l / 2, y + h / 2), pt(x - l / 2, y - h / 2)] });
const pano = { ...ici, azimut: 0, panoramique: true, cap: 0 };
const plate = (azimut: number) => ({ ...ici, azimut, panoramique: false, cap: 0 });
const cotes = vuesAExtraire(pano, 'cotes');

describe('les vues qui montrent une façade', () => {
  it('rue bordée de maisons des deux côtés : les deux vues du 360 sont gardées, chacune avec son bâtiment', () => {
    const s = ranger([maison('est', 13, 0), maison('ouest', -13, 0)]);
    const vues = vuesDeFacade(s, pano, cotes);
    expect(vues.map((v) => [v.vue, v.cap, v.batiment])).toEqual([['gauche', 270, 'ouest'], ['droite', 90, 'est']]);
  });
  it('maison d’un seul côté : une seule vue', () => {
    const vues = vuesDeFacade(ranger([maison('est', 13, 0)]), pano, cotes);
    expect(vues.map((v) => v.vue)).toEqual(['droite']);
  });
  it('route de campagne : aucune vue, avec ou sans bâtiment lu au loin', () => {
    expect(vuesDeFacade(ranger([]), pano, cotes)).toEqual([]);
    expect(vuesDeFacade(ranger([maison('ferme', 200, 150, 30, 15)]), pano, cotes)).toEqual([]);
  });
  it('bâtiment trop loin (au-delà de 40 m) : écarté ; le même à portée : gardé', () => {
    expect(vuesDeFacade(ranger([maison('loin', DISTANCE_MAX_M + 10, 0, 10, 40)]), pano, cotes)).toEqual([]);
    expect(vuesDeFacade(ranger([maison('pres', DISTANCE_MAX_M - 10, 0, 10, 40)]), pano, cotes).map((v) => v.vue)).toEqual(['droite']);
  });
  it('photo collée au mur (moins de 3 m) : ce n’est pas une façade', () => {
    expect(regarder(ranger([maison('mur', 6, 0)]), ici, 90).facade).toBe(false);
  });
  it('bâtiment en coin de champ : moins d’un quart du cadre, la vue est écartée', () => {
    // Une photo plate tournee vers l'est ; la maison n'entre que par le bord gauche du cadre (de 26 a 37 degres du cap).
    const s = ranger([maison('coin', 22, 14, 6, 6)]);
    const r = regarder(s, ici, 90);
    expect(r.part).toBeGreaterThan(0);
    expect(r.part).toBeLessThan(PART_DU_CHAMP_MIN);
    expect(vuesDeFacade(s, plate(90), vuesAExtraire(plate(90), 'cotes'))).toEqual([]);
  });
  it('photo plate : écartée quand elle regarde l’axe de la rue, gardée quand elle regarde une maison', () => {
    // Des maisons mitoyennes tout le long de la rue, des deux cotes : dans l'axe on ne voit leurs murs qu'en enfilade.
    const rue = ranger([-40, -30, -20, -10, 0, 10, 20, 30, 40].flatMap((y) => [maison('e' + y, 13, y), maison('o' + y, -13, y)]));
    expect(vuesDeFacade(rue, plate(0), vuesAExtraire(plate(0), 'cotes'))).toEqual([]);
    expect(vuesDeFacade(rue, plate(180), vuesAExtraire(plate(180), 'cotes'))).toEqual([]);
    const vers = vuesDeFacade(rue, plate(80), vuesAExtraire(plate(80), 'cotes'));
    // La photo plate garde son cap : elle n'est pas un 360 qu'on peut tourner.
    expect(vers.map((v) => [v.vue, v.cap])).toEqual([['photo', 80]]);
    expect(vers[0]?.batiment).toMatch(/^e/);
  });
  it('photo plate : il lui faut la moitié du cadre (on ne peut pas la tourner), là où un quart suffit à une vue de 360', () => {
    // Une maison qui couvre un bon tiers du cadre, de cote.
    const s = ranger([maison('est', 16, 6, 8, 8)]);
    const part = regarder(s, ici, 90).part;
    expect(part).toBeGreaterThan(0.25);
    expect(part).toBeLessThan(PART_DU_CHAMP_MIN_PLATE);
    expect(vuesDeFacade(s, plate(90), [{ vue: 'photo', cap: 90 }])).toEqual([]);
    expect(vuesDeFacade(s, pano, [{ vue: 'adresse', cap: 90 }])).toHaveLength(1);
  });
  it('petits bâtiments : un abri de jardin de quelques mètres carrés ne fait pas une façade et ne cache pas la maison', () => {
    const abri = maison('abri', 8, 0, 4, 4);
    expect(surfaceM2(abri.contour)).toBeCloseTo(16, 1);
    expect(surfaceM2(abri.contour)).toBeLessThan(SURFACE_MIN_M2);
    expect(vuesDeFacade(ranger([abri]), pano, cotes)).toEqual([]);
    expect(vuesDeFacade(ranger([abri, maison('est', 20, 0)]), pano, cotes).map((v) => v.batiment)).toEqual(['est']);
  });
  it('un bâtiment devant en cache un autre : c’est le premier que la vue regarde', () => {
    const r = regarder(ranger([maison('devant', 13, 0, 10, 30), maison('derriere', 30, 0, 10, 30)]), ici, 90);
    expect(r.batiment).toBe('devant');
    expect(r.part).toBe(1);
  });
});

describe('mieux viser : la vue d’un 360 se tourne vers sa façade', () => {
  it('la maison un peu plus loin dans la rue vient au milieu du cadre', () => {
    // La maison est a 13 m a l'est et 8 m plus au nord : sa face sur rue est vue autour de 58 degres, pas de 90.
    const s = ranger([maison('est', 13, 8)]);
    const v = viserLaFacade(s, ici, 90);
    expect(v?.batiment).toBe('est');
    expect(v?.cap).toBeGreaterThan(50);
    expect(v?.cap).toBeLessThan(75);
    // Tournee, la vue montre plus de la maison que la vue a 90 degres.
    expect(regarder(s, ici, v?.cap ?? 0).part).toBeGreaterThan(regarder(s, ici, 90).part);
  });
  it('jamais à plus de 35° des 90° de la rue', () => {
    const v = viserLaFacade(ranger([maison('loin', 12, 30, 10, 14)]), ici, 90);
    if (v) expect(Math.abs(ecartAngle(90, v.cap))).toBeLessThanOrEqual(ECART_VISEE_MAX_DEG);
    // Une maison tout a fait derriere la photo, hors de ce que le cote peut regarder : rien.
    expect(viserLaFacade(ranger([maison('derriere', 5, -30)]), ici, 90)).toBeNull();
  });
  it('les vues de la visée « droit vers la parcelle » gardent leur cap : seul le tri s’ajoute', () => {
    const s = ranger([maison('est', 13, 8)]);
    expect(vuesDeFacade(s, pano, [{ vue: 'adresse', cap: 70 }])).toEqual([{ vue: 'adresse', cap: 70, batiment: 'est' }]);
    expect(vuesDeFacade(s, pano, [{ vue: 'adresse', cap: 250 }])).toEqual([]);
  });
});

describe('les bâtiments de la BD TOPO (WFS de la Géoplateforme)', () => {
  const feature = (cleabs: string, legere = false, n = 1) => ({ type: 'Feature', id: 'batiment.' + cleabs, properties: { cleabs, construction_legere: legere }, geometry: { type: 'MultiPolygon', coordinates: Array.from({ length: n }, (_, k) => [maison('x', 20 * k, 0).contour.map((p) => [p.lon, p.lat, 44.3])]) } });
  it('demande la couche des bâtiments au même hôte que le cadastre, par pages', () => {
    const u = new URL(urlBatiments({ sud: 48.9, ouest: 2.13, nord: 48.91, est: 2.14 }, 1000, 2000));
    expect(u.origin + u.pathname).toBe('https://data.geopf.fr/wfs/ows');
    expect(u.searchParams.get('TYPENAMES')).toBe('BDTOPO_V3:batiment');
    expect(u.searchParams.get('BBOX')).toBe('48.900000,2.130000,48.910000,2.140000,urn:ogc:def:crs:EPSG::4326');
    expect(u.searchParams.get('STARTINDEX')).toBe('2000');
  });
  it('lit un bâtiment par polygone, sans l’altitude, et laisse les constructions légères', () => {
    const l = lireBatiments({ features: [feature('A'), feature('B', true), feature('C', false, 2), { properties: {}, geometry: null }] });
    expect(l.map((b) => b.id)).toEqual(['A', 'C', 'C#1']);
    expect(l[0]?.contour[0]).toEqual(maison('x', 0, 0).contour[0]);
  });
  it('lit page après page, et dit quand il en reste (l’écran ne filtre alors rien)', async () => {
    const page = (debut: number, n: number, total: number) => ({ numberMatched: total, features: Array.from({ length: n }, (_, k) => feature('B' + (debut + k))) });
    const demandes: string[] = [];
    const lire = (total: number) => (url: string) => { demandes.push(url); const d = Number(new URL(url).searchParams.get('STARTINDEX')); return Promise.resolve(page(d, Math.min(2, total - d), total)); };
    const tout = await lireLesBatiments({ sud: 0, ouest: 0, nord: 1, est: 1 }, lire(5), 5, 2);
    expect([tout.batiments.length, tout.tronque, demandes.length]).toEqual([5, false, 3]);
    const partiel = await lireLesBatiments({ sud: 0, ouest: 0, nord: 1, est: 1 }, lire(50), 2, 2);
    expect([partiel.batiments.length, partiel.tronque]).toEqual([4, true]);
  });
});
