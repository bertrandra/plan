import { describe, it, expect } from 'vitest';
import { propositionsDeForme } from '../../../../../src/app/audit/parcelle/formeFacades.js';
import { facadeAEcrire } from '../../../../../src/app/audit/parcelle/facadeValidee.js';
import { avecPlacesApresForme } from '../../../../../src/app/audit/parcelle/apresForme.js';
import { cleMesure, type MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { appliquerPropositions, cocheeParDefaut, type Proposition } from '../../../../../src/regles/decisions.js';
import { diagnostiquerForme } from '../../../../../src/facade/regles/facades/diagnosticForme.js';
import { lucarnesDevantLeMur } from '../../../../../src/facade/regles/toits/elementsDesMurs.js';
import { lireObservationsFacade } from '../../../../../src/regles/facades/observations.js';
import { facadesDuContour } from '../../../../../src/geometry/cotesVusDeDehors.js';
import type { CorpsToit, ObjetPlan, OuvertureFacade, PtBrut, ReleveFacade, ToitMesure } from '../../../../../src/model/types.js';

// Les elements decouverts dans l'audit (MD/spec-facade-calage-audit.md §4 E8, §5 quater ; lot F7) : une cheminee et une lucarne lues
// sur la ligne du haut de la facade sud, proposees decochees sur le corps de ce mur, posees par le moteur une fois cochees ; ce qui
// est deja pose ne bouge pas ; la fenetre de la lucarne n'est jamais a la fois dans la facade objet et dans le toit.

const p = (x: number, y: number): PtBrut => ({ x, y });
const PTS = [p(0, 0), p(10, 0), p(10, 8), p(0, 8)];
const CORPS: CorpsToit = { pts: PTS, posFaitage: 4, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 };
const MESURE = { pts: [], hauteurs: [], egoutM: 5 } as unknown as ToitMesure;
const sud = facadesDuContour(PTS, 5).find((f) => f.cote === 0)!;
const ouverture = (id: string, x: number, y: number): OuvertureFacade => ({ id, type: 'fenetre', x, y, l: 1, h: 1.2, source: 'detectee' }) as OuvertureFacade;
// La facade sud relevee : une fenetre au rez-de-chaussee, et celle que la detection a lue dans la lucarne (au-dessus de l'egout, a 7 m).
const RELEVE = { cote: 0, largeur: 10, hauteur: 5, ouvertures: [ouverture('o1', 2, 1), ouverture('o2', 6.5, 5.3)], releveLe: '2026-10-29' } as unknown as ReleveFacade;
const maison = (corps: CorpsToit = CORPS, extra: Record<string, unknown> = {}): ObjetPlan => ({
  key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: PTS, elevation: 5,
  batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, toitMesure: MESURE, corpsToit: [JSON.parse(JSON.stringify(corps))], facades: [JSON.parse(JSON.stringify(RELEVE))] }, ...extra,
}) as unknown as ObjetPlan;
const parcelle = { key: 'parcelle', name: 'p', type: 'polygon', fonction: 'terrain', pts: [p(-50, -50), p(50, -50), p(50, 50), p(-50, 50)] } as unknown as ObjetPlan;
const ia = lireObservationsFacade({ calage: { angles: {}, pointes: [], appentis: [], corps: [], cache: [] }, forme: { silhouette: 'ligne-droite', bout: 'sans-objet' }, elements: [{ element: 'cheminee', u: 0.3, confiance: 'haute' }, { element: 'lucarne', u: 0.7, confiance: 'haute' }], surface: { principale: 'enduit', zones: [] }, ouvertures: [], confiance: 'moyenne' })!;
const proposer = (o: ObjetPlan, corps: readonly CorpsToit[] = o.batiment!.corpsToit!) => {
  const diagnostic = diagnostiquerForme({ facade: sud, corps, hauteurMur: 5, lue: null, ia });
  const mesures = new Map<string, MesureFacade>([[cleMesure('maison', 0), { cle: 'maison', cote: 0, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, diagnostic }]]);
  const capture = captureVide('78650000AE0101');
  return propositionsDeForme({ objets: [parcelle, o], liste: listeDeControle([parcelle, o], capture), capture, mesures });
};

