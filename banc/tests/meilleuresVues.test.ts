// Un batiment, ses meilleures vues (banc/src/meilleuresVues.ts ; demande du proprietaire, 15 novembre 2026) : la meme maison revient
// dans cinq a dix 360 consecutifs. Les vues se regroupent par batiment vise ; seules les mieux notees se proposent.
import { describe, it, expect } from 'vitest';
import { aImporter, cleDeVue, compter, doublons, ECART_ENTRE_VUES_M, MEME_ENDROIT_M, estDoublon, marquer, noteDePhoto, ordonner, texteDesComptes, type VuesDUnePhoto } from '../src/meilleuresVues.js';
import type { VueAExtraire } from '../src/panoramax.js';

const R = 6371008.8;
/** Une photo a `y` metres au nord de la premiere, dans une rue qui file vers le nord. */
const photo = (id: string, y: number, vues: VueAExtraire[], libre = false): VuesDUnePhoto => ({ photo: { id, lat: 48.9 + (y / R) * (180 / Math.PI), lon: 2.13 }, vues, libre });
const vue = (batiment: string, note: number, cote: 'gauche' | 'droite' = 'droite'): VueAExtraire => ({ vue: cote, cap: cote === 'droite' ? 90 : 270, batiment, note });

describe('les doublons d’un bâtiment', () => {
  // Six 360 consecutifs, tous les 4 m, devant la meme maison ; le troisieme la voit le mieux.
  const rue = [60, 70, 90, 85, 65, 40].map((note, k) => photo('p' + k, 4 * k, [vue('maison', note)]));
  it('deux vues par bâtiment : la meilleure, puis la meilleure prise d’ailleurs', () => {
    const d = doublons(rue, 2);
    // p2 (90) d'abord ; p3 (85) est a 4 m d'elle : la suivante vient de plus loin, p1 (70) est a 4 m aussi, p4 (65) a 8 m.
    expect(ECART_ENTRE_VUES_M).toBeGreaterThan(4);
    expect(rue.map((p) => !d.has(cleDeVue(p.photo.id, 0)))).toEqual([false, false, true, false, true, false]);
  });
  it('une, trois, toutes', () => {
    expect(rue.length - doublons(rue, 1).size).toBe(1);
    expect(doublons(rue, 1).has(cleDeVue('p2', 0))).toBe(false);
    expect(rue.length - doublons(rue, 3).size).toBe(3);
    expect(doublons(rue, 'toutes').size).toBe(0);
  });
  it('un long immeuble (rue de Rivoli) : deux vues par tronçon de façade, pas deux pour tout l’îlot', () => {
    // Trente 360 tous les 5 m devant le meme immeuble de 150 m.
    const long = Array.from({ length: 30 }, (_, k) => photo('q' + String(k).padStart(2, '0'), 5 * k, [vue('ilot', 90)]));
    const gardees = long.filter((p) => !doublons(long, 2).has(cleDeVue(p.photo.id, 0)));
    expect(gardees.length).toBeGreaterThanOrEqual(Math.floor(150 / MEME_ENDROIT_M));
    expect(gardees.length).toBeLessThanOrEqual(15);
    // Jamais plus de deux vues retenues du meme endroit.
    for (const g of gardees) expect(gardees.filter((h) => Math.abs(h.photo.lat - g.photo.lat) * 111320 < MEME_ENDROIT_M - 1).length).toBeLessThanOrEqual(3);
  });
  it('sans vue assez éloignée, la mieux notée qui reste', () => {
    const serrees = [photo('a', 0, [vue('m', 50)]), photo('b', 1, [vue('m', 80)]), photo('c', 2, [vue('m', 70)])];
    expect([...doublons(serrees, 2)]).toEqual([cleDeVue('a', 0)]);
  });
  it('chaque bâtiment a ses vues : les deux côtés d’un 360 se jugent séparément', () => {
    const l = [photo('a', 0, [vue('ouest', 50, 'gauche'), vue('est', 90)]), photo('b', 10, [vue('ouest', 80, 'gauche'), vue('est', 60)]), photo('c', 20, [vue('ouest', 70, 'gauche'), vue('est', 40)])];
    const d = doublons(l, 1);
    expect([...d].sort()).toEqual([cleDeVue('a', 0), cleDeVue('b', 1), cleDeVue('c', 0), cleDeVue('c', 1)].sort());
    // La photo c n'a plus que des doublons : visible, pas proposee ; a et b gardent une vue chacune.
    expect(estDoublon(marquer('c', l[2]?.vues ?? [], d))).toBe(true);
    expect(aImporter(marquer('a', l[0]?.vues ?? [], d)).map((v) => v.batiment)).toEqual(['est']);
    expect(estDoublon(marquer('a', l[0]?.vues ?? [], d))).toBe(false);
  });
  it('les vues choisies à la main ne sont jamais des doublons, et ne prennent la place de personne', () => {
    const l = [photo('main', 0, [vue('m', 10)], true), ...rue.map((p) => ({ ...p, vues: [vue('m', p.vues[0]?.note ?? 0)] }))];
    const d = doublons(l, 2);
    expect(d.has(cleDeVue('main', 0))).toBe(false);
    expect(l.length - 1 - d.size).toBe(2);
  });
  it('avec une parcelle visée : toutes les vues de ses bâtiments restent, le regroupement ne touche que les autres', () => {
    const l = rue.map((p, k) => ({ ...p, vues: [vue('visee', 50 + k, 'gauche'), vue('en-face', p.vues[0]?.note ?? 0)] }));
    const d = doublons(l, 2, new Set(['visee']));
    expect([...d].every((c) => c.endsWith('|1'))).toBe(true);
    expect(d.size).toBe(4);
  });
  it('à note égale, le choix ne dépend pas de l’ordre d’arrivée', () => {
    const l = [photo('a', 0, [vue('m', 70)]), photo('b', 20, [vue('m', 70)]), photo('c', 40, [vue('m', 70)])];
    expect([...doublons(l, 1)].sort()).toEqual([...doublons([...l].reverse(), 1)].sort());
  });
  it('une vue sans bâtiment (pas de tri) n’est jamais un doublon', () => {
    expect(doublons([photo('a', 0, [{ vue: 'gauche', cap: 270 }]), photo('b', 1, [{ vue: 'gauche', cap: 270 }])], 1).size).toBe(0);
  });
});

