import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contourDuMur, egoutEn, partiesBassesDuGabarit, volumesDuBatiment, type Volume } from '../../../src/facade/profil.js';
import { gabaritDesCorps } from '../../../src/facade/gabaritMur.js';
import { facadesDuContour, pointDeFacade } from '../../../src/geometry/cotesVusDeDehors.js';
import { sommetDe } from '../../../src/geometry/anneau.js';
import { derouler } from '../../../src/facade/releve/enchainement.js';
import { prisesDeLaFacade } from '../../../src/facade/releve/prisesFacade.js';
import { rechercher } from '../../../src/facade/releve/serie.js';
import { mesurerFacade } from '../../../src/model/mesureFacade.js';
import { avecPartiesBasses, champsDesPartiesBasses, partiesBassesDu, partiesBassesTransformees } from '../../../src/model/partiesBasses.js';
import { migrer, schemaAEcrire } from '../../../src/model/migrations.js';
import { validerProjetJSON } from '../../../src/io/validation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { mesurerDetection } from '../../banc/facades/mesure.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { gabaritVrai, photographier, type PriseCamera } from '../../banc/facades/synthese.js';
import type { CorpsToit, ObjetAPlat, ObjetPlan, PartieBasse, PtBrut, ReleveFacade } from '../../../src/model/types.js';

// Un mur dont la partie haute est au milieu, avec une partie basse a chaque bout (une maison entre un appentis et un garage, dans le
// meme alignement) : le releve en garde la liste (`partiesBasses`, schema 13, model/partiesBasses.ts), lue sur le gabarit du plan et du
// LiDAR par la meme chaine que le mur en L (murEnL.test.ts). Un mur en L s'ecrit toujours comme avant, avec les memes nombres.

// Un appentis de 3 m (egout 2,6 m), une maison de 5,6 m a etage (egout 5,6 m), un garage de 3,4 m (egout 2,9 m), vus du sud (scene 26).
const CONTOUR: PtBrut[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
const CORPS: CorpsToit[] = [
  { pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 8 }, { x: 0, y: 8 }], posFaitage: 3, faitage: 3.4, egouts: [2.6, 3.4], pignons: [], ecart: 0 },
  { pts: [{ x: 3, y: 0 }, { x: 8.6, y: 0 }, { x: 8.6, y: 8 }, { x: 3, y: 8 }], posFaitage: 4, faitage: 7.5, egouts: [5.6, 5.6], pignons: [], ecart: 0 },
  { pts: [{ x: 8.6, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 8.6, y: 8 }], posFaitage: 4, faitage: 3.8, egouts: [2.9, 2.9], pignons: [], ecart: 0 },
];
const DEUX: PartieBasse[] = [{ debut: 0, fin: 3, hauteur: 2.6 }, { debut: 8.6, fin: 12, hauteur: 2.9 }];
const releve = (extra: Partial<ReleveFacade>): ReleveFacade => ({ cote: 0, largeur: 12, hauteur: 5.6, texture: null, ouvertures: [], distance: null, sourceDistance: null, releveLe: '', ...extra });

