import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { murDuCorps } from '../../../../../src/facade/regles/toits/murDuCorps.js';
import { facadesDuContour } from '../../../../../src/facade/geometrie.js';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { cleMesure, type MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { appliquerPropositions } from '../../../../../src/regles/decisions.js';
import { formeDuCorps } from '../../../../../src/facade/regles/toits/faits.js';
import type { SilhouetteFacade } from '../../../../../src/model/silhouetteFacade.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La silhouette d'une facade parle du corps qui la porte, pas du batiment entier (decision de l'utilisateur, 18 octobre 2026).
// AE 101 : trois corps lus (le principal, 0 ; l'aile nord, 1 ; l'aile nord-est, 2) ; le mur est du cote 13 est le long pan de
// l'aile nord-est, l'ouest du cote 11 son autre long pan, le nord du cote 12 son bout.

const d = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101.json', 'utf8')) as { contour: PtBrut[]; toitMesure: ObjetPlan['toitMesure']; corps: CorpsToit[] };
const maison = (): ObjetPlan => ({ key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: d.contour, elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, toitMesure: d.toitMesure, corpsToit: JSON.parse(JSON.stringify(d.corps)) }) as unknown as ObjetPlan;
const parcelle = { key: 'parcelle', name: 'p', type: 'polygon', fonction: 'terrain', pts: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }] } as unknown as ObjetPlan;
const facade = (cote: number) => facadesDuContour(d.contour, 6).find((f) => f.cote === cote)!;

describe('le corps qui porte une façade', () => {
  it('est celui dont un côté longe le mur : un long pan, un bout, ou aucun pour un retour de 60 cm', () => {
    expect(murDuCorps(d.corps, facade(13).gauche, facade(13).droite)).toEqual({ corps: 2, cote: 0 });
    expect(murDuCorps(d.corps, facade(12).gauche, facade(12).droite)).toEqual({ corps: 2, cote: 1 });
    expect(murDuCorps(d.corps, facade(9).gauche, facade(9).droite)).toEqual({ corps: 0, cote: 1 });
    expect(murDuCorps(d.corps, facade(2).gauche, facade(2).droite)).toBeNull();
  });
});

describe('la silhouette arbitrée corps par corps', () => {
  const mesures = (parCote: Record<number, SilhouetteFacade>): Map<string, MesureFacade> => new Map(Object.entries(parCote).map(([c, silhouette]) => {
    const cote = Number(c);
    return [cleMesure('maison', cote), { cle: 'maison', cote, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, silhouette }];
  }));
  const proposer = (parCote: Record<number, SilhouetteFacade>) => {
    const o = maison(), capture = captureVide('78650000AE0101');
    return { o, p: propositionsArbitrees({ objets: [parcelle, o], liste: listeDeControle([parcelle, o], capture), capture, mesures: mesures(parCote) }, {}) };
  };

  it('une rampe sur le bout de l’aile nord-est la relit seule en appentis ; le corps principal et l’aile nord ne bougent pas', () => {
    const { o, p } = proposer({ 12: 'rampe' });
    expect(p.find((x) => x.id === 'maison:toit')).toBeUndefined();
    const aile = p.find((x) => x.id === 'maison:toit:2');
    expect(aile).toMatchObject({ source: 'arbitrage', avant: 'asymétrique', effet: { type: 'corpsDuToit', corps: 2 } });
    expect(aile?.objet).toMatch(/^Forme du toit de maison, corps 3 /);
    // La photo seule ne decide pas : la proposition attend la personne.
    expect(aile?.reserve).toMatch(/Photo de façade seul ne décide pas/);
    const avant = JSON.stringify(o.corpsToit?.slice(0, 2));
    appliquerPropositions([o], [aile!], [], '2026-10-18');
    expect(JSON.stringify(o.corpsToit?.slice(0, 2))).toBe(avant);
    expect(formeDuCorps(o.corpsToit![2]!)).toBe('appentis');
  });

  it('des croupes ne se posent pas en travers d’un corps plus large que long : rien n’est proposé plutôt qu’un toit faux', () => {
    const { p } = proposer({ 13: 'trapeze', 11: 'trapeze' });
    expect(p.find((x) => x.id === 'maison:toit:2')).toBeUndefined();
  });

  it('des silhouettes qui disent ce que le LiDAR lit déjà ne proposent rien (AE 101 : pignons est et nord)', () => {
    const { p } = proposer({ 1: 'triangle', 9: 'triangle', 12: 'triangle', 10: 'triangle' });
    expect(p.filter((x) => x.effet.type === 'corpsToit' || x.effet.type === 'corpsDuToit')).toEqual([]);
  });
});
