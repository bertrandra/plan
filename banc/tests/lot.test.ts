// L'import d'une zone en lot (banc/src/lot.ts ; demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 6 et « Avoid having
// 2 times the same building ») : les paves d'une zone, ce que le lot garde (un batiment une fois, aucun deja dans le banc, un quota par
// troncon, la cible), le recapitulatif, et le parcours a debit borne (pause, service qui limite, arret, reprise, pave en panne).
import { describe, expect, it } from 'vitest';
import type { Batiment } from '../src/facadesVues.js';
import { ATTENTE_SI_LIMITE_MS, alleger, lireCommune, urlCommune, urlContourDeCommune, zoneDuContour, batimentsDuBanc, candidatsDuPave, CIBLE_MAX, dansLaZone, eparpiller, ErreurHttp, Parcours, PAUSE_ENTRE_REQUETES_MS, pavesDeLaZone, POIDS_PAR_VUE_KO, QUOTA_PAR_TRONCON, quotaParPave, recapituler, Selection, surfaceKm2, zoneAutour, zoneDuRectangle, type Candidat, type Zone } from '../src/lot.js';
import type { PhotoRue } from '../src/panoramax.js';

// 2 allee des Limites, Le Vesinet.
const ici = { lat: 48.905067, lon: 2.132536 };
const R = 6371008.8;
const pt = (x: number, y: number) => ({ lat: ici.lat + (y / R) * (180 / Math.PI), lon: ici.lon + (x / (R * Math.cos((ici.lat * Math.PI) / 180))) * (180 / Math.PI) });
const maison = (id: string, x: number, y: number, plus: Partial<Batiment> = {}): Batiment => ({ id, hauteur: 6, usage1: 'Résidentiel', logements: 1, contour: [pt(x - 5, y - 5), pt(x + 5, y - 5), pt(x + 5, y + 5), pt(x - 5, y + 5), pt(x - 5, y - 5)], ...plus });
const pano = (id: string, x: number, y: number, plus: Partial<PhotoRue> = {}): PhotoRue => ({ id, collection: 'seq', ...pt(x, y), azimut: 0, champ: 360, panoramique: true, hd: 'https://h/' + id, sd: null, vignette: null, date: '2025-06-01T10:00:00Z', auteur: null, licence: null, distance: 0, cap: 0, vise: true, capSur: true, forme: 2, ...plus } as PhotoRue);
const candidat = (batiment: string, note: number, troncon = 't', photo = 'p-' + batiment + '-' + note): Candidat => ({ photo: pano(photo, 0, 0), vue: { vue: 'droite', cap: 90, batiment, cote: 3, note }, batiment: maison(batiment, 13, 0), note, troncon, pave: 0 });
const quand = new Date('2026-11-15T12:00:00Z');

describe('la zone et ses pavés', () => {
  const carre = zoneDuRectangle(pt(-450, -450), pt(450, 450));

  it('un rectangle, un point : dedans, dehors, surface', () => {
    expect(dansLaZone(carre, ici)).toBe(true);
    expect(dansLaZone(carre, pt(600, 0))).toBe(false);
    expect(surfaceKm2(carre)).toBeCloseTo(0.81, 2);
    expect(surfaceKm2(zoneAutour(ici))).toBeCloseTo(0.09, 2);
  });

  it('une zone de 900 m de côté fait neuf pavés de 300 m, qui la couvrent sans se chevaucher', () => {
    const { paves, tronque } = pavesDeLaZone(carre);
    expect(paves).toHaveLength(9);
    expect(tronque).toBe(false);
    expect(paves.some((p) => ici.lat >= p.sud && ici.lat <= p.nord && ici.lon >= p.ouest && ici.lon <= p.est)).toBe(true);
    expect(new Set(paves.map((p) => p.sud.toFixed(6) + ':' + p.ouest.toFixed(6))).size).toBe(9);
  });

  it('un triangle ne garde que les pavés qu’il touche ; une zone trop grande est tronquée, et le dit', () => {
    const triangle: Zone = { anneau: [pt(-450, -450), pt(450, -450), pt(-450, 450)] };
    const n = pavesDeLaZone(triangle).paves.length;
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThan(9);
    const grande = pavesDeLaZone(zoneDuRectangle(pt(-3000, -3000), pt(3000, 3000)), 300, 50);
    expect(grande.paves).toHaveLength(50);
    expect(grande.tronque).toBe(true);
    expect(pavesDeLaZone({ anneau: [ici, pt(10, 0)] }).paves).toEqual([]);
  });

  it('l’ordre éparpillé visite toute la zone dès les premiers pavés', () => {
    const o = eparpiller(16);
    expect([...o].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, k) => k));
    // Les quatre premiers sont dans quatre quarts differents de la liste.
    expect(new Set(o.slice(0, 4).map((k) => Math.floor(k / 4))).size).toBe(4);
    expect(eparpiller(1)).toEqual([0]);
  });

  it('un contour de commune se ramène à quelques centaines de points', () => {
    const l = Array.from({ length: 5000 }, (_, k) => pt(Math.cos(k / 800) * 1000, Math.sin(k / 800) * 1000));
    expect(alleger(l).length).toBeLessThanOrEqual(400);
    expect(alleger(l.slice(0, 10))).toHaveLength(10);
  });
});

