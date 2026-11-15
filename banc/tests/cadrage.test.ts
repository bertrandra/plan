// Le cadrage des vues tirees d'un 360 (banc/src/cadrage.ts, equirect.ts::vueSurLePlan ; demande du proprietaire, 15 novembre 2026,
// « niveau suivant » n° 1, 2 et 5) : le champ et le tangage qui font entrer la facade dans le cadre, la vue face au mur, les retouches
// de la main, ce que les metadonnees en gardent ; et la preference pour l'hiver (meilleuresVues.ts::noteAvecSaison).
import { describe, expect, it } from 'vitest';
import { CADRE_DEFAUT, cadragePourMeta, cadreDeLaVue, cadrerLaFacade, cadrerSurLeMur, CHAMP_MAX, CHAMP_MIN, champMinDuPano, champVertical, hauteurAvecToit, cleDeRetouche, focaleDuChamp, FORME, retoucher, secteurDuCadre, TANGAGE_MAX, tirerLaVue, type Retouche } from '../src/cadrage.js';
import { vueDuPanoramique, vueSurLePlan, type ImageRgba } from '../src/equirect.js';
import type { Batiment } from '../src/facadesVues.js';
import { BONUS_HIVER, noteAvecSaison } from '../src/meilleuresVues.js';

const ici = { lat: 48.905067, lon: 2.132536 };
const R = 6371008.8;
const pt = (x: number, y: number) => ({ lat: ici.lat + (y / R) * (180 / Math.PI), lon: ici.lon + (x / (R * Math.cos((ici.lat * Math.PI) / 180))) * (180 / Math.PI) });
/** Un batiment dont le mur ouest est a `d` metres a l'est de la photo, large de `l` (nord-sud), profond de 10 m, haut de `h`. */
const enFace = (d: number, l: number, h: number | null): Batiment => ({ id: 'b', hauteur: h, contour: [pt(d, -l / 2), pt(d + 10, -l / 2), pt(d + 10, l / 2), pt(d, l / 2), pt(d, -l / 2)] });
/** Le cote du mur ouest (celui qu'on voit de la photo) et son rang, lus comme le fait l'import. */
const COTE_OUEST = 3, SEGMENT_OUEST = 3;
const vue = { cap: 90, cote: COTE_OUEST };

