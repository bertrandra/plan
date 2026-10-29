import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireEtalon, poserEtalon } from '../../banc/facades/reel.js';
import { FORMAT_CAS_REEL, lireCasReel, type CasReel } from '../../../src/facade/corpusReel.js';
import { veriteDuCas } from '../../../src/facade/releve/enchainement.js';
import { facadesDuContour } from '../../../src/geometry/cotesVusDeDehors.js';
import { gabaritDesCorps } from '../../../src/facade/gabaritMur.js';
import { murDuCorps } from '../../../src/facade/regles/toits/murDuCorps.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';

// Le cas d'etalon d'AE 101, facade sud (tests/fixtures/facades-reel/etalons/ae101-sud.json, MD/spec-facade-calage-audit.md §7.1) : sa
// verite se tient aux donnees du depot. Le gabarit est celui que l'audit calcule sur les corps d'AE 101 sous leurs faits, la largeur
// celle du cote 6 du contour, et la vraie forme du toit designe ses corps par leur mur (murDuCorps) avec les pignons des faits.

const etalon = lireEtalon(JSON.parse(readFileSync('tests/fixtures/facades-reel/etalons/ae101-sud.json', 'utf8')));
const ae101 = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101.json', 'utf8')) as { contour: PtBrut[]; corpsAvecFaits: CorpsToit[] };
const facade = facadesDuContour(ae101.contour, 0).find((f) => f.cote === etalon.source.cote);

describe('l etalon d AE 101, facade sud', () => {
  it('est le cote sud du contour, a la largeur du cadastre', () => {
    expect(facade?.orientation).toBe('Sud');
    expect(etalon.largeurM).toBeCloseTo(facade?.largeur ?? 0, 2);
    // Le rapport du plan : l'egout de l'appentis sur la largeur (spec §2, 0,268).
    expect(etalon.hauteurM / etalon.largeurM).toBeCloseTo(0.268, 3);
  });

  it('porte le gabarit que les corps d AE 101 donnent : deux pointes vers u 0,11 et 0,80, a plus de trois fois l egout', () => {
    if (!facade) throw new Error('cote absent');
    const g = gabaritDesCorps(facade, ae101.corpsAvecFaits, etalon.hauteurM);
    expect(etalon.gabarit).toHaveLength(g.length);
    etalon.gabarit.forEach((p, k) => { expect(p.u).toBeCloseTo(g[k]?.u ?? NaN, 3); expect(p.v).toBeCloseTo(g[k]?.v ?? NaN, 3); });
    const pointes = etalon.gabarit.filter((p) => p.v > 3);
    expect(pointes.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...pointes.map((p) => Math.abs(p.u - 0.11)))).toBeLessThan(0.02);
    expect(Math.min(...pointes.map((p) => Math.abs(p.u - 0.8)))).toBeLessThan(0.02);
  });

  it('designe chaque corps par son mur, avec la vraie forme de son toit', () => {
    const [principal, appentis] = etalon.toitVrai;
    expect(murDuCorps(ae101.corpsAvecFaits, principal?.mur.gauche as PtBrut, principal?.mur.droite as PtBrut)?.corps).toBe(0);
    expect(murDuCorps(ae101.corpsAvecFaits, appentis?.mur.gauche as PtBrut, appentis?.mur.droite as PtBrut)?.corps).toBe(3);
    // Les deux pignons des faits (3,7 m chacun, au faitage), tels que le moteur les pose.
    expect(principal?.pignons).toEqual(ae101.corpsAvecFaits[0]?.pignons.map(({ pan, debut, fin, faitage }) => ({ pan, debut, fin, faitage })));
    expect(principal?.pignons?.every((p) => Math.abs(p.fin - p.debut - 3.7) < 1e-9)).toBe(true);
    expect(appentis?.forme).toBe('appentis');
    expect(appentis?.egoutM).toBe(Math.min(...(ae101.corpsAvecFaits[3]?.egouts ?? [])));
  });

  it('dit le mur vrai et le mur constate : 302 px retenus au lieu d environ 610', () => {
    expect(etalon.calageVrai.x1 - etalon.calageVrai.x0).toBe(610);
    expect(etalon.constat.murCherche.x1 - etalon.constat.murCherche.x0 + 1).toBe(302);
    expect(etalon.constat.versionChaine).toBe(etalon.calageVrai.versionChaine);
  });

  it('pose sa verite sur le cas tire de l audit, que l enchainement mesure ensuite', () => {
    const cas: CasReel = { format: FORMAT_CAS_REEL, version: 1, nom: 'Maison · façade sud', statut: 'brouillon', largeurM: 8.95, hauteurM: 5, photos: [{ fichier: 'photo-1', coins: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }], ouvertures: [] };
    const avec = poserEtalon(cas, etalon);
    expect(avec).toMatchObject({ largeurM: 8.96, hauteurM: 2.4, calageVrai: { x0: 140, x1: 750 } });
    expect(avec.toitVrai).toHaveLength(2);
    expect(veriteDuCas(avec).calage).toEqual(etalon.calageVrai);
    // La verite relue comme celle d'un cas : un aller-retour du fichier ne la change pas.
    expect(lireCasReel(JSON.parse(JSON.stringify(avec)))).toEqual(avec);
  });
});

describe('la verite d un cas, relue', () => {
  const base = { format: FORMAT_CAS_REEL, version: 1, nom: 'x', statut: 'brouillon', largeurM: 9, hauteurM: 5, photos: [{ fichier: 'p', coins: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }], ouvertures: [] };
  it('refuse un mur vrai ou un toit vrai mal formes, et garde un cas sans eux tel quel', () => {
    expect(() => lireCasReel({ ...base, calageVrai: { x0: 5, x1: 2, versionChaine: 9 } })).toThrow(/calageVrai/);
    expect(() => lireCasReel({ ...base, toitVrai: [{ nom: 'c', mur: { gauche: { x: 0, y: 0 }, droite: { x: 1, y: 0 } }, forme: 'chapeau' }] })).toThrow(/forme connue/);
    expect(() => lireCasReel({ ...base, toitVrai: [{ nom: 'c', mur: { gauche: { x: 0, y: 0 }, droite: { x: 1, y: 0 } }, forme: 'deux-pans', pignons: [{ pan: 2, debut: 0, fin: 1, faitage: 7 }] }] })).toThrow(/pignon/);
    const sans = lireCasReel(base);
    expect('calageVrai' in sans || 'toitVrai' in sans).toBe(false);
  });
});