describe('les parties basses lues sur le gabarit', () => {
  it('une a chaque bout quand la partie haute est au milieu (le gabarit des corps du plan et du LiDAR)', () => {
    const sud = facadesDuContour(CONTOUR, 5.6).find((f) => f.cote === 0)!;
    const p = partiesBassesDuGabarit(gabaritDesCorps(sud, CORPS, 5.6), 12, 5.6);
    expect(p).toHaveLength(2);
    expect(p[0]!.debut).toBe(0);
    expect(Math.abs(p[0]!.fin - 3)).toBeLessThan(0.1);
    expect(Math.abs(p[0]!.hauteur - 2.6)).toBeLessThan(0.05);
    expect(Math.abs(p[1]!.debut - 8.6)).toBeLessThan(0.1);
    expect(p[1]!.fin).toBe(12);
    expect(Math.abs(p[1]!.hauteur - 2.9)).toBeLessThan(0.05);
  });

  it('en parts du mur : deux bouts bas, et un creux au milieu seulement quand le gabarit y descend', () => {
    const marches = [{ u: 0, v: 0.5 }, { u: 0.3, v: 0.5 }, { u: 0.3001, v: 1 }, { u: 0.7, v: 1 }, { u: 0.7001, v: 0.5 }, { u: 1, v: 0.5 }];
    expect(partiesBassesDuGabarit(marches, 10, 6)).toEqual([{ debut: 0, fin: 3, hauteur: 3 }, { debut: 7, fin: 10, hauteur: 3 }]);
    const creux = [{ u: 0, v: 1 }, { u: 0.4, v: 1 }, { u: 0.4001, v: 0.5 }, { u: 0.6, v: 0.5 }, { u: 0.6001, v: 1 }, { u: 1, v: 1 }];
    expect(partiesBassesDuGabarit(creux, 10, 6)).toEqual([{ debut: 4, fin: 6, hauteur: 3 }]);
    // Un bout bas de moins d'un metre ne compte pas, l'autre si.
    expect(partiesBassesDuGabarit([{ u: 0, v: 0.5 }, { u: 0.05, v: 0.5 }, { u: 0.0501, v: 1 }, { u: 0.7, v: 1 }, { u: 0.7001, v: 0.5 }, { u: 1, v: 0.5 }], 10, 6)).toEqual([{ debut: 7, fin: 10, hauteur: 3 }]);
    // Le mur entier sous l'egout : la hauteur est fausse, rien ne s'en lit.
    expect(partiesBassesDuGabarit([{ u: 0, v: 0.5 }, { u: 1, v: 0.5 }], 10, 6)).toEqual([]);
  });
});

describe('le releve a plusieurs parties basses', () => {
  it('s ecrit dans partieBasse pour une (la forme d avant le schema 13), en liste pour plusieurs', () => {
    expect(champsDesPartiesBasses([])).toEqual({ partieBasse: null });
    expect(champsDesPartiesBasses([DEUX[1]!])).toEqual({ partieBasse: DEUX[1] });
    expect(champsDesPartiesBasses([DEUX[1]!, DEUX[0]!])).toEqual({ partieBasse: null, partiesBasses: DEUX });
    // Revenir a une seule retire la liste.
    const r = avecPartiesBasses(releve({ partieBasse: null, partiesBasses: DEUX }), [DEUX[0]!]);
    expect(r).not.toHaveProperty('partiesBasses');
    expect(r.partieBasse).toEqual(DEUX[0]);
    expect(partiesBassesDu(releve({ partieBasse: null, partiesBasses: DEUX }))).toEqual(DEUX);
    expect(partiesBassesDu(releve({ partieBasse: DEUX[1]! }))).toEqual([DEUX[1]]);
    expect(partiesBassesDu(releve({}))).toEqual([]);
  });

  it('se met a l echelle dans la forme ou il est rangé', () => {
    const k = (p: PartieBasse) => ({ ...p, hauteur: p.hauteur * 2 });
    expect(partiesBassesTransformees(releve({}), k)).toEqual({});
    expect(partiesBassesTransformees(releve({ partieBasse: DEUX[0]! }), k)).toEqual({ partieBasse: { debut: 0, fin: 3, hauteur: 5.2 } });
    expect(partiesBassesTransformees(releve({ partieBasse: null, partiesBasses: DEUX }), k)).toEqual({ partiesBasses: [{ debut: 0, fin: 3, hauteur: 5.2 }, { debut: 8.6, fin: 12, hauteur: 5.8 }] });
  });

  it('retire chaque partie basse de la surface du mur, et en donne l egout et le contour', () => {
    const m = mesurerFacade({ largeur: 12, hauteur: 5.6, ouvertures: [], partieBasse: null, partiesBasses: DEUX });
    expect(m.surfaceMurM2).toBeCloseTo(12 * 5.6 - 3 * 3 - 3.4 * 2.7, 2);
    expect([egoutEn(1, 5.6, DEUX), egoutEn(5, 5.6, DEUX), egoutEn(10, 5.6, DEUX)]).toEqual([2.6, 5.6, 2.9]);
    expect(contourDuMur(12, 5.6, DEUX)).toEqual([
      { x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 2.9 }, { x: 8.6, y: 2.9 }, { x: 8.6, y: 5.6 }, { x: 3, y: 5.6 }, { x: 3, y: 2.6 }, { x: 0, y: 2.6 },
    ]);
  });

  it('coupe le batiment en trois volumes : la partie haute au milieu, une partie basse a chaque bout, a la profondeur de son pignon', () => {
    const v = volumesDuBatiment(CONTOUR, 5.6, [releve({ partieBasse: null, partiesBasses: DEUX })]);
    expect(v.map((x) => x.hauteur)).toEqual([5.6, 2.9, 2.6]);
    const aire = (pts: readonly PtBrut[]) => Math.abs(pts.reduce((s, p, i) => s + p.x * sommetDe(pts, i + 1).y - sommetDe(pts, i + 1).x * p.y, 0)) / 2;
    expect(v.map((x) => Math.round(aire(x.pts) * 100) / 100)).toEqual([5.6 * 8, 3.4 * 8, 3 * 8]);
    // Un mur en L (une partie basse) : deux volumes, comme avant.
    expect(volumesDuBatiment(CONTOUR, 5.6, [releve({ partieBasse: DEUX[1]! })]).map((x) => x.hauteur)).toEqual([5.6, 2.9]);
  });
});