describe('cadrerLaFacade : le champ et le tangage qui font entrer la façade', () => {
  it('un pavillon à seize mètres : le champ se resserre (de 75° à une cinquantaine), le regard à peine levé, la façade et son toit entiers', () => {
    const c = cadrerLaFacade(enFace(16, 10, 6.5), ici, vue);
    expect(c).toMatchObject({ source: 'facade', entier: true });
    expect(c.champ).toBeGreaterThanOrEqual(CHAMP_MIN);
    expect(c.champ).toBeLessThanOrEqual(55);
    expect(c.tangage).toBeGreaterThanOrEqual(5);
    expect(c.tangage).toBeLessThanOrEqual(12);
    // La hauteur de la BD TOPO s'arrete a la gouttiere : le toit (2,9 m de plus ici) est dans le cadre.
    expect(hauteurAvecToit(6.5)).toBeCloseTo(9.4, 1);
    expect(c.tangage + champVertical(c.champ) / 2).toBeGreaterThan((Math.atan((9.4 - 2) / 16) * 180) / Math.PI);
  });

  it('un immeuble de vingt mètres vu de l’autre côté de la rue (seize mètres) : le champ s’ouvre, le regard monte, il tient en entier', () => {
    const c = cadrerLaFacade(enFace(16, 30, 20), ici, vue);
    expect(c.entier).toBe(true);
    expect(c.champ).toBeGreaterThan(75);
    expect(c.tangage).toBeGreaterThan(15);
    // Le haut du mur (48 degres) est sous le bord haut du cadre.
    expect(c.tangage + champVertical(c.champ) / 2).toBeGreaterThan(48);
  });

  it('le même immeuble vu de son trottoir (quatre mètres) : les bornes ne suffisent pas, on garde le haut et on le dit', () => {
    const c = cadrerLaFacade(enFace(4, 30, 18), ici, vue);
    expect(c).toMatchObject({ champ: CHAMP_MAX, tangage: TANGAGE_MAX, entier: false });
  });

  it('une maison vue de coin : ses deux côtés sont dans le cadre, pas le seul côté visé', () => {
    // Le mur ouest va de 4 a 14 m au nord de l'axe du regard : le cadre s'ouvre jusqu'a son coin le plus loin.
    const b: Batiment = { id: 'b', hauteur: 6, contour: [pt(12, 4), pt(22, 4), pt(22, 14), pt(12, 14), pt(12, 4)] };
    const c = cadrerLaFacade(b, ici, vue);
    expect(c.champ / 2).toBeGreaterThan((Math.atan2(14, 12) * 180) / Math.PI - 41);
    expect(c.champ).toBeGreaterThan(90);
  });

  it('pas plus serré que ce que le panoramique contient : 1 600 px de sortie agrandis deux fois au plus', () => {
    expect(champMinDuPano(null)).toBe(CHAMP_MIN);
    expect(champMinDuPano(11000)).toBe(48);   // ramene a 6 000 px par l'import
    expect(champMinDuPano(5660)).toBe(51);
    expect(champMinDuPano(2048)).toBe(75);    // jamais plus large que le cadre d'avant
    const loin = enFace(30, 8, 5);
    expect(cadrerLaFacade(loin, ici, vue).champ).toBe(CHAMP_MIN);
    expect(cadrerLaFacade(loin, ici, vue, champMinDuPano(5660)).champ).toBe(51);
  });

  it('sans hauteur connue, ou sans mur de ce côté devant la vue : le cadre d’avant', () => {
    expect(cadrerLaFacade(enFace(16, 10, null), ici, vue)).toBe(CADRE_DEFAUT);
    expect(cadrerLaFacade(enFace(16, 10, 6.5), ici, { cap: 270, cote: COTE_OUEST })).toBe(CADRE_DEFAUT);
    expect(CADRE_DEFAUT).toEqual({ champ: 75, tangage: 8, source: 'defaut' });
  });

  it('reste dans les bornes pour toute distance et toute hauteur', () => {
    for (const d of [3, 5, 8, 12, 20, 30, 40]) for (const h of [3, 6, 9, 15, 25, 60]) {
      const c = cadrerLaFacade(enFace(d, 12, h), ici, vue);
      expect(c.champ, `${d} m, ${h} m`).toBeGreaterThanOrEqual(CHAMP_MIN);
      expect(c.champ, `${d} m, ${h} m`).toBeLessThanOrEqual(CHAMP_MAX);
      expect(c.tangage, `${d} m, ${h} m`).toBeGreaterThanOrEqual(0);
      expect(c.tangage, `${d} m, ${h} m`).toBeLessThanOrEqual(TANGAGE_MAX);
    }
  });
});

describe('cadrerSurLeMur : la vue face au mur', () => {
  it('un mur vu de face : l’axe perpendiculaire au mur, le cadre du pied au faîte, en 4/3', () => {
    const p = cadrerSurLeMur(enFace(8, 10, 6.5), ici, { cap: 90, segment: SEGMENT_OUEST });
    expect(p?.axe).toBe(90);
    if (!p) return;
    // Le mur va de -5/8 a 5/8 en largeur, de -2/8 (le pied, sous l'objectif a 2 m) a 4,5/8 en hauteur : le cadre le contient, avec de l'air.
    expect(p.x0).toBeLessThan(-0.625); expect(p.x1).toBeGreaterThan(0.625);
    expect(p.y0).toBeLessThan(-0.25); expect(p.y1).toBeGreaterThan((hauteurAvecToit(6.5) - 2) / 8);
    expect((p.x1 - p.x0) / (p.y1 - p.y0)).toBeCloseTo(FORME, 2);
  });

  it('un mur décalé sur le côté : le cadre se décentre, l’axe ne tourne pas', () => {
    const b: Batiment = { id: 'b', hauteur: 6.5, contour: [pt(8, 2), pt(18, 2), pt(18, 12), pt(8, 12), pt(8, 2)] };
    const p = cadrerSurLeMur(b, ici, { cap: 60, segment: SEGMENT_OUEST });
    expect(p?.axe).toBe(90);
    // Le mur est au nord de l'axe (a gauche pour qui regarde l'est) : le cadre est du cote des x negatifs.
    expect((p?.x0 ?? 0) + (p?.x1 ?? 0)).toBeLessThan(-0.5);
  });

  it('impossible : sans hauteur, mur vu de trop biais, segment inconnu', () => {
    expect(cadrerSurLeMur(enFace(8, 10, null), ici, { cap: 90, segment: SEGMENT_OUEST })).toBeNull();
    expect(cadrerSurLeMur(enFace(8, 10, 6.5), ici, { cap: 30, segment: SEGMENT_OUEST })).toBeNull();
    expect(cadrerSurLeMur(enFace(8, 10, 6.5), ici, { cap: 90, segment: 99 })).toBeNull();
  });

  it('un immeuble vu de son pied : le cadre ne monte pas au-delà de 70 degrés', () => {
    const p = cadrerSurLeMur(enFace(4, 30, 30), ici, { cap: 90, segment: SEGMENT_OUEST });
    expect(p && p.y1).toBeLessThan(Math.tan((75 * Math.PI) / 180));
  });
});

