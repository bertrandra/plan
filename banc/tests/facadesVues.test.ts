// Le tri des vues qui montrent une facade (banc/src/facadesVues.ts ; demande du proprietaire, 15 novembre 2026 : des facades de maison
// ou d'immeuble, pas la route ou la campagne) : par la geometrie des batiments de la BD TOPO, sans lire l'image.
import { describe, it, expect } from 'vitest';
import { CADRE_MIN_PLATE, cadrePlat, DISTANCE_MAX_PLATE_M, facadeAPortee, HAUTEUR_LOCAL_MAX_M, noteDeVue, pasUneMaison, plateMontreUneFacade, PART_DU_CHAMP_MIN_PLATE, DISTANCE_MAX_M, ECART_VISEE_MAX_DEG, lireBatiments, lireLesBatiments, PART_DU_CHAMP_MIN, ranger, regarder, SURFACE_ANNEXE_MAX_M2, SURFACE_LOCAL_MAX_M2, SURFACE_MIN_M2, surfaceM2, urlBatiments, viserLaFacade, vuesDeFacade, type Batiment } from '../src/facadesVues.js';
import { capsDouteux, ecartAngle, lirePhotos, PAS_MIN_CAP_M, vuesAExtraire } from '../src/panoramax.js';

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
    expect(vuesDeFacade(s, pano, [{ vue: 'adresse', cap: 70 }])).toMatchObject([{ vue: 'adresse', cap: 70, batiment: 'est' }]);
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

describe('pas des maisons : ce que la BD TOPO dit du bâtiment', () => {
  const bat = (l: number, h: number, a: Partial<Batiment>): Batiment => ({ ...maison('b', 13, 0, l, h), ...a });
  it('le local technique du Loiret (48.12612, 2.88168) : 51 m², 3,7 m, « Commercial et services », aucun logement — écarté', () => {
    const local = bat(8.5, 6, { nature: 'Indifférenciée', usage1: 'Commercial et services', usage2: null, hauteur: 3.7, logements: 0, etages: 1 });
    expect(surfaceM2(local.contour)).toBeLessThan(SURFACE_LOCAL_MAX_M2);
    expect(pasUneMaison(local)).toBe('local');
    expect(vuesDeFacade(ranger([local]), pano, cotes)).toEqual([]);
  });
  it('garde les maisons, les immeubles et le commerce en rez-de-chaussée d’immeuble', () => {
    expect(pasUneMaison(bat(10, 10, { usage1: 'Résidentiel', hauteur: 3, logements: 1 }))).toBeNull();
    expect(pasUneMaison(bat(6, 5, { usage1: 'Résidentiel', hauteur: 3.2 }))).toBeNull();
    expect(pasUneMaison(bat(20, 15, { usage1: 'Résidentiel', usage2: 'Commercial et services', hauteur: 21, logements: 12 }))).toBeNull();
    expect(pasUneMaison(bat(20, 15, { usage1: 'Commercial et services', usage2: 'Résidentiel', hauteur: 18 }))).toBeNull();
    // Un grand magasin de la rue de Rivoli : commercial, sans logement, mais haut et grand.
    expect(pasUneMaison(bat(40, 30, { usage1: 'Commercial et services', hauteur: 27.8, logements: 0 }))).toBeNull();
  });
  it('dans le doute, garde : un usage « Indifférencié » ou absent n’écarte rien à lui seul', () => {
    expect(pasUneMaison(bat(12, 10, { usage1: 'Indifférencié', hauteur: 7.9 }))).toBeNull();
    expect(pasUneMaison(bat(6, 6, { usage1: 'Indifférencié', hauteur: null }))).toBeNull();
    expect(pasUneMaison(bat(6, 6, {}))).toBeNull();
    // Petit et bas, en revanche : un local, quel que soit l'usage dit.
    expect(pasUneMaison(bat(6, 6, { usage1: 'Indifférencié', hauteur: HAUTEUR_LOCAL_MAX_M - 1 }))).toBe('local');
  });
  it('hangars agricoles, ateliers, gymnases, serres et silos : écartés', () => {
    expect(pasUneMaison(bat(30, 15, { usage1: 'Agricole', hauteur: 8 }))).toBe('usage');
    expect(pasUneMaison(bat(30, 15, { usage1: 'Industriel', hauteur: 8 }))).toBe('usage');
    expect(pasUneMaison(bat(30, 15, { usage1: 'Sportif', hauteur: 9 }))).toBe('usage');
    expect(pasUneMaison(bat(30, 15, { nature: 'Serre', usage1: 'Agricole' }))).toBe('nature');
    expect(pasUneMaison(bat(8, 8, { nature: 'Silo', usage1: 'Résidentiel' }))).toBe('nature');
    // La ferme habitee reste : un logement l'emporte sur l'usage agricole.
    expect(pasUneMaison(bat(30, 15, { usage1: 'Agricole', usage2: 'Résidentiel', hauteur: 8 }))).toBeNull();
  });
  it('annexes : le garage part, la grande dépendance haute reste', () => {
    const garage = bat(6, 5, { usage1: 'Annexe', hauteur: null, logements: 0, etages: 1 });
    expect(surfaceM2(garage.contour)).toBeLessThan(SURFACE_ANNEXE_MAX_M2);
    expect(pasUneMaison(garage)).toBe('annexe');
    expect(pasUneMaison(bat(12, 10, { usage1: 'Annexe', hauteur: 3.5 }))).toBe('annexe');
    expect(pasUneMaison(bat(12, 10, { usage1: 'Annexe', hauteur: 7 }))).toBeNull();
    expect(pasUneMaison(bat(6, 5, { usage1: 'Résidentiel', usage2: 'Annexe' }))).toBeNull();
  });
  it('un bâtiment écarté ne montre rien mais cache la maison derrière lui', () => {
    const garage = { ...maison('garage', 10, 0, 6, 8), usage1: 'Annexe', hauteur: 2.8 };
    const s = ranger([garage, maison('derriere', 25, 0, 10, 8)]);
    expect(s.facade).toEqual([false, true]);
    // Le garage occupe le milieu du champ : la maison derriere n'est vue que par ses bords.
    expect(regarder(s, ici, 90).part).toBeLessThan(PART_DU_CHAMP_MIN);
    expect(regarder(ranger([maison('derriere', 25, 0, 10, 8)]), ici, 90).facade).toBe(true);
    expect(facadeAPortee(ranger([garage]), ici)).toBe(false);
    expect(facadeAPortee(s, ici)).toBe(true);
  });
  it('demande au WFS les attributs dont la règle a besoin, et les lit', () => {
    const noms = new URL(urlBatiments({ sud: 0, ouest: 0, nord: 1, est: 1 })).searchParams.get('PROPERTYNAME')?.split(',') ?? [];
    expect(noms).toEqual(expect.arrayContaining(['cleabs', 'nature', 'usage_1', 'usage_2', 'hauteur', 'nombre_de_logements', 'nombre_d_etages', 'construction_legere', 'geometrie']));
    const [b] = lireBatiments({ features: [{ properties: { cleabs: 'X', nature: 'Indifférenciée', usage_1: 'Commercial et services', usage_2: null, hauteur: 3.7, nombre_de_logements: 0, nombre_d_etages: 1 }, geometry: { type: 'Polygon', coordinates: [maison('x', 0, 0).contour.map((p) => [p.lon, p.lat])] } }] });
    expect(b).toMatchObject({ id: 'X', nature: 'Indifférenciée', usage1: 'Commercial et services', usage2: null, hauteur: 3.7, logements: 0, etages: 1 });
  });
});

