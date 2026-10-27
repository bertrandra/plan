import { afterEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { murDuCorps } from '../../../../../src/facade/regles/toits/murDuCorps.js';
import { facadesDuContour } from '../../../../../src/facade/geometrie.js';
import { cleChoix, propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { silhouetteDesCorps } from '../../../../../src/facade/regles/toits/silhouetteDesCorps.js';
import { cleMesure, type MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { appliquerPropositions } from '../../../../../src/regles/decisions.js';
import { formeDuCorps } from '../../../../../src/facade/regles/toits/faits.js';
import { essayerFaitsToits, lireFaitsToits } from '../../../../../src/regles/toits/faits.js';
import type { SilhouetteFacade } from '../../../../../src/model/silhouetteFacade.js';
import type { CorpsToit, ObjetPlan, PtBrut, ChampsBatiment } from '../../../../../src/model/types.js';

// La silhouette d'une facade parle du corps qui la porte, pas du batiment entier (decision de l'utilisateur, 18 octobre 2026).
// AE 101 : trois corps lus (le principal, 0 ; l'aile nord, 1 ; l'aile nord-est, 2) ; le mur est du cote 13 est le long pan de
// l'aile nord-est, l'ouest du cote 11 son autre long pan, le nord du cote 12 son bout.

const d = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101.json', 'utf8')) as { contour: PtBrut[]; toitMesure: ChampsBatiment['toitMesure']; corps: CorpsToit[] };
const maison = (): ObjetPlan => ({ key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: d.contour, elevation: 6, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, toitMesure: d.toitMesure, corpsToit: JSON.parse(JSON.stringify(d.corps)) },   }) as unknown as ObjetPlan;
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
    const avant = JSON.stringify(o.batiment?.corpsToit?.slice(0, 2));
    appliquerPropositions([o], [aile!], [], '2026-10-18');
    expect(JSON.stringify(o.batiment?.corpsToit?.slice(0, 2))).toBe(avant);
    expect(formeDuCorps(o.batiment!.corpsToit![2]!)).toBe('appentis');
  });

  it('des croupes ne se posent pas en travers d’un corps plus large que long : rien n’est proposé plutôt qu’un toit faux', () => {
    const { p } = proposer({ 13: 'trapeze', 11: 'trapeze' });
    expect(p.find((x) => x.id === 'maison:toit:2')).toBeUndefined();
  });

  it('deux triangles sur deux murs voisins du même corps : le plus large dit le faîtage, l’autre devient un pignon traversant, que la proposition dit et que la silhouette des murs change', () => {
    // AE 101, l'aile nord-est : un triangle au nord (cote 12, son bout, 7,8 m) et a l'est (cote 13, son long pan, 5,9 m).
    const { o, p } = proposer({ 12: 'triangle', 13: 'triangle' });
    const aile = p.find((x) => x.id === 'maison:toit:2');
    expect(aile?.apres).toMatch(/pignon traversant sur la façade est \(côté 14\)/);
    expect(aile?.indices.some((i) => /Pignon traversant .* forcez « ligne droite » sur la façade est/.test(i.texte))).toBe(true);
    // L'option se change sous la proposition : la silhouette de chaque mur de ce corps, avec ce que le LiDAR en lit.
    const murs = aile?.arbitrages?.filter((a) => a.attribut === 'silhouetteFacade') ?? [];
    expect(murs.map((a) => a.cible).sort()).toEqual(['facade:maison#12', 'facade:maison#13']);
    expect(murs.find((a) => a.cible === 'facade:maison#13')?.groupes.map((g) => [g.valeur, g.retenu])).toEqual([['ligne droite', false], ['triangle', true]]);
    expect(murs.every((a) => a.options?.some((x) => x.libelle === 'ligne droite'))).toBe(true);
    appliquerPropositions([o], [aile!], [], '2026-10-19');
    const c = o.batiment!.corpsToit![2]!;
    // Le faitage reste celui que dit le mur nord ; le pignon prend le long pan est, jusqu'au faitage.
    expect(c.pignons.filter((g) => g.fin - g.debut > 4)).toHaveLength(1);
    expect(c.pignons[0]?.faitage).toBe(c.faitage);
    // Le haut du mur est montre maintenant un triangle : la photo s'y plaquera en triangle.
    expect(silhouetteDesCorps(facade(13), o.batiment!.corpsToit!, 6)).toBe('triangle');
  });

  it('forcer « ligne droite » sur le mur nord retire le pignon traversant ; un faîtage tourné que la mesure ne porte pas n’est pas proposé', () => {
    const o = maison(), capture = captureVide('78650000AE0101');
    const choix = { [cleChoix('facade:maison#12', 'silhouetteFacade')]: { type: 'force' as const, valeur: 'ligne-droite' } };
    const p = propositionsArbitrees({ objets: [parcelle, o], liste: listeDeControle([parcelle, o], capture), capture, mesures: mesures({ 12: 'triangle', 13: 'triangle' }) }, {}, undefined, choix);
    // Le triangle est dit maintenant seul le sens du faitage (est-ouest) ; sur l'aile nord-est, large de 5,9 m, le LiDAR ne tient
    // pas de faitage dans ce sens : pas de toit invente, et plus de pignon traversant. Le choix reste dans « Sources ».
    expect(p.find((x) => x.id === 'maison:toit:2')).toBeUndefined();
  });

  it('des silhouettes qui disent ce que le LiDAR lit déjà ne proposent rien (AE 101 : pignons est et nord)', () => {
    const { p } = proposer({ 1: 'triangle', 9: 'triangle', 12: 'triangle', 10: 'triangle' });
    expect(p.filter((x) => x.effet.type === 'corpsToit' || x.effet.type === 'corpsDuToit')).toEqual([]);
  });
});

describe('le fait du bâtiment l’emporte sur l’audit (CLAUDE.md : une décision passe par le moteur)', () => {
  const CLE = 'BATIMENT0000000000000101';
  const mesures = new Map([[cleMesure('maison', 12), { cle: 'maison', cote: 12, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, silhouette: 'rampe' as SilhouetteFacade }]]);
  const proposer = (fait: Record<string, unknown> | null) => {
    essayerFaitsToits(fait ? lireFaitsToits({ format: 'plan-faits-toits', version: 1, faits: { [CLE]: fait } }) : null);
    const o = { ...maison(), bdtopo: { cleabs: CLE } } as ObjetPlan, capture = captureVide('78650000AE0101');
    return propositionsArbitrees({ objets: [parcelle, o], liste: listeDeControle([parcelle, o], capture), capture, mesures }, {});
  };
  afterEach(() => essayerFaitsToits(null));

  it('sans fait, la rampe relit l’aile ; un fait en remplacement fixe le toit : rien n’est proposé', () => {
    expect(proposer(null).find((x) => x.id === 'maison:toit:2')).toBeDefined();
    const remplacement = { observation: { forme: 'deux-pans' }, application: 'remplacement', dimensions: { egoutM: 6, faitageM: 9 } };
    expect(proposer(remplacement).find((x) => x.id.startsWith('maison:toit'))).toBeUndefined();
  });

  it('un fait en contrainte que la proposition ne tient pas la fait tomber', () => {
    // Le fait demande un faitage du corps principal au-dessus de 100 m : aucun toit lu ne le tient.
    expect(proposer({ observation: { faitageM: { min: 100, max: 120 } } }).find((x) => x.id.startsWith('maison:toit'))).toBeUndefined();
  });
});

