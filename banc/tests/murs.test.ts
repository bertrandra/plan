// Quel mur chaque image montre (banc/src/murVise.ts, banc/src/murs.ts ; demande du proprietaire, 15 novembre 2026, « niveau suivant »
// n° 4 et « Avoid having 2 times the same building ») : le mur ecrit dans les metadonnees a l'import, le rattrapage des images d'avant,
// les murs deja dans le banc, les doublons, les images d'un meme mur de gauche a droite, le type de batiment.
import { describe, expect, it } from 'vitest';
import { ranger, regarder, vuesDeFacade, type Batiment } from '../src/facadesVues.js';
import { champDeLaFocale, lotsDeRattrapage, murDeVue, retrouverLeMur } from '../src/murVise.js';
import { aRattraper, cleDuMur, deGaucheADroite, doublonsDuBanc, imagesEnTrop, memesMurs, mursDuBanc, rangerParMur, typeDeBatiment } from '../src/murs.js';
import { facadeDe } from '../src/meilleuresVues.js';
import { vuesAExtraire } from '../src/panoramax.js';
import type { MetaImage, MurDeVue } from '../src/types.js';

// 2 allee des Limites, Le Vesinet : la photo est la, dans une rue qui file vers le nord.
const ici = { lat: 48.905067, lon: 2.132536 };
const R = 6371008.8;
const pt = (x: number, y: number) => ({ lat: ici.lat + (y / R) * (180 / Math.PI), lon: ici.lon + (x / (R * Math.cos((ici.lat * Math.PI) / 180))) * (180 / Math.PI) });
const maison = (id: string, x: number, y: number, l = 10, h = 10, plus: Partial<Batiment> = {}): Batiment => ({ id, contour: [pt(x - l / 2, y - h / 2), pt(x + l / 2, y - h / 2), pt(x + l / 2, y + h / 2), pt(x - l / 2, y + h / 2), pt(x - l / 2, y - h / 2)], ...plus });
/** Une maison tournee de `biais` degres autour de son centre. */
const tournee = (id: string, x: number, y: number, l: number, h: number, biais: number): Batiment => {
  const c = Math.cos((biais * Math.PI) / 180), s = Math.sin((biais * Math.PI) / 180);
  const coin = (dx: number, dy: number) => pt(x + dx * c - dy * s, y + dx * s + dy * c);
  return { id, contour: [coin(-l / 2, -h / 2), coin(l / 2, -h / 2), coin(l / 2, h / 2), coin(-l / 2, h / 2), coin(-l / 2, -h / 2)] };
};
const image = (m: Partial<MetaImage>): MetaImage => ({ id: 'i' + Math.random().toString(36).slice(2, 8), importeeLe: '2026-11-15T10:00:00Z', statut: 'importee', source: 'panoramax', bloc: '', verifiee: false, ...m });
const mur = (batiment: string, cote: number, plus: Partial<MurDeVue> = {}): MurDeVue => ({ batiment, cote, ...plus });

describe('murDeVue : le mur d’une vue, pour les métadonnées', () => {
  it('une maison à l’est, vue de la rue : le mur ouest (il regarde vers 270°), de face, à 8 m', () => {
    const b = maison('est', 13, 0, 10, 10, { nature: 'Indifférenciée', usage1: 'Résidentiel', hauteur: 6.4, etages: 2, logements: 1 });
    const r = regarder(ranger([b]), ici, 90);
    const m = murDeVue(b, ici, { cap: 90, cote: r.cote, note: 71, distanceFacade: 8 });
    expect(m).toMatchObject({ batiment: 'est', cote: r.cote, azimut: 270, incidence: 90, distance: 8, note: 71, nature: 'Indifférenciée', usage: 'Résidentiel', hauteur: 6.4, etages: 2, logements: 1 });
    // Le segment est celui du contour qui va du coin sud-ouest au coin nord-ouest : le quatrieme (rang 3).
    expect(m.segment).toBe(3);
  });

  it('le côté est celui du tri, quel que soit le biais de la maison (les deux calculs restent d’accord)', () => {
    for (const biais of [0, 12, 30, 44, 61, 85]) {
      const b = tournee('m', 14, 2, 12, 8, biais), s = ranger([b]);
      for (const cap of [70, 90, 110]) {
        const r = regarder(s, ici, cap);
        if (!r.batiment) continue;
        const m = murDeVue(b, ici, { cap, cote: r.cote });
        expect(m.segment, `biais ${biais}, cap ${cap}`).toBeTypeOf('number');
        // Le tri ne garde un mur que vu a plus de 35 degres : le segment retrouve ici ne peut pas etre un mur en enfilade.
        expect(m.incidence, `biais ${biais}, cap ${cap}`).toBeGreaterThanOrEqual(20);
        // Le mur choisi regarde vers la prise de vue : son azimut est a moins de 90 degres de la direction batiment -> photo (270).
        expect(Math.abs((((m.azimut as number) - 270 + 540) % 360) - 180), `biais ${biais}, cap ${cap}`).toBeLessThan(90);
      }
    }
  });

  it('deux côtés d’une maison d’angle : deux murs, deux azimuts', () => {
    const b = maison('angle', 12, 12, 10, 10);
    const est = murDeVue(b, ici, { cap: 60, cote: 1 }), nord = murDeVue(b, ici, { cap: 30, cote: 2 });
    expect(new Set([est.azimut, nord.azimut]).size).toBe(2);
    expect(cleDuMur(est)).not.toBe(cleDuMur(nord));
  });

  it('sans rien de la BD TOPO sur le bâtiment : ni nature, ni usage, ni hauteur inventés', () => {
    const m = murDeVue(maison('nu', 13, 0), ici, { cap: 90, cote: 3 });
    expect(Object.keys(m).sort()).toEqual(['azimut', 'batiment', 'cote', 'distance', 'incidence', 'segment']);
  });

  it('la clé du mur est celle du tri de l’import (un bâtiment vu par un côté)', () => {
    const b = maison('est', 13, 0), v = vuesDeFacade(ranger([b]), { ...ici, azimut: 0 }, vuesAExtraire({ panoramique: true, azimut: 0, cap: 0 }, 'cotes'))[0];
    expect(v?.batiment).toBe('est');
    expect(cleDuMur(murDeVue(b, ici, { cap: v?.cap ?? 0, cote: v?.cote ?? 0 }))).toBe(facadeDe(v ?? {}));
  });
});

