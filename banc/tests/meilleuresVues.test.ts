// Un batiment, une fois (banc/src/meilleuresVues.ts ; demande du proprietaire, 15 novembre 2026 : « Avoid having 2 times the same
// building »). Les vues se regroupent par facade visee (batiment et cote) ; seule la mieux notee se propose.
import { describe, it, expect } from 'vitest';
import { ranger, regarder, vuesDeFacade, annoter, type Batiment } from '../src/facadesVues.js';
import { aImporter, cleDeVue, compter, doublons, ECART_ENTRE_VUES_M, estDoublon, facadeDe, facadesEnDouble, marquer, marquerDejaLa, noteDePhoto, ordonner, texteDeLImport, texteDesComptes, VUES_PAR_BATIMENT_DEFAUT, type VuesDUnePhoto } from '../src/meilleuresVues.js';
import type { VueAExtraire } from '../src/panoramax.js';

const R = 6371008.8;
/** Une photo a `y` metres au nord de la premiere, dans une rue qui file vers le nord. */
const photo = (id: string, y: number, vues: VueAExtraire[], libre = false): VuesDUnePhoto => ({ photo: { id, lat: 48.9 + (y / R) * (180 / Math.PI), lon: 2.13 }, vues, libre });
const vue = (batiment: string, note: number, cote: 'gauche' | 'droite' = 'droite', face = 0): VueAExtraire => ({ vue: cote, cap: cote === 'droite' ? 90 : 270, batiment, cote: face, note });