// La copie figee de volumesDuBatiment d'avant le schema 13 (facade/profil.ts au commit 630cffc7) : un fichier d'avant doit rendre les
// memes volumes, au bit pres.
function volumesAvant(pts: readonly PtBrut[], hauteur: number, releves: readonly ReleveFacade[]): Volume[] {
  const entier = [{ pts: pts.map((q) => ({ ...q })), hauteur }];
  const r = releves.find((x) => x.partieBasse);
  const pb = r?.partieBasse;
  if (!r || !pb) return entier;
  const n = pts.length;
  const f = facadesDuContour(pts, hauteur).find((x) => x.cote === r.cote);
  if (!f || n < 3) return entier;
  const basseADroite = pb.debut > 0;
  const k = r.largeur > 0 ? f.largeur / r.largeur : 1;
  const S = pointDeFacade(f, (basseADroite ? pb.debut : pb.fin) * k);
  const C = basseADroite ? f.droite : f.gauche;
  const iA = r.cote, iB = (r.cote + 1) % n;
  const proche = (a: PtBrut, b: PtBrut) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
  const iC = proche(sommetDe(pts, iA), C) ? iA : iB;
  const iE = iC === iB ? (iB + 1) % n : (iA - 1 + n) % n;
  const E = sommetDe(pts, iE);
  const S2 = { x: E.x + S.x - C.x, y: E.y + S.y - C.y };
  const haute: PtBrut[] = [];
  pts.forEach((q, i) => {
    if (i === iE) return;
    if (i !== iC) haute.push({ ...q });
    else if (iC === iB) haute.push({ ...S }, S2);
    else haute.push(S2, { ...S });
  });
  const nettoye = haute.filter((q, i) => !proche(q, sommetDe(haute, i + 1)));
  if (nettoye.length < 3) return entier;
  return [{ pts: nettoye, hauteur }, { pts: [{ ...S }, { ...C }, { ...E }, S2], hauteur: Math.min(hauteur, pb.hauteur) }];
}

describe('un fichier d avant (une partie basse) : memes nombres', () => {
  const brut = JSON.parse(readFileSync(new URL('../../fixtures/migrations/projet-5.1.0-facades-validees.json', import.meta.url), 'utf8')) as { meta: { schemaVersion: number }; objects: unknown[] };

  it('se migre, se relit et s enregistre sans changer de forme ni de schema, et rend la meme surface et les memes volumes', () => {
    const migre = migrer({ objects: structuredClone(brut.objects) as ObjetAPlat[] }, brut.meta.schemaVersion);
    const objets = normalizeObjects(validerProjetJSON(structuredClone({ ...brut, objects: migre.objects })).objets) as unknown as ObjetPlan[];
    const maison = objets.find((o) => o.key === 'maison') as ObjetPlan & { pts: PtBrut[] };
    const facades = maison.batiment!.facades!;
    const avant = (brut.objects as { key: string; facades?: ReleveFacade[] }[]).find((o) => o.key === 'maison')!.facades!;
    expect(facades[0]!.partieBasse).toEqual(avant[0]!.partieBasse);
    expect(facades[0]).not.toHaveProperty('partiesBasses');
    // La surface du mur : celle d'avant, le retrait de la partie basse compris.
    const pb = avant[0]!.partieBasse!;
    const surfaceAvant = Math.round(Math.max(0, avant[0]!.largeur * avant[0]!.hauteur - Math.max(0, pb.fin - pb.debut) * Math.max(0, avant[0]!.hauteur - pb.hauteur)) * 100) / 100;
    expect(mesurerFacade(facades[0]!).surfaceMurM2).toBe(surfaceAvant);
    expect(volumesDuBatiment(maison.pts, 6, facades)).toEqual(volumesAvant(maison.pts, 6, avant));
    // Enregistre, il reste au plus petit schema qui le decrit : pas le 13.
    const ecrit = serializeObjects(objets) as unknown as ObjetAPlat[];
    expect(schemaAEcrire(ecrit, null)).toBeLessThan(13);
    expect((ecrit.find((o) => o.key === 'maison') as { facades: unknown[] }).facades).toEqual(avant);
  });
});

