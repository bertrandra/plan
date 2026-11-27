import { describe, it, expect, vi } from 'vitest';

// La couleur des toits se lit sur l'orthophoto : ici, rien a lire (ce test regarde les corps).
vi.mock('../../../../src/render/couleurToitOrtho.js', () => ({ couleursToitsDepuisOrtho: vi.fn(async () => ({ lus: 0, replis: 0 })) }));
import { readFileSync } from 'node:fs';
import { creerToitsFond } from '../../../../src/app/toits/toitsFond.js';
import { toitsDepuisLidar, toitLu, voisinsDeRaccord, type ObjetAToit, type OptionsToitsLidar } from '../../../../src/app/toits/toitsLidar.js';
import { echantillonsDeGrille } from '../../../../src/geo/mnh.js';
import { projecteurLocal } from '../../../../src/geo/projection.js';
import type { CorpsToit, Lucarne, ObjetPlan, PtBrut } from '../../../../src/model/types.js';
import type { GrilleRelief } from '../../../../src/model/relief.js';

// Le critere du proprietaire (Hardencourt, 11 route du Guesclin, 27 novembre 2026) : « c'est bon sur un nouveau projet sur la meme
// adresse, actualiser doit donner la meme chose ». Un projet existant, avec ses toits d'une ancienne lecture, relu par n'importe
// quel chemin (la tache de fond a l'ouverture, « Actualiser depuis l'IGN », « Actualiser le projet »), a les memes toits qu'un
// projet neuf : la maison en L en un seul toit, le batiment du bout plus bas, les trois lucarnes de la longere.
// Avant : la tache de fond lisait chaque batiment sur une copie, que le raccord ne voyait pas (deux toits) ; une lucarne vue sur
// l'ancien toit remplacait toutes celles que la mesure venait de lire (« 1 lucarne decouverte »).

interface Releve { contour: PtBrut[]; grille: GrilleRelief }
// L'aile (6500957) est rangee a part (tests/fixtures/toits-relecture/) : tests/fixtures/toits/ est le corpus de la lecture des formes.
const releve = (cle: string): Releve => JSON.parse(readFileSync(new URL(`../../../fixtures/toits${cle === '6500957' ? '-relecture' : ''}/hardencourt-${cle}.json`, import.meta.url), 'utf8')) as Releve;
const CLES = ['6501004', '6500957', '6501003'] as const;
const RELEVES = new Map(CLES.map((c) => [c as string, releve(c)]));
const proj = projecteurLocal(49.0404, 1.3182);
// Le quartier d'AE 101 (2 allee des Limites, Le Vesinet) : chaque batiment dans le repere de sa parcelle, donc lu seul.
const VESINET = new Map(['ae101', 'ae100', 'ae103', 'ae98', 'ae98-voisin'].map((n) => [n, JSON.parse(readFileSync(new URL(`../../../fixtures/toits/vesinet-${n}.json`, import.meta.url), 'utf8')) as Releve & { cleabs?: string }]));

/** Le service du LiDAR : la grille du releve dont le contour est celui demande (ou le contient : la relecture plus large du recalage). */
const grilleDe = (pts: readonly PtBrut[]): GrilleRelief | null => {
  const cx = pts.reduce((t, q) => t + q.x, 0) / pts.length, cy = pts.reduce((t, q) => t + q.y, 0) / pts.length;
  let best: Releve | null = null, d = Infinity;
  for (const r of [...RELEVES.values(), ...VESINET.values()]) { const rx = r.contour.reduce((t, q) => t + q.x, 0) / r.contour.length, ry = r.contour.reduce((t, q) => t + q.y, 0) / r.contour.length, e = Math.hypot(rx - cx, ry - cy); if (e < d) { d = e; best = r; } }
  return best && d < 1 ? best.grille : null;
};
const service: Pick<OptionsToitsLidar, 'lire' | 'lireGrille' | 'dalles'> = {
  lire: async (pts) => { const g = grilleDe(pts); return g ? echantillonsDeGrille(g, pts) : []; },
  lireGrille: async (pts) => grilleDe(pts),
  dalles: async () => true
};