describe('ce qui s’importe, et la note d’une photo', () => {
  it('une photo cochée importe ses vues qui ne sont pas des doublons ; toute en doublons et cochée quand même, toutes', () => {
    const mixte: VueAExtraire[] = [{ ...vue('a', 80, 'gauche') }, { ...vue('b', 60), doublon: true }];
    expect(aImporter(mixte).map((v) => v.batiment)).toEqual(['a']);
    const tout: VueAExtraire[] = [{ ...vue('a', 80), doublon: true }];
    expect(aImporter(tout)).toHaveLength(1);
    expect(noteDePhoto(mixte)).toBe(80);
    expect(noteDePhoto([{ vue: 'choisie', cap: 10 }])).toBeNull();
    expect(estDoublon([])).toBe(false);
  });
});

describe('l’ordre de la liste', () => {
  const p = (id: string, distance: number, date: string | null) => ({ id, distance, date });
  const photos = [p('a', 30, '2024-05-01T00:00:00Z'), p('b', 10, '2026-05-01T00:00:00Z'), p('c', 20, null), p('d', 5, '2025-05-01T00:00:00Z')];
  const vues: Record<string, VueAExtraire[]> = { a: [{ ...vue('m', 90), distanceFacade: 25 }], b: [{ ...vue('n', 60), distanceFacade: 8 }], c: [{ ...vue('o', 75), distanceFacade: 12 }], d: [{ ...vue('m', 95), distanceFacade: 30, doublon: true }] };
  const de = (x: { id: string }) => vues[x.id] ?? [];
  it('meilleures d’abord, les doublons à la fin même mieux notés', () => {
    expect(ordonner(photos, de, 'note', false).map((x) => x.id)).toEqual(['a', 'c', 'b', 'd']);
  });
  it('plus proches : de la parcelle visée, sinon de la façade regardée', () => {
    expect(ordonner(photos, de, 'distance', true).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(ordonner(photos, de, 'distance', false).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(ordonner([p('x', 1, null), p('y', 50, null)], (q) => [{ ...vue('m', 1), distanceFacade: q.id === 'x' ? 30 : 9 }], 'distance', false).map((x) => x.id)).toEqual(['y', 'x']);
  });
  it('plus récentes, sans date à la fin', () => {
    expect(ordonner(photos, de, 'date', false).map((x) => x.id)).toEqual(['b', 'a', 'c', 'd']);
  });
  it('sans note (pas de tri), l’ordre d’arrivée', () => {
    expect(ordonner(photos, () => [{ vue: 'gauche', cap: 0 }], 'note', false).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('les comptes', () => {
  it('photos, façades à importer, bâtiments regardés, doublons, écartées', () => {
    const c = compter([[vue('a', 1), { ...vue('b', 1), doublon: true }], [vue('b', 2)], [{ ...vue('a', 0), doublon: true }]], 7);
    expect(c).toEqual({ photos: 3, facades: 2, batiments: 2, doublons: 2, ecartees: 7 });
    expect(texteDesComptes(c)).toBe('3 photos, 2 façades de 2 bâtiments, 2 doublons ; 7 écartées : route, campagne ou pas une maison');
    expect(texteDesComptes({ photos: 1, facades: 1, batiments: 1, doublons: 0, ecartees: 1 })).toBe('1 photo, 1 façade de 1 bâtiment, 0 doublon ; 1 écartée : route, campagne ou pas une maison');
  });
});