describe('viser une commune', () => {
  it('le géocodage donne son code, le WFS son contour : le plus grand morceau, allégé', () => {
    expect(urlCommune('Le Vésinet')).toContain('type=municipality');
    expect(lireCommune({ features: [{ properties: { city: 'Le Vésinet', citycode: '78650' } }] })).toEqual({ nom: 'Le Vésinet', code: '78650' });
    expect(lireCommune({ features: [] })).toBeNull();
    expect(decodeURIComponent(urlContourDeCommune("78650' OR 1=1")).replace(/\+/g, ' ')).toContain("code_insee='78650OR11'");
    const grand = Array.from({ length: 900 }, (_, k) => [2.1 + Math.cos(k / 143) * 0.02, 48.9 + Math.sin(k / 143) * 0.01]);
    const z = zoneDuContour({ features: [{ geometry: { type: 'MultiPolygon', coordinates: [[[[2, 48], [2.001, 48], [2, 48.001]]], [grand]] } }] }, 'Le Vésinet');
    expect(z?.nom).toBe('Le Vésinet');
    expect(z?.anneau.length).toBeGreaterThan(200);
    expect(z?.anneau.length).toBeLessThanOrEqual(400);
    expect(zoneDuContour({ features: [] }, 'x')).toBeNull();
  });
});

describe('ce que le lot garde', () => {
  it('un bâtiment, une fois : sa meilleure vue, même vu par deux côtés ou par dix photos', () => {
    const s = new Selection(10, new Set());
    s.ajouter([candidat('A', 60), candidat('A', 85), candidat('A', 70), candidat('B', 50)]);
    expect(s.retenues().map((c) => [c.batiment.id, c.note])).toEqual([['A', 85], ['B', 50]]);
    expect(s.batiments).toBe(2);
  });

  it('aucun bâtiment que le banc a déjà, par quelque côté que ce soit', () => {
    const deja = batimentsDuBanc(['A/0', 'A/2', 'C/1']);
    expect([...deja].sort()).toEqual(['A', 'C']);
    const s = new Selection(10, deja);
    s.ajouter([candidat('A', 95), candidat('B', 50), candidat('C', 80)]);
    expect(s.retenues().map((c) => c.batiment.id)).toEqual(['B']);
    expect(s.dejaLa).toBe(2);
  });

  it('pas dix fois la même rue : le quota par tronçon laisse la place aux autres rues', () => {
    const s = new Selection(100, new Set());
    s.ajouter(Array.from({ length: 12 }, (_, k) => candidat('rue1-' + k, 90 - k, 'rue1')));
    s.ajouter([candidat('rue2-a', 40, 'rue2'), candidat('rue2-b', 30, 'rue2')]);
    const r = s.retenues();
    expect(r.filter((c) => c.troncon === 'rue1')).toHaveLength(QUOTA_PAR_TRONCON);
    expect(r.filter((c) => c.troncon === 'rue2')).toHaveLength(2);
    // Les mieux notees de la rue 1 sont celles gardees.
    expect(r[0]?.note).toBe(90);
  });

  it('pas tout du même pavé : le plafond par pavé oblige le lot à s’étendre', () => {
    expect(quotaParPave(12, 16)).toBe(3);
    expect(quotaParPave(100, 20)).toBe(10);
    expect(quotaParPave(2, 1)).toBe(4);
    const s = new Selection(12, new Set(), 100, 3);
    s.ajouter(Array.from({ length: 10 }, (_, k) => ({ ...candidat('p0-' + k, 90 - k, 't' + k), pave: 0 })));
    s.ajouter(Array.from({ length: 2 }, (_, k) => ({ ...candidat('p1-' + k, 40 - k, 'u' + k), pave: 1 })));
    expect(s.retenues().map((c) => c.pave)).toEqual([0, 0, 0, 1, 1]);
    expect(s.pleine).toBe(false);
  });

  it('s’arrête à la cible, bornée à cinq cents', () => {
    const s = new Selection(3, new Set(), 100);
    s.ajouter(Array.from({ length: 8 }, (_, k) => candidat('b' + k, 50 + k)));
    expect(s.retenues()).toHaveLength(3);
    expect(s.pleine).toBe(true);
    expect(new Parcours(zoneAutour(ici), 9999, new Set(), { lire: async () => ({}), attendre: async () => {} }).selection.cible).toBe(CIBLE_MAX);
  });

  it('le récapitulatif dit le compte, le poids estimé et les types de bâtiment', () => {
    const l = [candidat('A', 80, 't1'), candidat('B', 60, 't2'), { ...candidat('C', 70, 't2'), batiment: maison('C', 13, 0, { logements: 24, etages: 6, hauteur: 20 }) }];
    const r = recapituler(l);
    expect(r).toMatchObject({ facades: 3, batiments: 3, troncons: 2, noteMoyenne: 70 });
    expect(r.poidsMo).toBeCloseTo((3 * POIDS_PAR_VUE_KO) / 1000, 1);
    expect(r.parType).toMatchObject({ maison: 2, immeuble: 1 });
    expect(recapituler([])).toMatchObject({ facades: 0, noteMoyenne: 0 });
  });
});