describe('retrouverLeMur : le rattrapage des images importées avant', () => {
  const bats = [maison('est', 13, 0, 10, 10, { usage1: 'Résidentiel', hauteur: 7 }), maison('ouest', -13, 0)];
  const quand = new Date('2026-11-15T12:00:00Z');

  it('une vue tirée d’un 360 tournée vers l’est retrouve la maison de l’est', () => {
    const m = retrouverLeMur({ ...ici, azimut: 90, date: '2025-06-01T10:00:00Z', panoramax: { id: 'p', panoramique: true, cap: 90 } }, bats, quand);
    expect(m).toMatchObject({ batiment: 'est', azimut: 270, usage: 'Résidentiel', hauteur: 7, rattrapeLe: '2026-11-15T12:00:00.000Z' });
    expect(m?.note).toBeGreaterThan(40);
  });

  it('une vue vers la route, ou une image sans cap ni position : rien', () => {
    expect(retrouverLeMur({ ...ici, azimut: 0, panoramax: { id: 'p', panoramique: true } }, bats, quand)).toBeNull();
    expect(retrouverLeMur({ ...ici, azimut: null }, bats, quand)).toBeNull();
    expect(retrouverLeMur({ lat: null, lon: null, azimut: 90 }, bats, quand)).toBeNull();
    expect(retrouverLeMur({ ...ici, azimut: 90 }, [], quand)).toBeNull();
  });

  it('une photo plate prend le champ de sa focale', () => {
    expect(champDeLaFocale(26)).toBeCloseTo(69.4, 1);
    expect(champDeLaFocale(null)).toBe(65);
    expect(retrouverLeMur({ ...ici, azimut: 90, focale35: 26 }, bats, quand)?.batiment).toBe('est');
  });
});

describe('lotsDeRattrapage : des lectures bornées, regroupées par quartier', () => {
  it('les images voisines partagent une lecture ; un autre quartier a la sienne ; le reste attend', () => {
    const l = [image({ id: 'a', ...ici, azimut: 0 }), image({ id: 'b', ...pt(20, 10), azimut: 0 }), image({ id: 'c', lat: 43.3, lon: 5.37, azimut: 0 }), image({ id: 'd', ...pt(5, 5), azimut: 0 })];
    const lots = lotsDeRattrapage(l, 3);
    expect(lots.map((x) => x.images.map((m) => m.id))).toEqual([['a', 'b'], ['c']]);
    const e = lots[0]?.emprise;
    // L'emprise couvre ses images et 90 m autour : 200 m de haut environ.
    expect(e && e.sud < ici.lat && e.nord > pt(20, 10).lat && (e.nord - e.sud) * 111320).toBeGreaterThan(180);
    expect(e && (e.nord - e.sud) * 111320).toBeLessThan(260);
  });
});