/** Un toit d'une ancienne lecture : un deux-pans dissymetrique, faitage hors de l'axe, marque d'une version depassee. */
const ancienCorps = (pts: PtBrut[], lucarnes?: Lucarne[]): CorpsToit => ({ pts: pts.slice(0, 4), posFaitage: 1.5, faitage: 6.7, egouts: [4.5, 5], pignons: [], ecart: 0.3, ...(lucarnes ? { lucarnes } : {}) });
const batiment = (cle: string, ancien: boolean, plus: Record<string, unknown> = {}): ObjetPlan => {
  const r = RELEVES.get(cle) as Releve;
  return { key: 'bati-batiment-' + cle, fonction: 'batiment', type: 'polygon', pts: structuredClone(r.contour), elevation: 4, bdtopo: { surParcellePrincipale: true, hauteurM: 4 },
    batiment: { toit: { forme: 'deux-pans', hauteur: 2, angleFaitage: 0, source: 'bdtopo', couleur: '#777777', origineCouleur: 'orthophoto' }, couleurMurs: { photo: null, lecture: 1 },
      ...(ancien ? { toitLidarLu: 8, corpsToit: [ancienCorps(r.contour)] } : {}), ...plus } } as unknown as ObjetPlan;
};
const parcelle = (): ObjetPlan => ({ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [{ x: -40, y: -70 }, { x: 30, y: -70 }, { x: 30, y: 0 }, { x: -40, y: 0 }], cadastre: { origineLat: 49.0404, origineLon: 1.3182 } }) as unknown as ObjetPlan;
const plan = (ordre: readonly string[], ancien: boolean, plus: Record<string, Record<string, unknown>> = {}): ObjetPlan[] => [parcelle(), ...ordre.map((c) => batiment(c, ancien, plus[c]))];
const corps = (objets: readonly ObjetPlan[]): Record<string, unknown> => Object.fromEntries(CLES.map((c) => [c, objets.find((o) => o.key === 'bati-batiment-' + c)?.batiment?.corpsToit ?? null]));
const lireTout = (objets: ObjetPlan[]) => toitsDepuisLidar(objets as ObjetAToit[], proj, { ...service, delaiMs: Number.POSITIVE_INFINITY });

/** La tache de fond jusqu'au bout, avec la vraie lecture derriere le service du releve. */
async function relireEnFond(objets: ObjetPlan[]): Promise<{ ecrits: string[][] }> {
  const ecrits: string[][] = [];
  const fond = creerToitsFond({ objets: () => objets, lectureSeule: () => false, apresLot: (cles) => { ecrits.push([...cles]); }, progression: () => {}, pause: async () => {}, attendre: async () => {}, dalles: async () => true,
    lire: ((o, p, opt) => toitsDepuisLidar(o, p, { ...opt, ...service })) as typeof toitsDepuisLidar });
  fond.relancer();
  for (let i = 0; i < 2000 && fond.enCours(); i++) await new Promise((r) => setTimeout(r, 0));
  expect(fond.enCours()).toBe(false);
  return { ecrits };
}