describe('photos plates : la façade doit remplir le cadre, et le cap être sûr', () => {
  const immeuble = (x: number, h: number): Batiment => ({ ...maison('i', x, 0, 12, 60), usage1: 'Résidentiel', hauteur: h });
  it('l’immeuble d’en face à dix mètres : gardé ; le même au bout de la chaussée : écarté', () => {
    const pres = regarder(ranger([immeuble(16, 20)]), ici, 90, cadrePlat(70));
    expect(plateMontreUneFacade(pres)).toBe(true);
    const loin = regarder(ranger([immeuble(DISTANCE_MAX_PLATE_M + 9, 20)]), ici, 90, cadrePlat(70));
    expect(loin.part).toBeGreaterThanOrEqual(PART_DU_CHAMP_MIN_PLATE);
    expect(loin.distance).toBeGreaterThan(DISTANCE_MAX_PLATE_M);
    expect(plateMontreUneFacade(loin)).toBe(false);
    expect(vuesDeFacade(ranger([immeuble(DISTANCE_MAX_PLATE_M + 9, 20)]), { ...plate(90), champ: 70 }, [{ vue: 'photo', cap: 90 }])).toEqual([]);
    // La meme facade lointaine reste une vue de 360 : on peut la recadrer.
    expect(vuesDeFacade(ranger([immeuble(DISTANCE_MAX_PLATE_M + 9, 20)]), pano, cotes).map((v) => v.vue)).toEqual(['droite']);
  });
  it('grand angle depuis la chaussée : la moitié du champ est bâtie, mais le cadre est surtout de la chaussée et du ciel', () => {
    // Un mur bas (4 m) a 25 m, vu par un objectif de 97 degres : il ne tient qu'une bande mince de l'image.
    const r = regarder(ranger([immeuble(31, 4)]), ici, 90, cadrePlat(97));
    expect(r.part).toBeGreaterThanOrEqual(PART_DU_CHAMP_MIN_PLATE);
    expect(r.cadre).toBeLessThan(CADRE_MIN_PLATE);
    expect(plateMontreUneFacade(r)).toBe(false);
  });
  it('la part du cadre grandit quand on s’approche et avec la hauteur du bâtiment', () => {
    const cadre = (x: number, h: number) => regarder(ranger([immeuble(x, h)]), ici, 90, cadrePlat(70)).cadre;
    expect(cadre(16, 20)).toBeGreaterThan(cadre(30, 20));
    expect(cadre(30, 20)).toBeGreaterThan(cadre(30, 5));
    expect(cadre(16, 20)).toBeLessThanOrEqual(1);
  });
  it('une photo plate au cap douteux n’est pas affirmée façade ; un 360 au même endroit l’est', () => {
    const s = ranger([immeuble(16, 20)]);
    expect(vuesDeFacade(s, { ...plate(90), champ: 70, capSur: true }, [{ vue: 'photo', cap: 90 }])).toHaveLength(1);
    expect(vuesDeFacade(s, { ...plate(90), champ: 70, capSur: false }, [{ vue: 'photo', cap: 90 }])).toEqual([]);
    expect(vuesDeFacade(s, { ...pano, capSur: false }, cotes)).toHaveLength(1);
  });
  it('cap douteux : sans boussole et presque à l’arrêt dans sa séquence (rue de Rivoli, un piéton à un passage)', () => {
    const photo = (id: string, rang: number, y: number, exif: Record<string, unknown> = {}, collection = 'c') => ({ id, collection, geometry: { coordinates: [pt(0, y).lon, pt(0, y).lat] }, properties: { 'geovisio:rank_in_collection': rang, exif, 'view:azimuth': 120 }, assets: { hd: { href: 'https://panoramax.openstreetmap.fr/a.jpg' } } });
    const pas = PAS_MIN_CAP_M / 4;
    const arret = [photo('a', 1, 0), photo('b', 2, pas), photo('c', 3, 2 * pas)];
    expect([...capsDouteux(arret)].sort()).toEqual(['a', 'b', 'c']);
    // La meme sequence avec une boussole, ou en marche (un pas franc entre deux photos) : le cap vaut.
    expect(capsDouteux(arret.map((f) => photo(f.id as string, f.properties['geovisio:rank_in_collection'], 0, { 'Exif.GPSInfo.GPSImgDirection': '120/1' }))).size).toBe(0);
    expect(capsDouteux([photo('a', 1, 0), photo('b', 2, 5), photo('c', 3, 10)]).size).toBe(0);
    // Seule de sa sequence dans la reponse : on ne sait pas, elle n'est pas jugee.
    expect(capsDouteux([photo('a', 1, 0), photo('z', 1, 0.2, {}, 'autre')]).size).toBe(0);
    const lues = lirePhotos({ features: arret }, ici, Infinity);
    expect(lues.map((p) => p.capSur)).toEqual([false, false, false]);
    expect(lirePhotos({ features: [photo('a', 1, 0), photo('b', 2, 5)] }, ici, Infinity).map((p) => p.capSur)).toEqual([true, true]);
  });
});

