import { describe, it, expect } from 'vitest';
import { estVerifieSurPlace, lectureDAccord, SEUIL_ACCORD_M, type BatimentCompare } from '../../../src/model/toitVerifie.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';

// Le batiment verifie sur place (model/toitVerifie.ts) : ce qui le protege, et ce que « le nouveau
// calcul serait d'accord » veut dire (MD/spec-regles-toits.md §1).

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const corps = (plus: Partial<CorpsToit> = {}): CorpsToit => ({ pts: rect(0, 0, 10, 8), posFaitage: 4, faitage: 7.5, egouts: [5, 5], pignons: [], ecart: 0.2, ...plus });
const maison = (plus: Partial<BatimentCompare> = {}): BatimentCompare => ({
  pts: rect(0, 0, 10, 8), elevation: 5, batiment: { toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'lidar' }, corpsToit: [corps()] },  ...plus,
});

describe('estVerifieSurPlace', () => {
  it('ne reconnait que la marque posee par la validation d un audit', () => {
    expect(estVerifieSurPlace({ verifieSurPlace: { date: '2026-10-13' } })).toBe(true);
    expect(estVerifieSurPlace({ verifieSurPlace: null })).toBe(false);
    expect(estVerifieSurPlace({})).toBe(false);
    expect(estVerifieSurPlace(undefined)).toBe(false);
  });
});

describe('lectureDAccord', () => {
  it('est d accord quand tout est pareil au decimetre : contour, egout, forme, corps', () => {
    expect(lectureDAccord(maison(), maison())).toBe(true);
    // Un decimetre d'ecart sur le faitage, l'egout ou la hauteur a l'egout : la precision du LiDAR, pas une regle.
    expect(lectureDAccord(maison(), maison({ elevation: 5.1, batiment: { corpsToit: [corps({ faitage: 7.6, egouts: [4.9, 5.1] })] } }))).toBe(true);
    expect(lectureDAccord(maison(), maison({ batiment: { toit: { forme: 'deux-pans', hauteur: 2.5 + SEUIL_ACCORD_M, angleFaitage: 0, source: 'lidar' } } }))).toBe(true);
  });

  it('n est plus d accord quand une regle a change le toit', () => {
    // Un faitage qui monte de 50 cm : une autre pente.
    expect(lectureDAccord(maison(), maison({ batiment: { corpsToit: [corps({ faitage: 8 })] } }))).toBe(false);
    // Un corps de plus ou de moins : une autre decoupe.
    expect(lectureDAccord(maison(), maison({ batiment: { corpsToit: [corps(), corps({ pts: rect(10, 0, 4, 8) })] } }))).toBe(false);
    expect(lectureDAccord(maison(), maison({ batiment: { corpsToit: null } }))).toBe(false);
    // Des pignons apparus, ou des croupes : une autre forme.
    expect(lectureDAccord(maison(), maison({ batiment: { corpsToit: [corps({ pignons: [{ cote: 0, debut: 0, fin: 1.5 } as never] })] } }))).toBe(false);
    expect(lectureDAccord(maison(), maison({ batiment: { corpsToit: [corps({ croupes: [2, 2] })] } }))).toBe(false);
    // Une forme simple differente, ou un faitage tourne.
    expect(lectureDAccord(maison(), maison({ batiment: { toit: { forme: 'croupes', hauteur: 2.5, angleFaitage: 0, source: 'lidar' } } }))).toBe(false);
    expect(lectureDAccord(maison(), maison({ batiment: { toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 90, source: 'lidar' } } }))).toBe(false);
    // Une hauteur a l'egout corrigee de plus de 30 cm.
    expect(lectureDAccord(maison(), maison({ elevation: 5.5 }))).toBe(false);
  });

  it('n est pas d accord quand le batiment aurait ete recale', () => {
    expect(lectureDAccord(maison(), maison({ pts: rect(0.5, 0, 10, 8) }))).toBe(false);
    // Un centimetre d'arrondi, si.
    expect(lectureDAccord(maison(), maison({ pts: rect(0.01, 0, 10, 8) }))).toBe(true);
  });

  it('compare aussi des batiments sans corps ni toit', () => {
    expect(lectureDAccord({ pts: rect(0, 0, 4, 4), elevation: 2.5 }, { pts: rect(0, 0, 4, 4), elevation: 2.5 })).toBe(true);
    expect(lectureDAccord({ pts: rect(0, 0, 4, 4), batiment: { toit: null } }, { pts: rect(0, 0, 4, 4), batiment: { toit: { forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'lidar' } } })).toBe(false);
  });
});
