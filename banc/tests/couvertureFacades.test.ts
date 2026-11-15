// La couverture qui dit ou sont les facades (banc/src/couvertureFacades.ts, casesBatiments.ts ; demande du proprietaire, 15 novembre
// 2026) : les troncons des traces sans batiment a portee en gris. Regle d'or : jamais de gris quand on ne sait pas.
import { describe, it, expect } from 'vitest';
import { empriseVue, largeurM } from '../src/carte.js';
import { DELAI_PANNE_MS, LecteurDeCases } from '../src/casesBatiments.js';
import { caseDuPoint, casesDeLEmprise, cleDeCase, empriseDeLaCase, jugeParMailles, LARGEUR_FACADES_MAX_M, legendeDesFacades, MARGE_CASE_M, metresParUnite, partagerLeTrace, PAS_TRONCON_M, versLlDeLaTuile } from '../src/couvertureFacades.js';
import { DISTANCE_MAX_M, facadeAPortee, ranger, type Batiment } from '../src/facadesVues.js';
import { distanceM } from '../src/panoramax.js';

const ici = { lat: 48.905067, lon: 2.132536 };
const R = 6371008.8;
const pt = (x: number, y: number) => ({ lat: ici.lat + (y / R) * (180 / Math.PI), lon: ici.lon + (x / (R * Math.cos((ici.lat * Math.PI) / 180))) * (180 / Math.PI) });
const maison = (id: string, x: number, y: number, l = 10, h = 10): Batiment => ({ id, contour: [pt(x - l / 2, y - h / 2), pt(x + l / 2, y - h / 2), pt(x + l / 2, y + h / 2), pt(x - l / 2, y + h / 2), pt(x - l / 2, y - h / 2)] });

describe('une façade à portée d’un point de la rue', () => {
  it('à moins de 40 m d’un mur de maison : oui ; au-delà : non ; un garage ne compte pas', () => {
    const s = ranger([maison('m', 0, 0)]);
    expect(facadeAPortee(s, pt(DISTANCE_MAX_M, 0))).toBe(true);
    expect(facadeAPortee(s, pt(DISTANCE_MAX_M + 10, 0))).toBe(false);
    expect(facadeAPortee(s, pt(5 + 28, 5 + 28))).toBe(true);
    expect(facadeAPortee(s, pt(5 + 30, 5 + 30))).toBe(false);
    expect(facadeAPortee(ranger([{ ...maison('g', 0, 0, 6, 6), usage1: 'Annexe' }]), pt(10, 0))).toBe(false);
    expect(facadeAPortee(ranger([]), ici)).toBe(false);
  });
});

describe('le partage d’un tracé en orange et gris', () => {
  // Un trace droit de 0 a 1000 unites ; des facades seulement entre 300 et 600.
  const ligne = Float32Array.from([0, 0, 1000, 0]);
  const juge = (connu: boolean) => (x: number) => (connu ? x >= 300 && x < 600 : null);
  it('les tronçons sans façade en gris, ceux avec en orange, bout à bout', () => {
    const r = partagerLeTrace(ligne, juge(true), 50);
    expect(r.orange.map((l) => [l[0], l[l.length - 2]])).toEqual([[300, 600]]);
    expect(r.gris.map((l) => [l[0], l[l.length - 2]])).toEqual([[0, 300], [600, 1000]]);
    // Rien n'est perdu ni double : les longueurs s'ajoutent.
    const longueur = (ls: Float32Array[]) => ls.reduce((n, l) => n + ((l[l.length - 2] as number) - (l[0] as number)), 0);
    expect(longueur(r.orange) + longueur(r.gris)).toBe(1000);
  });
  it('quand on ne sait pas (bâtiments pas lus, en panne), tout reste orange : jamais de gris', () => {
    const r = partagerLeTrace(ligne, juge(false), 50);
    expect(r.gris).toEqual([]);
    expect(r.orange).toHaveLength(1);
    expect([r.orange[0]?.[0], r.orange[0]?.[r.orange[0].length - 2]]).toEqual([0, 1000]);
  });
  it('un tracé à plusieurs sommets garde ses angles, et une séquence d’une seule photo reste un point', () => {
    const r = partagerLeTrace(Float32Array.from([0, 0, 100, 0, 100, 100]), () => false, 40);
    expect(r.gris).toHaveLength(1);
    const g = r.gris[0] as Float32Array;
    expect([g[0], g[1], g[g.length - 2], g[g.length - 1]]).toEqual([0, 0, 100, 100]);
    expect(Array.from(g).join(',')).toContain('100,0');
    expect(partagerLeTrace(Float32Array.from([5, 5]), () => false, 40).gris).toHaveLength(1);
    expect(partagerLeTrace(Float32Array.from([5, 5]), () => null, 40).orange).toHaveLength(1);
  });
  it('le juge par mailles ne regarde qu’une fois chaque maille', () => {
    let appels = 0;
    const j = jugeParMailles((x) => { appels++; return x > 50; }, 10);
    expect([j(1, 1), j(9, 9), j(55, 2), j(58, 3)]).toEqual([false, false, true, true]);
    expect(appels).toBe(2);
  });
  it('des unités d’une tuile aux degrés et aux mètres', () => {
    // La tuile 14/8291/5633 (Le Vesinet) : son coin et son milieu, et le pas d'un troncon.
    const versLl = versLlDeLaTuile(14, 8291, 5633, 4096), coin = versLl(0, 0), bout = versLl(4096, 0);
    expect(caseDuPoint(versLl(2048, 2048), 14)).toEqual({ x: 8291, y: 5633 });
    const m = metresParUnite(14, 5633, 4096);
    expect(distanceM(coin, bout) / 4096).toBeCloseTo(m, 3);
    expect(PAS_TRONCON_M / m).toBeGreaterThan(10);
  });
});

