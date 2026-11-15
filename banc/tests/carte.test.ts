// La carte de l'import Panoramax (banc/src/carte.ts) : la projection des tuiles de l'IGN, la vue et ses gestes, les secteurs de vue ;
// la lecture du cadastre par pages (parcelles.ts) et la memoire des panoramiques (cache.ts).
import { describe, it, expect } from 'vitest';
import { barreEchelle, contient, duEcran, duMonde, elargir, empriseAutour, empriseVue, glisser, largeurM, metresEnLocal, metresParPixel, pincer, placementLocal, secteur, texteEchelle, tuiles, urlTuile, versEcran, versLocal, versMonde, zoomerAutour, zoomPourRayon, ZOOM_MAX, ZOOM_MIN, type VueCarte } from '../src/carte.js';
import { Recents } from '../src/cache.js';
import { distanceM } from '../src/panoramax.js';
import { lireLesParcelles, urlParcellesDansEmprise } from '../src/parcelles.js';

// 2 allee des Limites, Le Vesinet.
const ici = { lat: 48.905067, lon: 2.132536 };
const taille = { l: 1000, h: 600 };

describe('la projection de la carte (Web Mercator, la pyramide PM de l’IGN)', () => {
  it('va du terrain au monde et revient ; la tuile de l’adresse est celle que le WMTS numérote', () => {
    const m = versMonde(ici), r = duMonde(m);
    expect(r.lat).toBeCloseTo(ici.lat, 9);
    expect(r.lon).toBeCloseTo(ici.lon, 9);
    expect(versMonde({ lat: 0, lon: 0 })).toEqual({ x: 0.5, y: 0.5 });
    // Au niveau 17 : la colonne et la rangee de la tuile de cette adresse, par la formule habituelle des tuiles (asinh de la tangente).
    const rangee = Math.floor(((1 - Math.asinh(Math.tan((ici.lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** 17);
    expect([Math.floor(m.x * 2 ** 17), Math.floor(m.y * 2 ** 17)]).toEqual([66312, rangee]);
    expect(rangee).toBe(45065);
  });
  it('un pixel vaut ce que dit l’echelle : 100 m a l’est sont a 100 m / (m par px) pixels a droite', () => {
    const v: VueCarte = { ...ici, zoom: 18 };
    const mpp = metresParPixel(ici.lat, 18);
    expect(mpp).toBeCloseTo(0.3926, 3);
    const est = { lat: ici.lat, lon: ici.lon + 0.001 };
    const e = versEcran(est, v, taille);
    expect(e.y).toBeCloseTo(300, 6);
    expect((e.x - 500) * mpp).toBeCloseTo(distanceM(ici, est), 0);
    const retour = duEcran(e, v, taille);
    expect([retour.lat, retour.lon].map((x) => x.toFixed(7))).toEqual([est.lat, est.lon].map((x) => x.toFixed(7)));
    // Le nord est en haut.
    expect(versEcran({ lat: ici.lat + 0.001, lon: ici.lon }, v, taille).y).toBeLessThan(300);
  });
  it('le dessin local (parcelles projetees une fois) retombe a l’ecran par sa transformation, a tout zoom', () => {
    const pt = { lat: ici.lat + 0.0007, lon: ici.lon - 0.0011 }, l = versLocal(pt, ici);
    for (const zoom of [15.3, 18, 20.5]) {
      const v: VueCarte = { lat: ici.lat + 0.0002, lon: ici.lon + 0.0003, zoom };
      const p = placementLocal(ici, v, taille), e = versEcran(pt, v, taille);
      expect(l.x * p.k + p.dx).toBeCloseTo(e.x, 6);
      expect(l.y * p.k + p.dy).toBeCloseTo(e.y, 6);
    }
    // Le halo du rayon : 300 m en unites locales font 300 m a l'ecran.
    const p18 = placementLocal(ici, { ...ici, zoom: 18 }, taille);
    expect(metresEnLocal(300, ici.lat) * p18.k * metresParPixel(ici.lat, 18)).toBeCloseTo(300, 6);
  });
});

describe('la vue de la carte : voir plus loin, zoomer, glisser, pincer', () => {
  it('le cadrage fait tenir le rayon de recherche entier, du plus petit au plus grand (300 m)', () => {
    for (const rayon of [110, 300, 380]) {
      const zoom = zoomPourRayon(ici.lat, rayon, taille);
      const px = rayon / metresParPixel(ici.lat, zoom);
      expect(px).toBeLessThanOrEqual(300);
      expect(px).toBeGreaterThan(300 / 1.2);
    }
    // Bornee : ni plus pres que la facade, ni plus loin que le quartier.
    expect(zoomPourRayon(ici.lat, 1, taille)).toBe(ZOOM_MAX);
    expect(zoomPourRayon(ici.lat, 50000, taille)).toBe(ZOOM_MIN);
  });
  it('la molette garde sous le curseur le meme point du terrain, et s’arrete aux bornes', () => {
    const v: VueCarte = { ...ici, zoom: 17 }, ancre = { x: 820, y: 130 };
    const sous = duEcran(ancre, v, taille);
    const z = zoomerAutour(v, ancre, taille, 1.5);
    expect(z.zoom).toBe(18.5);
    const apres = versEcran(sous, z, taille);
    expect([apres.x, apres.y].map((x) => Math.round(x * 1000) / 1000)).toEqual([820, 130]);
    expect(zoomerAutour(v, ancre, taille, 40).zoom).toBe(ZOOM_MAX);
    expect(zoomerAutour(v, ancre, taille, -40).zoom).toBe(ZOOM_MIN);
  });
  it('glisser deplace le terrain avec le doigt ; pincer zoome du rapport des ecarts sous les doigts', () => {
    const v: VueCarte = { ...ici, zoom: 18 };
    const g = glisser(v, 120, -40), e = versEcran(ici, g, taille);
    expect([e.x, e.y].map(Math.round)).toEqual([620, 260]);
    const milieu0 = { x: 400, y: 300 }, sous = duEcran(milieu0, v, taille);
    const p = pincer(v, taille, milieu0, 100, { x: 450, y: 320 }, 200);
    expect(p.zoom).toBeCloseTo(19, 9);
    const ou = versEcran(sous, p, taille);
    expect([ou.x, ou.y].map(Math.round)).toEqual([450, 320]);
  });
  it('l’emprise montree, ce qu’elle contient, et sa largeur en metres', () => {
    const v: VueCarte = { ...ici, zoom: 18 }, e = empriseVue(v, taille);
    expect(largeurM(e)).toBeCloseTo(1000 * metresParPixel(ici.lat, 18), 0);
    expect(e.nord).toBeGreaterThan(ici.lat);
    expect(e.ouest).toBeLessThan(ici.lon);
    const autour = empriseAutour(ici, 150);
    expect(largeurM(autour)).toBeCloseTo(300, 0);
    expect(contient(elargir(e, 0.15), e)).toBe(true);
    expect(contient(e, elargir(e, 0.15))).toBe(false);
    expect(contient(autour, empriseAutour(ici, 100))).toBe(true);
  });
});

describe('les tuiles du fond de plan', () => {
  it('couvrent toute la carte, sans trou ni doublon, au niveau entier le plus proche (19 au plus)', () => {
    for (const zoom of [15.4, 17, 17.6, 20.8]) {
      const v: VueCarte = { ...ici, zoom }, l = tuiles(v, taille);
      const z = Math.min(19, Math.round(zoom));
      expect(new Set(l.map((t) => t.z))).toEqual(new Set([z]));
      expect(new Set(l.map((t) => `${t.x}/${t.y}`)).size).toBe(l.length);
      expect(l[0]?.cote).toBeCloseTo(256 * 2 ** (zoom - z), 9);
      expect(Math.min(...l.map((t) => t.gauche))).toBeLessThanOrEqual(0);
      expect(Math.min(...l.map((t) => t.haut))).toBeLessThanOrEqual(0);
      expect(Math.max(...l.map((t) => t.gauche + t.cote))).toBeGreaterThanOrEqual(taille.l);
      expect(Math.max(...l.map((t) => t.haut + t.cote))).toBeGreaterThanOrEqual(taille.h);
      // La tuile qui porte le centre de la vue est bien sous le milieu de la carte.
      const m = versMonde(ici), c = l.find((t) => t.x === Math.floor(m.x * 2 ** z) && t.y === Math.floor(m.y * 2 ** z));
      expect(c && c.gauche <= 500 && c.gauche + c.cote >= 500 && c.haut <= 300 && c.haut + c.cote >= 300).toBe(true);
    }
  });
  it('viennent du WMTS de la Geoplateforme, sans cle : le Plan IGN v2 en PNG, la photo aerienne en JPEG', () => {
    const plan = new URL(urlTuile('plan', 17, 66312, 45065)), photo = new URL(urlTuile('photo', 17, 66312, 45065));
    expect(plan.origin + plan.pathname).toBe('https://data.geopf.fr/wmts');
    expect([plan.searchParams.get('LAYER'), plan.searchParams.get('FORMAT'), plan.searchParams.get('TILEMATRIXSET'), plan.searchParams.get('TILEMATRIX'), plan.searchParams.get('TILECOL'), plan.searchParams.get('TILEROW')])
      .toEqual(['GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png', 'PM', '17', '66312', '45065']);
    expect([photo.searchParams.get('LAYER'), photo.searchParams.get('FORMAT')]).toEqual(['ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg']);
    expect([...plan.searchParams.keys()].some((k) => /key|cle|apikey/i.test(k))).toBe(false);
  });
});

describe('le dessin de la carte : secteurs de vue et barre d’echelle', () => {
  it('un secteur s’ouvre de son champ autour du cap, le nord en haut', () => {
    // Vers l'est, 90 degres de champ, 10 px : de (nord-est) a (sud-est), par un arc dans le sens des aiguilles.
    expect(secteur({ x: 0, y: 0 }, 90, 90, 10)).toBe('M0.0 0.0L7.1 -7.1A10 10 0 0 1 7.1 7.1Z');
    // Vers le nord, 75 degres (une vue d'un 360) : symetrique autour de l'axe vertical, au-dessus du point.
    const m = /L(-?[\d.]+) (-?[\d.]+)A.* (-?[\d.]+) (-?[\d.]+)Z$/.exec(secteur({ x: 100, y: 50 }, 0, 75, 20));
    expect(m?.slice(1).map(Number)).toEqual([87.8, 34.1, 112.2, 34.1]);
    // Un champ de plus de 180 degres prend le grand arc.
    expect(secteur({ x: 0, y: 0 }, 0, 200, 10)).toContain('A10 10 0 1 1');
  });
  it('la barre d’echelle prend la plus grande longueur ronde qui tient', () => {
    expect(barreEchelle(0.39)).toEqual({ metres: 20, px: 20 / 0.39 });
    expect(barreEchelle(1.3).metres).toBe(100);
    expect(barreEchelle(12).metres).toBe(1000);
    expect([texteEchelle(50), texteEchelle(2000)]).toEqual(['50 m', '2 km']);
  });
});

describe('le cadastre de l’emprise montree, lu par pages', () => {
  const parcelle = (k: number) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[2.13, 48.9], [2.131, 48.9], [2.131, 48.901], [2.13, 48.9]]] }, properties: { idu: 'P' + k, section: 'AE', numero: String(k) } });
  const page = (debut: number, n: number, total: number) => ({ numberMatched: total, features: Array.from({ length: n }, (_, i) => parcelle(debut + i)) });
  const e = { sud: 48.9, ouest: 2.13, nord: 48.91, est: 2.14 };
  it('l’URL porte l’emprise en latitude d’abord et le rang de depart', () => {
    const u = new URL(urlParcellesDansEmprise(e, 1000, 2000));
    expect([u.searchParams.get('COUNT'), u.searchParams.get('STARTINDEX'), u.searchParams.get('BBOX')]).toEqual(['1000', '2000', '48.900000,2.130000,48.910000,2.140000,urn:ogc:def:crs:EPSG::4326']);
  });
  it('une seule page quand tout y tient ; plusieurs sinon ; « tronque » quand il en reste apres la derniere page permise', async () => {
    const lues: number[] = [];
    const lire = (total: number) => async (url: string) => { const d = Number(new URL(url).searchParams.get('STARTINDEX')); lues.push(d); return page(d, Math.max(0, Math.min(10, total - d)), total); };
    expect(await lireLesParcelles(e, lire(7), 3, 10).then((r) => [r.parcelles.length, r.tronque, lues.splice(0)])).toEqual([7, false, [0]]);
    expect(await lireLesParcelles(e, lire(25), 3, 10).then((r) => [r.parcelles.length, r.tronque, lues.splice(0)])).toEqual([25, false, [0, 10, 20]]);
    expect(await lireLesParcelles(e, lire(30), 3, 10).then((r) => [r.parcelles.length, r.tronque, lues.splice(0)])).toEqual([30, false, [0, 10, 20]]);
    expect(await lireLesParcelles(e, lire(31), 3, 10).then((r) => [r.parcelles.length, r.tronque, lues.splice(0)])).toEqual([30, true, [0, 10, 20]]);
  });
  it('sans total annonce, une page pleine en demande une autre ; une parcelle rendue deux fois compte une fois', async () => {
    const lire = async (url: string) => { const d = Number(new URL(url).searchParams.get('STARTINDEX')); return { features: d === 0 ? [parcelle(1), parcelle(2)] : [parcelle(2)] }; };
    const r = await lireLesParcelles(e, lire, 3, 2);
    expect([r.parcelles.map((p) => p.idu), r.tronque]).toEqual([['P1', 'P2'], false]);
  });
});

describe('la memoire des panoramiques deja lus', () => {
  it('garde les derniers, rend le plus ancien quand il y en a trop, et relire remet en tete', () => {
    const rendus: string[] = [];
    const m = new Recents<string>(2, (v) => rendus.push(v));
    m.garder('a', 'A'); m.garder('b', 'B');
    expect(m.lire('a')).toBe('A');
    m.garder('c', 'C');
    expect([m.cles, rendus, m.lire('b')]).toEqual([['a', 'c'], ['B'], undefined]);
    m.garder('a', 'A2');
    expect([m.taille, rendus]).toEqual([2, ['B', 'A']]);
    m.vider();
    expect([m.taille, rendus.length]).toEqual([0, 4]);
  });
});