describe('les candidates d’un pavé', () => {
  it('une rue bordée de deux maisons : une façade de chaque côté, cadrée ; une photo hors de la zone ne compte pas', () => {
    const zone = zoneAutour(ici, 100);
    const l = candidatsDuPave([pano('p1', 0, 0), pano('dehors', 0, 400)], [maison('est', 13, 0), maison('ouest', -13, 0), maison('loin', 13, 400)], zone, 0, quand);
    expect(l.map((c) => c.batiment.id).sort()).toEqual(['est', 'ouest']);
    expect(l.every((c) => c.troncon === 'seq#0' && c.vue.cadre?.source === 'facade' && c.note > 0)).toBe(true);
  });

  it('préfère l’hiver : la même vue prise en janvier est mieux notée qu’en juin', () => {
    const zone = zoneAutour(ici, 100), b = [maison('est', 13, 0)];
    const juin = candidatsDuPave([pano('p', 0, 0)], b, zone, 0, quand)[0], janvier = candidatsDuPave([pano('p', 0, 0, { date: '2025-01-15T10:00:00Z' })], b, zone, 0, quand)[0];
    expect((janvier?.note ?? 0)).toBeGreaterThan(juin?.note ?? 0);
  });
});

describe('le parcours : une requête à la fois, sans rafale', () => {
  const zone = zoneDuRectangle(pt(-290, -140), pt(290, 140));   // deux paves
  const photosDe = (ids: [string, number, number][]) => ({ features: ids.map(([id, x, y]) => ({ id, collection: 'seq', geometry: { coordinates: [pt(x, y).lon, pt(x, y).lat] }, assets: { hd: { href: 'https://panoramax.openstreetmap.fr/' + id + '.jpg' } }, properties: { datetime: '2025-06-01T10:00:00Z', 'view:azimuth': 0, 'pers:interior_orientation': { field_of_view: 360, sensor_array_dimensions: [5760, 2880] } } })) });
  const batimentsDe = (l: Batiment[]) => ({ features: l.map((b) => ({ properties: { cleabs: b.id, hauteur: 6, usage_1: 'Résidentiel', nombre_de_logements: 1 }, geometry: { type: 'Polygon', coordinates: [b.contour.map((p) => [p.lon, p.lat])] } })), numberMatched: l.length });
  const tout = [maison('BATIMENT-O', -150 + 13, 0), maison('BATIMENT-E', 150 + 13, 0)];

  /** Un faux reseau : les photos de chaque pave (une a l'ouest, une a l'est), les batiments, et le journal des attentes. */
  function reseau(plus: { limites?: number; panne?: (url: string, n: number) => boolean } = {}) {
    const attentes: number[] = [], urls: string[] = [];
    let limites = plus.limites ?? 0, n = 0;
    const sources = {
      attendre: async (ms: number) => { attentes.push(ms); },
      lire: async (url: string) => {
        urls.push(url); n++;
        if (limites > 0) { limites--; throw new ErreurHttp(429); }
        if (plus.panne?.(url, n)) throw new ErreurHttp(500);
        if (url.includes('panoramax')) { const ouest = /bbox=([\d.]+)/.exec(url); return photosDe(Number(ouest?.[1]) < ici.lon - 0.0005 ? [['p-ouest', -150, 0]] : [['p-est', 150, 0]]); }
        return batimentsDe(tout);
      },
    };
    return { sources, attentes, urls };
  }

  it('lit chaque pavé (ses photos, puis ses bâtiments), garde une façade par bâtiment, et marque une pause avant chaque requête', async () => {
    const r = reseau(), suivi: string[] = [];
    const p = new Parcours(zone, 10, new Set(), r.sources, (a) => suivi.push(a.etat + ' ' + a.fait + '/' + a.paves), quand);
    expect(p.paves).toHaveLength(2);
    const fin = await p.lancer();
    expect(fin).toMatchObject({ etat: 'fini', fait: 2, paves: 2, photos: 2, pannes: 0 });
    expect(p.selection.retenues().map((c) => c.batiment.id).sort()).toEqual(['BATIMENT-E', 'BATIMENT-O']);
    expect(r.urls).toHaveLength(4);
    expect(r.attentes).toEqual([PAUSE_ENTRE_REQUETES_MS, PAUSE_ENTRE_REQUETES_MS, PAUSE_ENTRE_REQUETES_MS, PAUSE_ENTRE_REQUETES_MS]);
    expect(suivi.at(-1)).toBe('fini 2/2');
  });

  it('s’arrête dès que la cible est atteinte : le second pavé n’est pas lu', async () => {
    const r = reseau(), p = new Parcours(zone, 1, new Set(), r.sources, undefined, quand);
    const fin = await p.lancer();
    expect(fin.retenues).toBe(1);
    expect(r.urls).toHaveLength(2);
    expect(p.etats).toEqual(['lu', 'a-faire']);
  });

  it('un bâtiment déjà dans le banc n’est pas repris', async () => {
    const r = reseau(), p = new Parcours(zone, 10, new Set(['BATIMENT-E']), r.sources, undefined, quand);
    const fin = await p.lancer();
    expect(p.selection.retenues().map((c) => c.batiment.id)).toEqual(['BATIMENT-O']);
    expect(fin.dejaLa).toBeGreaterThanOrEqual(1);
  });

  it('un service qui limite : le parcours attend, réessaie, et continue', async () => {
    const r = reseau({ limites: 1 }), suivi: string[] = [];
    const p = new Parcours(zone, 10, new Set(), r.sources, (a) => { if (a.message) suivi.push(a.message); }, quand);
    expect((await p.lancer()).etat).toBe('fini');
    expect(r.attentes).toContain(ATTENTE_SI_LIMITE_MS);
    expect(suivi[0]).toContain('limite les requêtes');
    expect(p.selection.retenues()).toHaveLength(2);
  });

  it('qui limite encore après les essais : il s’arrête en le disant, garde ce qu’il a, et reprend au même pavé', async () => {
    const r = reseau({ limites: 0 });
    let coupe = false, dejaCoupe = false;
    const lire = r.sources.lire;
    r.sources.lire = async (url: string) => { if (coupe) throw new ErreurHttp(429); return lire(url); };
    // Le service se met a limiter apres le premier pave (une fois : a la reprise il repond de nouveau).
    const p = new Parcours(zone, 10, new Set(), r.sources, (a) => { if (a.fait === 1 && !dejaCoupe) { coupe = true; dejaCoupe = true; } }, quand);
    const arret = await p.lancer();
    expect(arret.etat).toBe('limite');
    expect(arret.message).toContain('reprenez-le');
    expect(arret.retenues).toBe(1);
    coupe = false;
    const fin = await p.lancer();
    expect(fin).toMatchObject({ etat: 'fini', fait: 2 });
    expect(p.selection.retenues()).toHaveLength(2);
  });

  it('s’arrête à la demande, puis reprend où il en était', async () => {
    const r = reseau();
    let demande = false;
    const p: Parcours = new Parcours(zone, 10, new Set(), r.sources, (a) => { if (a.fait === 1 && !demande) { demande = true; p.arreter(); } }, quand);
    expect((await p.lancer()).etat).toBe('arrete');
    expect(p.selection.retenues()).toHaveLength(1);
    expect((await p.lancer()).etat).toBe('fini');
    expect(r.urls).toHaveLength(4);
  });

  it('un pavé en panne est repris une fois à la fin ; encore en panne, il est compté et le reste est gardé', async () => {
    const passagere = reseau({ panne: (_u, n) => n === 1 });
    const p1 = new Parcours(zone, 10, new Set(), passagere.sources, undefined, quand);
    expect(await p1.lancer()).toMatchObject({ etat: 'fini', pannes: 0 });
    expect(p1.selection.retenues()).toHaveLength(2);
    const durable = reseau({ panne: (u) => u.includes('panoramax') && Number(/bbox=([\d.]+)/.exec(u)?.[1]) < ici.lon - 0.0005 });
    const p2 = new Parcours(zone, 10, new Set(), durable.sources, undefined, quand);
    expect(await p2.lancer()).toMatchObject({ etat: 'fini', pannes: 1 });
    expect(p2.selection.retenues().map((c) => c.batiment.id)).toEqual(['BATIMENT-E']);
  });
});