describe('les cases par lesquelles les bâtiments se lisent', () => {
  it('une vue de 800 m touche quatre cases au plus, et le seuil tient dans la vue des photos', () => {
    const e = empriseVue({ ...ici, zoom: 17 }, { l: 1000, h: 640 });
    expect(largeurM(e)).toBeLessThanOrEqual(LARGEUR_FACADES_MAX_M);
    expect(casesDeLEmprise(e).length).toBeLessThanOrEqual(4);
    expect(casesDeLEmprise(e).map(cleDeCase)).toContain(cleDeCase(caseDuPoint(ici)));
  });
  it('une case se lit avec sa marge : un point au bord a tous ses murs', () => {
    const c = caseDuPoint(ici), e = empriseDeLaCase(c), nue = empriseDeLaCase(c, 0);
    expect(distanceM({ lat: e.nord, lon: e.ouest }, { lat: nue.nord, lon: e.ouest })).toBeCloseTo(MARGE_CASE_M, 0);
    expect(MARGE_CASE_M).toBeGreaterThan(DISTANCE_MAX_M);
    expect(largeurM(nue)).toBeGreaterThan(700);
    expect(largeurM(nue)).toBeLessThan(900);
  });
});

describe('le lecteur de cases : une lecture par case, partagée, bornée', () => {
  const reponse = (ids: string[]) => ({ numberMatched: ids.length, features: ids.map((id, k) => ({ properties: { cleabs: id }, geometry: { type: 'Polygon', coordinates: [maison(id, 20 * k, 0).contour.map((p) => [p.lon, p.lat])] } })) });
  const a = { x: 16578, y: 11266 }, b = { x: 16579, y: 11266 }, c = { x: 16580, y: 11266 };
  const repos = () => new Promise((r) => setTimeout(r, 0));
  it('deux demandeurs de la même case : une seule lecture ; la scène réunit les cases lues sans doublon', async () => {
    const demandes: string[] = [];
    const l = new LecteurDeCases((url) => { demandes.push(url); return Promise.resolve(reponse(['A', 'B'])); });
    let dits = 0;
    l.abonner(() => { dits++; });
    l.vouloir('photos', [a]); l.vouloir('couverture', [a, b]);
    await repos(); await repos();
    expect(demandes).toHaveLength(2);
    expect([l.etat(cleDeCase(a)), l.etat(cleDeCase(b)), l.etat(cleDeCase(c))]).toEqual(['lue', 'lue', 'absente']);
    expect(dits).toBe(2);
    expect(l.scene([cleDeCase(a), cleDeCase(b)]).batiments.map((x) => x.id)).toEqual(['A', 'B']);
    expect(l.scene([cleDeCase(a), cleDeCase(b)])).toBe(l.scene([cleDeCase(b), cleDeCase(a)]));
    // Redemander ne relit rien.
    l.vouloir('photos', [a, b]);
    await repos();
    expect(demandes).toHaveLength(2);
  });
  it('deux lectures à la fois au plus, et celle dont plus personne ne veut s’arrête', async () => {
    const signaux: AbortSignal[] = [];
    const l = new LecteurDeCases((_url, signal) => { signaux.push(signal); return new Promise(() => {}); });
    l.vouloir('couverture', [a, b, c]);
    expect(signaux).toHaveLength(2);
    expect(l.etat(cleDeCase(a))).toBe('lecture');
    l.vouloir('couverture', [c]);
    expect(signaux.slice(0, 2).map((s) => s.aborted)).toEqual([true, true]);
    expect(signaux).toHaveLength(3);
    await repos();
  });
  it('une panne ne se redemande pas tout de suite, et ne donne aucune scène', async () => {
    let t = 1000, appels = 0;
    const plusTard: (() => void)[] = [];
    const l = new LecteurDeCases(() => { appels++; return Promise.reject(new Error('HTTP 503')); }, () => t, (f) => { plusTard.push(f); });
    l.vouloir('couverture', [a]);
    await repos(); await repos();
    expect(l.etat(cleDeCase(a))).toBe('panne');
    expect(l.scene([cleDeCase(a)]).batiments).toEqual([]);
    l.vouloir('couverture', [a]);
    await repos();
    expect(appels).toBe(1);
    t += DELAI_PANNE_MS + 100;
    plusTard[0]?.();
    await repos();
    expect(appels).toBe(2);
  });
  it('une case tronquée (trop de bâtiments) se dit, et ne grise rien', async () => {
    const l = new LecteurDeCases(() => Promise.resolve({ numberMatched: 99999, features: reponse(Array.from({ length: 1000 }, (_, k) => 'B' + k)).features }));
    l.vouloir('couverture', [a]);
    for (let k = 0; k < 12; k++) await repos();
    expect(l.etat(cleDeCase(a))).toBe('tronquee');
    expect(l.scene([cleDeCase(a)]).batiments).toEqual([]);
  });
});

describe('ce que la légende dit', () => {
  it('le gris s’explique ; une panne se dit ; sinon rien', () => {
    expect(legendeDesFacades('oui')).toBe('rues photographiées sans façade à portée');
    expect(legendeDesFacades('panne')).toMatch(/indisponibles.*reste orange/);
    expect([legendeDesFacades('loin'), legendeDesFacades('eteinte'), legendeDesFacades('lecture')]).toEqual([null, null, null]);
  });
});