describe('les elements decouverts dans l audit (lot F7)', () => {
  it('une ligne par element, decochee, sur le corps du mur ; cochees, le moteur pose la cheminee et la lucarne, et rien d autre ne bouge', () => {
    const o = maison();
    const ps = proposer(o);
    expect(ps.map((x) => [x.id, x.effet.type, cocheeParDefaut(x)])).toEqual([['maison:element:0:0:cheminee:30', 'elementsDuToit', false], ['maison:element:0:0:lucarne:70', 'elementsDuToit', false]]);
    expect(ps[0]!).toMatchObject({ objet: expect.stringMatching(/^Toit de maison, corps 1 \(vu sur la façade /), avant: 'aucune cheminée sur ce corps', remplaceChoix: null });
    expect(ps[0]!.apres).toBe('une cheminée à 0,3 de la largeur de la façade, d’après Claude seul, posée par le moteur des toits sur ce corps');
    expect(ps[0]!.reserve).toMatch(/^Un élément du toit lu sur la photo se confirme toujours/);
    appliquerPropositions([o], ps, [], '2026-10-29');
    const [c] = o.batiment!.corpsToit!;
    expect(c!.cheminees).toEqual([expect.objectContaining({ x: 3, y: 4, position: 'faitage', sommetM: 8.4, source: 'observation' })]);
    expect(c!.lucarnes).toEqual([expect.objectContaining({ pan: 0, debutM: 6.4, finM: 7.6, source: 'observation' })]);
    expect({ ...c, cheminees: undefined, lucarnes: undefined }).toEqual({ ...CORPS, cheminees: undefined, lucarnes: undefined });
    // Un seul endroit : la fenetre de la lucarne quitte la facade objet ; celle du rez-de-chaussee reste.
    expect(o.batiment!.facades![0]!.ouvertures.map((x) => x.id)).toEqual(['o1']);
    // Poses : plus rien a proposer.
    expect(proposer(o)).toEqual([]);
  });

  it('un element pose a la main ne bouge pas : il n est pas propose de nouveau, et un autre s y ajoute sans le deplacer', () => {
    const aLaMain = { x: 3.2, y: 4, largeurM: 0.8, profondeurM: 0.6, sommetM: 9, position: 'faitage' as const, source: 'observation' as const };
    const o = maison({ ...CORPS, cheminees: [aLaMain] });
    (o.batiment as { toitFige?: boolean }).toitFige = true;
    const ps = proposer(o);
    expect(ps.map((x) => x.id)).toEqual(['maison:element:0:0:lucarne:70']);
    expect(ps[0]!.remplaceChoix).toBe('éléments du toit posés à la main');
    appliquerPropositions([o], ps, [], '2026-10-29');
    expect(o.batiment!.corpsToit![0]!.cheminees).toEqual([aLaMain]);
    expect(o.batiment!.corpsToit![0]!.lucarnes).toHaveLength(1);
  });

  it('validee avec une forme de toit proposee, l element est repose par le moteur sur le corps qui porte son mur', () => {
    const ps = proposer(maison());
    const corpsNeuf: CorpsToit = { ...CORPS, faitage: 9 };
    const forme: Proposition = { ...ps[0]!, id: 'maison:forme', effet: { type: 'corpsToit', corps: [corpsNeuf] } };
    const [, ch] = avecPlacesApresForme([forme, ps[0]!]);
    expect(ch!.effet).toMatchObject({ type: 'elementsDuToit', apresForme: { corps: 0, cheminees: [expect.objectContaining({ sommetM: 9.4 })], lucarnes: [] } });
  });

  it('la validation de la facade (V4) ne garde pas la fenetre d une lucarne que le toit porte devant ce mur', () => {
    const lucarne = { type: 'inconnue' as const, pan: 0 as const, debutM: 6.4, finM: 7.6, faitageM: 6.8, profondeurM: 1.2, source: 'observation' as const };
    expect(lucarnesDevantLeMur([{ ...CORPS, lucarnes: [lucarne] }], sud.gauche, sud.droite)).toEqual([{ de: 6.1, a: 7.9, dessusM: 4.7 }]);
    const o = maison({ ...CORPS, lucarnes: [lucarne] });
    const m = { cle: 'maison', cote: 0, releve: RELEVE, facade: { dimensions: { largeurM: 10, egoutM: 5 }, forme: { gabarit: [], source: 'plan' } } } as unknown as MesureFacade;
    expect(facadeAEcrire(o, m, '2026-10-29')!.ouvertures.map((x) => x.id)).toEqual(['o1']);
  });
});
