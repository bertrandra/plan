import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOTES_PANORAMAX, HOTES_REDIRECTION_PANORAMAX, capVers, chercherPhotosRue, ecartAngulaire, lirePhotosRue, urlRechercheRue, type PhotoRue } from '../../../src/geo/panoramax.js';

// Une reponse STAC comme l'API la rend : une photo plate, un panoramique, une photo sans position, une servie ailleurs.
const reponse = {
  features: [
    { id: 'plate', geometry: { type: 'Point', coordinates: [2.1328, 48.9048] }, properties: { 'view:azimuth': 10, 'pers:interior_orientation': { field_of_view: 40, sensor_array_dimensions: [3000, 4000] }, datetime: '2026-06-06T21:51:30Z', 'geovisio:producer': 'pyrog', license: 'CC-BY-SA-4.0' },
      assets: { hd: { href: 'https://panoramax.openstreetmap.fr/images/a.jpg' }, sd: { href: 'https://panoramax.openstreetmap.fr/derivates/a/sd.jpg' }, thumb: { href: 'https://panoramax.openstreetmap.fr/derivates/a/thumb.jpg' } } },
    { id: 'pano', geometry: { type: 'Point', coordinates: [2.1327, 48.9047] }, properties: { 'view:azimuth': 109, 'pers:interior_orientation': { field_of_view: 360 }, datetime: '2018-03-21T10:00:00Z' },
      assets: { hd: { href: 'https://panoramax.ign.fr/images/b.jpg' }, thumb: { href: 'https://panoramax.ign.fr/derivates/b/thumb.jpg' } } },
    { id: 'sansPosition', properties: {}, assets: { hd: { href: 'https://panoramax.ign.fr/images/c.jpg' } } },
    { id: 'ailleurs', geometry: { type: 'Point', coordinates: [2.1, 48.9] }, properties: {}, assets: { hd: { href: 'https://exemple.org/d.jpg' } } },
  ],
};

describe('lirePhotosRue', () => {
  it('lit position, cap, champ, dimensions, image et credits ; ecarte ce qui manque ou vient d ailleurs', () => {
    const photos = lirePhotosRue(reponse);
    expect(photos.map((p) => p.id)).toEqual(['plate', 'pano']);
    const [plate, pano] = photos as [PhotoRue, PhotoRue];
    expect(plate).toMatchObject({ lat: 48.9048, lon: 2.1328, azimut: 10, champ: 40, panoramique: false, largeurPx: 3000, hauteurPx: 4000, auteur: 'pyrog', licence: 'CC-BY-SA-4.0', date: '2026-06-06T21:51:30Z' });
    expect(plate.vignette).toBe('https://panoramax.openstreetmap.fr/derivates/a/thumb.jpg');
    expect(pano).toMatchObject({ panoramique: true, champ: 360, azimut: 109, auteur: null, licence: null });
  });
  it('rend une liste vide pour une reponse sans features', () => {
    expect(lirePhotosRue(null)).toEqual([]);
    expect(lirePhotosRue({})).toEqual([]);
  });
});

describe('urlRechercheRue et chercherPhotosRue', () => {
  it('cherche dans une emprise carree autour du point', async () => {
    const url = urlRechercheRue(48.9, 2.13, 80);
    expect(url.startsWith('https://api.panoramax.xyz/api/search?bbox=')).toBe(true);
    const bbox = new URL(url).searchParams.get('bbox')!.split(',').map(Number) as [number, number, number, number];
    expect(bbox[0]).toBeLessThan(2.13);
    expect(bbox[2]).toBeGreaterThan(2.13);
    // 80 m de latitude font 0,00072 degre environ.
    expect(bbox[3] - bbox[1]).toBeCloseTo(0.00144, 4);
    const lues: string[] = [];
    const photos = await chercherPhotosRue(48.9, 2.13, 80, async (u) => { lues.push(u); return reponse; });
    expect(lues).toEqual([url]);
    expect(photos).toHaveLength(2);
  });
});

describe('angles', () => {
  it('ecartAngulaire prend le chemin le plus court', () => {
    expect(ecartAngulaire(350, 10)).toBe(20);
    expect(ecartAngulaire(10, 350)).toBe(-20);
    expect(ecartAngulaire(0, 180)).toBe(180);
  });
  it('capVers : nord, est', () => {
    expect(capVers(48.9, 2.13, 48.901, 2.13)).toBeCloseTo(0, 3);
    expect(capVers(48.9, 2.13, 48.9, 2.131)).toBeCloseTo(90, 3);
  });
});

describe('la politique de securite livree', () => {
  it('permet chaque hote Panoramax en connect-src et les serveurs d images en img-src', () => {
    const ht = readFileSync(resolve(__dirname, '../../../deploy/htaccess.template'), 'utf8');
    const csp = /Content-Security-Policy "([^"]+)"/.exec(ht)![1]!;
    const directive = (nom: string) => csp.split(';').find((d) => d.trim().startsWith(nom + ' '))!;
    for (const h of [...HOTES_PANORAMAX, ...HOTES_REDIRECTION_PANORAMAX]) expect(directive('connect-src')).toContain(h);
    for (const h of [...HOTES_PANORAMAX.filter((h) => !h.includes('api.')), ...HOTES_REDIRECTION_PANORAMAX]) expect(directive('img-src')).toContain(h);
  });
});