describe('un bâtiment, une fois', () => {
  // Six 360 consecutifs, tous les 4 m, devant la meme maison ; le troisieme la voit le mieux.
  const rue = [60, 70, 90, 85, 65, 40].map((note, k) => photo('p' + k, 4 * k, [vue('maison', note)]));
  it('par défaut, une seule vue par façade : la mieux notée ; les autres sont des doublons', () => {
    expect(VUES_PAR_BATIMENT_DEFAUT).toBe(1);
    const d = doublons(rue, VUES_PAR_BATIMENT_DEFAUT);
    expect(rue.map((p) => !d.has(cleDeVue(p.photo.id, 0)))).toEqual([false, false, true, false, false, false]);
  });
  it('dans une même photo aussi : un 360 dont les deux vues tombent sur le même bâtiment n’en propose qu’une', () => {
    const l = [photo('a', 0, [vue('angle', 60, 'gauche'), vue('angle', 80, 'droite')])];
    const d = doublons(l, 1);
    expect([...d]).toEqual([cleDeVue('a', 0)]);
    const vues = marquer('a', l[0]?.vues ?? [], d);
    expect(aImporter(vues).map((v) => v.note)).toEqual([80]);
    expect(estDoublon(vues)).toBe(false);
  });
  it('les différents côtés d’une maison sont des façades différentes, pas des doublons', () => {
    // La meme maison vue de deux rues : par son cote 0 et par son cote 1.
    const l = [photo('rue1-a', 0, [vue('maison', 80, 'droite', 0)]), photo('rue1-b', 5, [vue('maison', 70, 'droite', 0)]), photo('rue2-a', 30, [vue('maison', 60, 'gauche', 1)]), photo('rue2-b', 35, [vue('maison', 50, 'gauche', 1)])];
    expect([...doublons(l, 1)].sort()).toEqual([cleDeVue('rue1-b', 0), cleDeVue('rue2-b', 0)]);
    expect([facadeDe(vue('m', 1, 'droite', 0)), facadeDe(vue('m', 1, 'droite', 1)), facadeDe({ batiment: 'm' }), facadeDe({})]).toEqual(['m/0', 'm/1', 'm/0', null]);
  });
  it('deux, trois, toutes : la deuxième se prend d’ailleurs que la première quand c’est possible', () => {
    // p2 (90) d'abord ; p3 (85) et p1 (70) sont a 4 m d'elle, p4 (65) a 8 m.
    expect(ECART_ENTRE_VUES_M).toBeGreaterThan(4);
    const d = doublons(rue, 2);
    expect(rue.map((p) => !d.has(cleDeVue(p.photo.id, 0)))).toEqual([false, false, true, false, true, false]);
    expect(rue.length - doublons(rue, 3).size).toBe(3);
    expect(doublons(rue, 'toutes').size).toBe(0);
    const serrees = [photo('a', 0, [vue('m', 50)]), photo('b', 1, [vue('m', 80)]), photo('c', 2, [vue('m', 70)])];
    expect([...doublons(serrees, 2)]).toEqual([cleDeVue('a', 0)]);
  });
  it('un long immeuble (rue de Rivoli) n’est proposé qu’une fois par côté, pas une fois par photo', () => {
    const long = Array.from({ length: 30 }, (_, k) => photo('q' + String(k).padStart(2, '0'), 5 * k, [vue('ilot', 90 - k)]));
    expect(long.length - doublons(long, 1).size).toBe(1);
  });
  it('chaque bâtiment a sa vue : les deux côtés de la rue se jugent séparément', () => {
    const l = [photo('a', 0, [vue('ouest', 50, 'gauche'), vue('est', 90)]), photo('b', 10, [vue('ouest', 80, 'gauche'), vue('est', 60)]), photo('c', 20, [vue('ouest', 70, 'gauche'), vue('est', 40)])];
    const d = doublons(l, 1);
    expect([...d].sort()).toEqual([cleDeVue('a', 0), cleDeVue('b', 1), cleDeVue('c', 0), cleDeVue('c', 1)].sort());
    // La photo c n'a plus que des doublons : visible, pas proposee ; a et b gardent une vue chacune.
    expect(estDoublon(marquer('c', l[2]?.vues ?? [], d))).toBe(true);
    expect(aImporter(marquer('a', l[0]?.vues ?? [], d)).map((v) => v.batiment)).toEqual(['est']);
  });
  it('les vues choisies à la main ne sont jamais des doublons, et ne prennent la place de personne', () => {
    const l = [photo('main', 0, [vue('maison', 10)], true), ...rue];
    const d = doublons(l, 1);
    expect(d.has(cleDeVue('main', 0))).toBe(false);
    expect(l.length - 1 - d.size).toBe(1);
  });
  it('à note égale, le choix ne dépend pas de l’ordre d’arrivée', () => {
    const l = [photo('a', 0, [vue('m', 70)]), photo('b', 20, [vue('m', 70)]), photo('c', 40, [vue('m', 70)])];
    expect([...doublons(l, 1)].sort()).toEqual([...doublons([...l].reverse(), 1)].sort());
  });
  it('une vue sans bâtiment (tri décoché, rien de vu) n’est jamais un doublon', () => {
    expect(doublons([photo('a', 0, [{ vue: 'gauche', cap: 270 }]), photo('b', 1, [{ vue: 'gauche', cap: 270 }])], 1).size).toBe(0);
    expect(facadesEnDouble([{ vue: 'gauche', cap: 270 }, { vue: 'gauche', cap: 270 }] as VueAExtraire[])).toBe(0);
  });
});