describe('relire un projet existant donne ce que donne un projet neuf', () => {
  it('un projet neuf : la maison en L en un seul toit, le batiment du bout plus bas, trois lucarnes identiques sur la longere', async () => {
    const neuf = plan(CLES, false);
    await lireTout(neuf);
    const c = corps(neuf) as Record<string, CorpsToit[]>;
    const longere = c['6501004']?.[0], aile = c['6500957']?.[0], bout = c['6501003']?.[0];
    expect([longere?.faitage, aile?.faitage]).toEqual([6.4, 6.4]);
    expect([longere?.egouts, aile?.egouts]).toEqual([[4.9, 4.9], [4.9, 4.9]]);
    // Le retour d'angle : chacun se ferme par une croupe, plus de pignon entre les deux.
    expect(longere?.croupes?.some((x) => x > 0)).toBe(true);
    expect(aile?.croupes?.some((x) => x > 0)).toBe(true);
    // Le batiment du bout garde son toit, plus bas.
    expect(bout?.faitage).toBeLessThan(6.4);
    expect(Math.max(...(bout?.egouts ?? [9]))).toBeLessThan(4);
    expect(longere?.lucarnes?.map((l) => [l.type, l.source, l.pan])).toEqual([['jacobine', 'lidar', 0], ['jacobine', 'lidar', 0], ['jacobine', 'lidar', 0]]);
    expect(new Set(longere?.lucarnes?.map((l) => (l.finM - l.debutM).toFixed(2))).size).toBe(1);
  });

  it('les batiments qui se touchent sur la parcelle se relisent ensemble : la longere, son aile, le batiment du bout', () => {
    const objets = plan(CLES, true) as ObjetAToit[];
    const longere = objets.find((o) => o.key === 'bati-batiment-6501004') as ObjetAToit;
    expect(voisinsDeRaccord(longere, objets).map((o) => o.key).sort()).toEqual(['bati-batiment-6500957', 'bati-batiment-6501003']);
    // Un batiment chez un voisin n'en est pas, ni le terrain.
    const voisin = { ...batiment('6500957', true), key: 'chez-le-voisin', bdtopo: {} } as unknown as ObjetAToit;
    expect(voisinsDeRaccord(longere, [...objets, voisin]).some((o) => o.key === 'chez-le-voisin')).toBe(false);
    expect(voisinsDeRaccord(voisin, [...objets, voisin])).toEqual([]);
  });

  it('la tache de fond, sur un projet aux toits anciens, rend les corps d un projet neuf - dans tous les ordres de lecture', async () => {
    const neuf = plan(CLES, false);
    await lireTout(neuf);
    const attendu = corps(neuf);
    const ordres = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((o) => o.map((i) => CLES[i] as string));
    for (const ordre of ordres) {
      const existant = plan(ordre, true);
      const { ecrits } = await relireEnFond(existant);
      expect(corps(existant), 'ordre ' + ordre.join(', ')).toEqual(attendu);
      expect(existant.filter((o) => o.fonction === 'batiment').every((o) => toitLu(o.batiment))).toBe(true);
      // Les trois sont ecrits ensemble, une fois.
      expect(ecrits.flat().sort(), 'ordre ' + ordre.join(', ')).toEqual(CLES.map((c) => 'bati-batiment-' + c).sort());
    }
  });

  it('un seul des batiments a relire (les autres deja lus et raccordes) : ses voisins se relisent avec lui, et le resultat est le meme', async () => {
    const neuf = plan(CLES, false);
    await lireTout(neuf);
    const attendu = corps(neuf);
    for (const cle of CLES) {
      const existant = structuredClone(neuf);
      const o = existant.find((x) => x.key === 'bati-batiment-' + cle) as ObjetPlan;
      // Comme « Règles » rallumees dans le mode Toit (three/gestesToits.ts::reprendreLectureAuto) : plus de toit lu, plus de marque.
      delete o.batiment?.toitLidarLu; delete o.batiment?.corpsToit; delete o.batiment?.toitMesure;
      await relireEnFond(existant);
      expect(corps(existant), 'relu : ' + cle).toEqual(attendu);
    }
  });

  it('une seconde passe ne change rien : ni la tache de fond, ni une nouvelle lecture de tout le projet', async () => {
    const existant = plan(CLES, true);
    await relireEnFond(existant);
    const apres = structuredClone(corps(existant));
    const { ecrits } = await relireEnFond(existant);
    expect(ecrits).toEqual([]);
    expect(corps(existant)).toEqual(apres);
    for (const o of existant) if (o.batiment) delete o.batiment.toitLidarLu;
    await lireTout(existant);
    expect(corps(existant)).toEqual(apres);
  });

  it('« Actualiser » sur un projet aux toits anciens (une lecture de tout le projet) rend les corps d un projet neuf', async () => {
    const neuf = plan(CLES, false);
    await lireTout(neuf);
    const existant = plan(['6500957', '6501003', '6501004'], true);
    await lireTout(existant);
    expect(corps(existant)).toEqual(corps(neuf));
  });

  it('une lucarne vue sur l ancien toit reste, a la place de celle lue au meme endroit ; les deux autres lucarnes lues restent', async () => {
    const neuf = plan(CLES, false);
    await lireTout(neuf);
    const lues = (corps(neuf) as Record<string, CorpsToit[]>)['6501004']?.[0]?.lucarnes ?? [];
    const milieu = lues[1] as Lucarne;
    const vue: Lucarne = { type: 'jacobine', pan: 0, debutM: milieu.debutM + 0.1, finM: milieu.finM - 0.1, faitageM: 6.1, profondeurM: 2, source: 'observation' };
    for (const chemin of ['actualiser', 'fond'] as const) {
      const r = RELEVES.get('6501004') as Releve;
      // L'ancien corps tient sur le contour de la longere : la lucarne vue y est a sa place le long du faitage.
      const existant = plan(CLES, true, { '6501004': { toitLidarLu: 8, corpsToit: [ancienCorps(structuredClone((corps(neuf) as Record<string, CorpsToit[]>)['6501004']?.[0]?.pts ?? r.contour), [vue])] } });
      if (chemin === 'fond') await relireEnFond(existant); else await lireTout(existant);
      const apres = (corps(existant) as Record<string, CorpsToit[]>)['6501004']?.[0]?.lucarnes ?? [];
      expect(apres.map((l) => l.source), chemin).toEqual(['lidar', 'observation', 'lidar']);
      expect(apres[0], chemin).toEqual(lues[0]);
      expect(apres[2], chemin).toEqual(lues[2]);
    }
  });

  it('un toit regle a la main ne change pas, et ses voisins se lisent quand meme ; le batiment du bout, plus bas, n en depend pas', async () => {
    const neuf = plan(CLES, false);
    await lireTout(neuf);
    for (const chemin of ['actualiser', 'fond'] as const) {
      const existant = plan(CLES, true, { '6501004': { toitFige: true } });
      const avant = structuredClone((corps(existant) as Record<string, unknown>)['6501004']);
      if (chemin === 'fond') await relireEnFond(existant); else await lireTout(existant);
      const apres = corps(existant) as Record<string, CorpsToit[]>;
      // La longere reglee a la main : telle quelle, sa marque aussi.
      expect(apres['6501004'], chemin).toEqual(avant);
      // Ses voisins sont relus ; le batiment du bout est celui d'un projet neuf.
      expect(apres['6501003'], chemin).toEqual((corps(neuf) as Record<string, unknown>)['6501003']);
      expect(apres['6500957']?.[0]?.egouts[0], chemin).toBe(apres['6500957']?.[0]?.egouts[1]);
    }
  });
});