describe('cadreDeLaVue : les réglages, dans l’ordre', () => {
  const b = enFace(8, 10, 6.5), photo = { id: 'p', ...ici };
  const sans = new Map<string, Retouche>();

  it('décoché : le cadre d’avant ; coché : celui de la façade ; « sur le mur » : avec son plan', () => {
    expect(cadreDeLaVue(b, photo, vue, { cadrer: false, surLeMur: false, retouches: sans })).toBe(CADRE_DEFAUT);
    expect(cadreDeLaVue(b, photo, vue, { cadrer: true, surLeMur: false, retouches: sans })).toMatchObject({ source: 'facade' });
    expect(cadreDeLaVue(b, photo, vue, { cadrer: true, surLeMur: true, retouches: sans }).plan?.axe).toBe(90);
    // Sans batiment (tri decoche, vue choisie vers rien) : le cadre d'avant, jamais de plan.
    expect(cadreDeLaVue(null, photo, { cap: 90 }, { cadrer: true, surLeMur: true, retouches: sans })).toBe(CADRE_DEFAUT);
  });

  it('une retouche de la main l’emporte, reste dans les bornes, et rend une vue ordinaire', () => {
    const auto = cadreDeLaVue(b, photo, vue, { cadrer: true, surLeMur: false, retouches: sans });
    const retouches = new Map([[cleDeRetouche('p', 90), { dChamp: 10, dTangage: -3 }]]);
    const c = cadreDeLaVue(b, photo, vue, { cadrer: true, surLeMur: true, retouches });
    expect(c).toEqual({ champ: auto.champ + 10, tangage: Math.max(0, auto.tangage - 3), source: 'main' });
    expect(retoucher(CADRE_DEFAUT, 500, 500)).toEqual({ champ: CHAMP_MAX, tangage: TANGAGE_MAX, source: 'main' });
    expect(retoucher(CADRE_DEFAUT, -500, -500)).toEqual({ champ: CHAMP_MIN, tangage: 0, source: 'main' });
  });

  it('la carte dessine le secteur du cadre : son champ, et pour une vue sur plan sa direction décentrée', () => {
    expect(secteurDuCadre(123, undefined)).toEqual({ cap: 123, champ: 75 });
    expect(secteurDuCadre(123, { champ: 48, tangage: 5, source: 'facade' })).toEqual({ cap: 123, champ: 48 });
    const s = secteurDuCadre(60, { champ: 48, tangage: 5, source: 'facade', plan: { axe: 90, x0: -1, x1: 0, y0: -0.3, y1: 0.45 } });
    expect(s.cap).toBeCloseTo(67.5, 5);
    expect(s.champ).toBeCloseTo(45, 5);
  });

  it('les métadonnées gardent le cadre et la focale équivalente ; pas de focale pour une vue sur plan', () => {
    expect(cadragePourMeta(undefined)).toEqual({ cadrage: CADRE_DEFAUT, focale35: focaleDuChamp(75) });
    expect(focaleDuChamp(75)).toBeCloseTo(23.5, 1);
    expect(cadragePourMeta({ champ: 75, tangage: 8, source: 'facade', plan: { axe: 90, x0: -1, x1: 1, y0: -0.5, y1: 1 } }).focale35).toBeNull();
  });
});