describe('les murs du banc : déjà là, doublons, même mur', () => {
  const a1 = image({ id: 'a1', mur: mur('A', 0, { note: 60, azimut: 270 }), lat: ici.lat, lon: ici.lon });
  const a2 = image({ id: 'a2', mur: mur('A', 0, { note: 82, azimut: 270 }), ...pt(0, 6) });
  const a3 = image({ id: 'a3', mur: mur('A', 0, { note: 70, azimut: 270 }), ...pt(0, -6) });
  const autreCote = image({ id: 'a4', mur: mur('A', 1) });
  const b1 = image({ id: 'b1', mur: mur('B', 2) }), b2 = image({ id: 'b2', mur: mur('B', 2), statut: 'rejetee' });
  const sans = image({ id: 's' });
  const toutes = [a1, a2, a3, autreCote, b1, b2, sans];

  it('les murs déjà dans le banc ne comptent pas les images rejetées ni celles sans mur', () => {
    const m = mursDuBanc(toutes);
    expect([...m.keys()].sort()).toEqual(['A/0', 'A/1', 'B/2']);
    expect(m.get('B/2')).toHaveLength(1);
  });

  it('les doublons : le même bâtiment par le même côté, la mieux notée en tête ; un autre côté n’en est pas un', () => {
    const d = doublonsDuBanc(toutes);
    expect(d.map((g) => [g.cle, g.images.map((m) => m.id)])).toEqual([['A/0', ['a2', 'a3', 'a1']]]);
    expect(imagesEnTrop(d)).toBe(2);
    expect(doublonsDuBanc([b1, sans])).toEqual([]);
    // Une image deja corrigee passe devant une mieux notee a peine importee : on ne jette pas un marquage relu.
    expect(doublonsDuBanc([a1, a2, { ...a3, statut: 'corrigee' }])[0]?.images.map((m) => m.id)).toEqual(['a3', 'a2', 'a1']);
  });

  it('les images d’un même mur se rangent de gauche à droite pour qui lui fait face', () => {
    // Le mur regarde vers l'ouest (270) : qui lui fait face regarde vers l'est, sa droite est au sud.
    expect(deGaucheADroite([a1, a2, a3]).map((m) => m.id)).toEqual(['a2', 'a1', 'a3']);
    // Sans azimut du mur, l'ordre d'arrivee.
    expect(deGaucheADroite([b1, sans]).map((m) => m.id)).toEqual(['b1', 's']);
  });

  it('la liste rangée par mur : les groupes d’abord, de gauche à droite, puis les images seules', () => {
    expect(memesMurs([sans, a1, b1, a3, a2]).map((g) => g.images.map((m) => m.id))).toEqual([['a2', 'a1', 'a3']]);
    expect(rangerParMur([sans, a1, b1, a3, a2]).map((m) => m.id)).toEqual(['a2', 'a1', 'a3', 's', 'b1']);
  });

  it('à rattraper : une position, un cap, pas de mur, pas déjà cherché, pas une fusion', () => {
    const l = [image({ id: 'ok', lat: 1, lon: 2, azimut: 90 }), image({ id: 'mur', lat: 1, lon: 2, azimut: 90, mur: mur('A', 0) }), image({ id: 'cherche', lat: 1, lon: 2, azimut: 90, murCherche: '2026-11-15' }),
      image({ id: 'sanscap', lat: 1, lon: 2 }), image({ id: 'rejetee', lat: 1, lon: 2, azimut: 90, statut: 'rejetee' })];
    expect(aRattraper(l).map((m) => m.id)).toEqual(['ok']);
  });
});

describe('typeDeBatiment : une heuristique sur ce que dit la BD TOPO', () => {
  it('maison, immeuble, commerce, autre, non renseigné', () => {
    expect(typeDeBatiment({ usage: 'Résidentiel', logements: 1, etages: 2, hauteur: 6 })).toBe('maison');
    expect(typeDeBatiment({ usage: 'Résidentiel', logements: 24, etages: 6, hauteur: 21 })).toBe('immeuble');
    // Un commerce au rez-de-chaussee d'un immeuble d'habitation reste un immeuble.
    expect(typeDeBatiment({ usage: 'Commercial et services', usage2: 'Résidentiel', logements: 8, hauteur: 18 })).toBe('immeuble');
    expect(typeDeBatiment({ usage: 'Commercial et services', hauteur: 4 })).toBe('commerce');
    expect(typeDeBatiment({ usage: 'Religieux' })).toBe('autre');
    expect(typeDeBatiment({ usage: 'Indifférencié' })).toBe('inconnu');
    expect(typeDeBatiment({})).toBe('inconnu');
  });

  it('sans usage dit, la hauteur et les étages tranchent ; une grande maison haute à un logement reste une maison', () => {
    expect(typeDeBatiment({ usage: 'Indifférencié', hauteur: 5.5 })).toBe('maison');
    expect(typeDeBatiment({ hauteur: 19 })).toBe('immeuble');
    expect(typeDeBatiment({ etages: 5 })).toBe('immeuble');
    expect(typeDeBatiment({ usage: 'Résidentiel', logements: 1, hauteur: 11 })).toBe('maison');
  });
});