describe('le quartier d AE 101 : relire un batiment deja lu donne ce que donne un projet neuf', () => {
  const seul = (nom: string, ancien: boolean): ObjetPlan[] => {
    const r = VESINET.get(nom) as Releve & { cleabs?: string };
    return [parcelle(), { key: 'bati-batiment-' + (r.cleabs ?? nom), fonction: 'batiment', type: 'polygon', pts: structuredClone(r.contour), elevation: 6, bdtopo: { surParcellePrincipale: true, hauteurM: 6, ...(r.cleabs ? { cleabs: r.cleabs } : {}) },
      batiment: { toit: { forme: 'deux-pans', hauteur: 2, angleFaitage: 0, source: 'bdtopo', couleur: '#777777', origineCouleur: 'orthophoto' }, couleurMurs: { photo: null, lecture: 1 },
        ...(ancien ? { toitLidarLu: 8, corpsToit: [ancienCorps(r.contour)] } : {}) } } as unknown as ObjetPlan];
  };
  for (const nom of VESINET.keys()) {
    it(nom + ' : la tache de fond et « Actualiser » rendent les corps d un projet neuf', async () => {
      const neuf = seul(nom, false);
      await lireTout(neuf);
      const attendu = neuf[1]?.batiment?.corpsToit;
      expect(attendu?.length).toBeGreaterThan(0);
      const fond = seul(nom, true), actualise = seul(nom, true);
      await relireEnFond(fond);
      await lireTout(actualise);
      expect(fond[1]?.batiment?.corpsToit).toEqual(attendu);
      expect(actualise[1]?.batiment?.corpsToit).toEqual(attendu);
      expect(fond[1]?.batiment?.toitMesure).toEqual(neuf[1]?.batiment?.toitMesure);
    });
  }
});