describe('la note d’une vue, de 0 à 100', () => {
  const jour = new Date('2026-11-15T00:00:00Z');
  const vue = (distance: number, incidence: number, cadre: number) => ({ distance, incidence, cadre });
  it('de face, à bonne distance, le cadre plein, une photo récente : 100 ; rien de tout cela : presque rien', () => {
    expect(noteDeVue(vue(12, 90, 0.6), '2026-06-01T10:00:00Z', jour)).toBe(100);
    expect(noteDeVue(vue(40, 35, 0), '2010-01-01T00:00:00Z', jour)).toBeLessThan(10);
  });
  it('chaque part compte : plus près de l’idéal, plus de face, plus de cadre, plus récent', () => {
    const ref = noteDeVue(vue(12, 70, 0.3), '2024-01-01T00:00:00Z', jour);
    expect(noteDeVue(vue(35, 70, 0.3), '2024-01-01T00:00:00Z', jour)).toBeLessThan(ref);
    expect(noteDeVue(vue(4, 70, 0.3), '2024-01-01T00:00:00Z', jour)).toBeLessThan(ref);
    expect(noteDeVue(vue(12, 40, 0.3), '2024-01-01T00:00:00Z', jour)).toBeLessThan(ref);
    expect(noteDeVue(vue(12, 70, 0.1), '2024-01-01T00:00:00Z', jour)).toBeLessThan(ref);
    expect(noteDeVue(vue(12, 70, 0.3), '2017-01-01T00:00:00Z', jour)).toBeLessThan(ref);
  });
  it('sans date, la moitié de la part de la date ; toujours un entier de 0 à 100', () => {
    const avec = noteDeVue(vue(12, 90, 0.6), '2026-06-01T10:00:00Z', jour), sans = noteDeVue(vue(12, 90, 0.6), null, jour);
    expect(avec - sans).toBe(5);
    for (const n of [noteDeVue(vue(0, 0, 0), null, jour), noteDeVue(vue(500, 200, 3), 'pas une date', jour)]) { expect(Number.isInteger(n)).toBe(true); expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(100); }
  });
  it('chaque vue gardée porte sa note, son bâtiment et la distance à sa façade', () => {
    const [v] = vuesDeFacade(ranger([maison('est', 13, 0)]), { ...pano, date: '2026-06-01T10:00:00Z' }, [{ vue: 'droite', cap: 90 }], jour);
    expect(v).toMatchObject({ vue: 'droite', batiment: 'est' });
    expect(v?.note).toBeGreaterThan(50);
    expect(v?.distanceFacade).toBeGreaterThan(7.9);
    expect(v?.distanceFacade).toBeLessThan(10);
  });
});