// De bout en bout, par l'orchestrateur (le chemin de l'audit, et de la calibration qui le rejoue) : la scene 26 du banc, une photo avec
// le GPS, la boussole et l'EXIF, le gabarit vrai, les coins cherches comme sur place.
describe('la chaine sur une partie haute au milieu (scene 26)', () => {
  it('cale le mur, l explique, lit les baies des trois parties et pas le ciel au-dessus, et ecrit les deux parties basses', async () => {
    const s = chargerCorpus().find((c) => c.nom.startsWith('26-'))!;
    const p = s.synthese.prise as PriseCamera, L = s.verite.largeur, H = s.verite.hauteur;
    const ph = photographier(s, 100, p)!;
    const b = ((p.biais ?? 0) * Math.PI) / 180;
    const prise = { t: '2026-11-03T10:00:00.000Z', x: L / 2 + p.distance * Math.sin(b), y: -p.distance * Math.cos(b), lat: null, lon: null, precisionM: 1, azimutDeg: (360 - (p.biais ?? 0)) % 360, sourceAzimut: 'boussole' as const, champDeg: (2 * Math.atan(18 / (p.focale35 ?? 26)) * 180) / Math.PI, sourceFocale: 'exif' as const };
    const facade = { cote: 0, gauche: { x: 0, y: 0 }, droite: { x: L, y: 0 }, largeur: L, hauteur: H, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' };
    const prises = prisesDeLaFacade({ facade, contour: CONTOUR, photos: [{ rang: 0, image: ph.image, prise }], corrections: {}, jpeg: () => '' });
    const r = await derouler({ largeurM: L, hauteurM: H, gabarit: gabaritVrai(s), prises }, { vue: 'audit', chercherCoins: async (e) => rechercher(e) });
    // L'E5 : les deux coins hauts du rectangle englobant, au-dessus des parties basses, n'ont pas d'arete ; la pose est juste et s'explique.
    expect(r.etapes.find((e) => e.id === 'calage')).toMatchObject({ etat: 'ok', resume: expect.stringMatching(/expliqué par sa silhouette/) });
    const m = r.sorties.audit?.mesure;
    expect(m?.hauteurM).toBeCloseTo(5.6, 1);
    const parties = partiesBassesDu(m?.releve);
    expect(m?.releve.partieBasse).toBeNull();
    expect(parties).toHaveLength(2);
    for (const [lu, vrai] of parties.map((q, i) => [q, DEUX[i]!] as const)) {
      for (const k of ['debut', 'fin', 'hauteur'] as const) expect(Math.abs(lu[k] - vrai[k]), k).toBeLessThan(0.1);
    }
    // Les six baies, et rien au-dessus des parties basses (leurs bandes de tuiles, le ciel).
    const ouv = m?.releve.ouvertures ?? [];
    const c = mesurerDetection(s.verite.ouvertures, ouv);
    expect([c.rappel, c.precision]).toEqual([1, 1]);
    expect(ouv.filter((o) => o.x + o.l / 2 < 3 || o.x + o.l / 2 > 8.6).every((o) => o.y + o.h <= 2.9 + 0.1)).toBe(true);
  }, 120_000);
});