describe('vueSurLePlan : la vue décentrée, verticales droites', () => {
  // Un panoramique dont le rouge dit la longitude (0 a 255 sur 360 degres) et le vert la latitude.
  const L = 720, H = 360;
  const pano: ImageRgba = { largeur: L, hauteur: H, donnees: new Uint8ClampedArray(L * H * 4) };
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) { const k = (y * L + x) * 4; pano.donnees[k] = (x / L) * 255; pano.donnees[k + 1] = (y / H) * 255; pano.donnees[k + 3] = 255; }
  const rouge = (img: ImageRgba, i: number, j: number) => img.donnees[(j * img.largeur + i) * 4] as number;

  it('chaque colonne de la vue regarde un seul cap : une verticale du monde reste une colonne, même loin au-dessus de l’axe', () => {
    const v = vueSurLePlan(pano, { capCentre: 0, axe: 0, x0: -0.5, x1: 0.5, y0: -0.3, y1: 2, largeur: 80, hauteur: 60 });
    for (const i of [0, 20, 40, 79]) { const r = [0, 15, 30, 45, 59].map((j) => rouge(v, i, j)); expect(Math.max(...r) - Math.min(...r)).toBeLessThanOrEqual(1); }
    // La vue ordinaire levee de 30 degres, elle, fait converger les verticales : en haut du cadre le bord regarde plus loin sur le cote qu'en bas.
    const t = vueDuPanoramique(pano, { capCentre: 0, cap: 0, tangage: 30, champ: 53, largeur: 80, hauteur: 60 });
    expect(Math.abs(rouge(t, 79, 0) - rouge(t, 79, 59))).toBeGreaterThan(3);
  });

  it('le cadre centré sur l’axe donne la même image que la vue ordinaire sans tangage', () => {
    const demi = Math.tan((30 * Math.PI) / 180);
    const a = vueSurLePlan(pano, { capCentre: 0, axe: 40, x0: -demi, x1: demi, y0: -demi * 0.75, y1: demi * 0.75, largeur: 40, hauteur: 30 });
    const b = vueDuPanoramique(pano, { capCentre: 0, cap: 40, tangage: 0, champ: 60, largeur: 40, hauteur: 30 });
    let ecart = 0;
    for (let k = 0; k < a.donnees.length; k++) ecart = Math.max(ecart, Math.abs((a.donnees[k] as number) - (b.donnees[k] as number)));
    expect(ecart).toBeLessThanOrEqual(1);
  });

  it('tirerLaVue choisit : le plan quand le cadre en a un, sinon la vue à son champ et son tangage (75° et 8° sans cadre)', () => {
    const plan = { axe: 40, x0: -0.4, x1: 0.4, y0: -0.2, y1: 0.4 };
    expect(tirerLaVue(pano, 0, 40, { champ: 75, tangage: 8, source: 'facade', plan }, 40, 30).donnees).toEqual(vueSurLePlan(pano, { capCentre: 0, ...plan, largeur: 40, hauteur: 30 }).donnees);
    expect(tirerLaVue(pano, 0, 40, undefined, 40, 30).donnees).toEqual(vueDuPanoramique(pano, { capCentre: 0, cap: 40, tangage: 8, champ: 75, largeur: 40, hauteur: 30 }).donnees);
    expect(tirerLaVue(pano, 0, 40, { champ: 50, tangage: 20, source: 'facade' }, 40, 30).donnees).toEqual(vueDuPanoramique(pano, { capCentre: 0, cap: 40, tangage: 20, champ: 50, largeur: 40, hauteur: 30 }).donnees);
  });
});

describe('préférer l’hiver', () => {
  it('de novembre à mars la note gagne quelques points, plafonnée à 100 ; le reste de l’année et sans date, rien', () => {
    expect(noteAvecSaison(70, '2025-12-02T10:00:00Z', true)).toBe(70 + BONUS_HIVER);
    expect(noteAvecSaison(70, '2025-03-30T10:00:00Z', true)).toBe(70 + BONUS_HIVER);
    expect(noteAvecSaison(97, '2025-01-15T10:00:00Z', true)).toBe(100);
    expect(noteAvecSaison(70, '2025-07-08T10:00:00Z', true)).toBe(70);
    expect(noteAvecSaison(70, null, true)).toBe(70);
  });

  it('décochée : aucune note ne change', () => {
    expect(noteAvecSaison(70, '2025-12-02T10:00:00Z', false)).toBe(70);
  });
});