describe('le côté d’un bâtiment, lu sur la géométrie', () => {
  const ici = { lat: 48.905067, lon: 2.132536 };
  const pt = (x: number, y: number) => ({ lat: ici.lat + (y / R) * (180 / Math.PI), lon: ici.lon + (x / (R * Math.cos((ici.lat * Math.PI) / 180))) * (180 / Math.PI) });
  const maison: Batiment = { id: 'm', contour: [pt(-6, -4), pt(6, -4), pt(6, 4), pt(-6, 4), pt(-6, -4)] };
  const s = ranger([maison]);
  it('quatre faces, quatre côtés ; deux prises de vue devant la même face, le même côté', () => {
    const sud = regarder(s, pt(0, -15), 0).cote, sudPlusLoin = regarder(s, pt(3, -18), 350).cote, est = regarder(s, pt(18, 0), 270).cote, nord = regarder(s, pt(0, 15), 180).cote, ouest = regarder(s, pt(-18, 0), 90).cote;
    expect(sudPlusLoin).toBe(sud);
    expect(new Set([sud, est, nord, ouest]).size).toBe(4);
  });
  it('une maison de biais garde ses quatre côtés (ils se comptent depuis son plus long mur, pas depuis le nord)', () => {
    const tourner = (x: number, y: number, a = Math.PI / 5) => pt(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
    const biais = ranger([{ id: 'b', contour: [tourner(-6, -4), tourner(6, -4), tourner(6, 4), tourner(-6, 4), tourner(-6, -4)] }]);
    const cotes = [[0, -15, 0], [18, 0, 270], [0, 15, 180], [-18, 0, 90]].map(([x, y, cap]) => { const p = tourner(x as number, y as number); return regarder(biais, p, (cap as number) - 36).cote; });
    expect(new Set(cotes).size).toBe(4);
  });
  it('le tri donne son côté à chaque vue gardée ; une vue choisie à la main dit son bâtiment sans bouger ni partir', () => {
    const [v] = vuesDeFacade(s, { ...pt(0, -15), azimut: 90 }, [{ vue: 'gauche', cap: 0 }]);
    expect(v).toMatchObject({ batiment: 'm' });
    expect(typeof v?.cote).toBe('number');
    const main = annoter(s, pt(0, -15), [{ vue: 'choisie', cap: 5 }, { vue: 'choisie', cap: 180 }]);
    expect(main.map((x) => [x.cap, x.batiment ?? null])).toEqual([[5, 'm'], [180, null]]);
    expect(main[0]?.cote).toBe(v?.cote);
  });
});

describe('ce que l’écran dit avant l’import', () => {
  it('« N façades de N bâtiments » ; sans bâtiment connu, les vues et les photos', () => {
    expect(texteDeLImport([vue('a', 1), vue('b', 1, 'gauche'), vue('b', 1, 'droite', 1)], 2)).toBe('Importer 3 façades de 2 bâtiments');
    expect(texteDeLImport([vue('a', 1)], 1)).toBe('Importer 1 façade de 1 bâtiment');
    expect(texteDeLImport([{}, {}], 1)).toBe('Importer 2 vue(s) de 1 photo(s)');
    expect(texteDeLImport([], 0)).toBe('Importer 0 vue(s) de 0 photo(s)');
  });
  it('les façades cochées deux fois se comptent (un doublon coché à la main, des vues choisies à la main) ; deux côtés n’en sont pas', () => {
    expect(facadesEnDouble([vue('a', 1), vue('a', 2), vue('a', 3), vue('b', 1), vue('b', 1), vue('c', 1)])).toBe(2);
    expect(facadesEnDouble([vue('a', 1, 'droite', 0), vue('a', 1, 'gauche', 1)])).toBe(0);
    expect(facadesEnDouble([])).toBe(0);
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

describe('un mur déjà dans le banc ne se propose plus', () => {
  const vues: VueAExtraire[] = [{ vue: 'gauche', cap: 270, batiment: 'A', cote: 1, note: 80 }, { vue: 'droite', cap: 90, batiment: 'B', cote: 3, note: 60 }, { vue: 'choisie', cap: 10 }];

  it('la vue d’une façade du banc est marquée, comme un doublon ; un autre côté du même bâtiment et une vue sans bâtiment ne le sont pas', () => {
    const l = marquerDejaLa(vues, new Set(['A/1', 'B/0']));
    expect(l.map((v) => [v.batiment ?? null, !!v.doublon, !!v.dejaLa])).toEqual([['A', true, true], ['B', false, false], [null, false, false]]);
    // Elle n'est plus de celles qui s'importent ; une photo qui n'a qu'elle n'est plus proposee cochee.
    expect(aImporter(l).map((v) => v.batiment ?? null)).toEqual(['B', null]);
    expect(estDoublon(marquerDejaLa([vues[0] as VueAExtraire], new Set(['A/1'])))).toBe(true);
  });

  it('le réglage décoché (aucun mur donné) ne marque rien', () => {
    expect(marquerDejaLa(vues, new Set())).toEqual(vues);
  });

  it('le compte le dit, parmi les doublons', () => {
    const c = compter([marquerDejaLa(vues, new Set(['A/1']))], 0);
    expect(c).toMatchObject({ facades: 2, doublons: 1, dejaLa: 1 });
    expect(texteDesComptes(c)).toBe('1 photo, 2 façades de 2 bâtiments, 1 doublon dont 1 déjà dans le banc ; 0 écartée : route, campagne ou pas une maison');
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
