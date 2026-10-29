import { describe, it, expect } from 'vitest';
import { diagnostiquerForme, direElement } from '../../../../../src/facade/regles/facades/diagnosticForme.js';
import { gabaritDesCorps } from '../../../../../src/facade/gabaritMur.js';
import { facadesDuContour, type Facade } from '../../../../../src/geometry/cotesVusDeDehors.js';
import { corpsSousContrainte } from '../../../../../src/facade/regles/toits/faits.js';
import { lireObservationsFacade, type ObservationsFacade } from '../../../../../src/regles/facades/observations.js';
import { etapeDiagnostic, etapeToit } from '../../../../../src/facade/releve/etapesForme.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../../../src/model/types.js';

// Les elements decouverts (MD/spec-facade-calage-audit.md §5 bis « une bosse etroite », §5 quater ; lot F7) : une bosse du haut lu plus
// etroite qu'un pignon est une cheminee (elle monte au faitage) ou une lucarne (elle reste dessous), proposee sur le corps qui porte le
// troncon, par son mur ; Claude lui donne son mot ; le moteur la pose une fois la proposition cochee ; ce qui est deja pose ne bouge pas.

const p = (x: number, y: number): PtBrut => ({ x, y });
// Une maison de 10 m de facade au sud, 8 m de profondeur, faitage est-ouest a 8 m, egouts a 5 m : la facade sud est un long pan (pan 0).
const maison: CorpsToit = { pts: [p(0, 0), p(10, 0), p(10, 8), p(0, 8)], posFaitage: 4, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 };
const contour = [p(0, 0), p(10, 0), p(10, 8), p(0, 8)];
const sud: Facade = facadesDuContour(contour, 5).find((f) => f.normale.y < -0.99)!;

/** Le haut du gabarit, lu tous les centiemes, avec des bosses : `[u0, u1, v]` (v en hauteurs d'egout, 1 = l'egout de 5 m). */
const haut = (cs: readonly CorpsToit[], bosses: [number, number, number][]) => {
  const g = gabaritDesCorps(sud, cs, 5);
  const en = (u: number) => { for (let i = 1; i < g.length; i++) { const a = g[i - 1]!, b = g[i]!; if (u <= b.u + 1e-9) return b.u - a.u < 1e-9 ? b.v : a.v + ((b.v - a.v) * (u - a.u)) / (b.u - a.u); } return g[g.length - 1]!.v; };
  return Array.from({ length: 201 }, (_, k) => { const u = k / 200; const b = bosses.find(([a, z]) => u >= a && u <= z); return { u, v: b ? b[2] : en(u) }; });
};
const ia = (elements: { element: 'cheminee' | 'lucarne'; u: number }[]): ObservationsFacade =>
  lireObservationsFacade({ calage: { angles: {}, pointes: [], appentis: [], corps: [], cache: [] }, forme: { silhouette: 'ligne-droite', bout: 'sans-objet' }, elements: elements.map((x) => ({ ...x, confiance: 'moyenne' })), surface: { principale: 'enduit', zones: [] }, ouvertures: [], confiance: 'moyenne' })!;
const appliquer = (obs: ObservationsFacade | null, cs: CorpsToit[], d = diagnostiquerForme({ facade: sud, corps: cs, hauteurMur: 5, lue: null, ia: obs })) =>
  d.elements.reduce<CorpsToit[]>((acc, e) => corpsSousContrainte({ observation: e.observation, application: 'contrainte' }, acc, {} as ToitMesure, contour)!, cs);

describe('les bosses etroites de la ligne du haut', () => {
  it('une bosse qui depasse le faitage est une cheminee, une qui reste dessous une lucarne, chacune sur le corps du troncon', () => {
    // A u 0,3 : 40 cm de large, jusqu'a 8,5 m (le faitage est a 8 m) ; a u 0,7 : 1 m de large, jusqu'a 6,5 m.
    const lue = haut([maison], [[0.28, 0.32, 1.7], [0.65, 0.75, 1.3]]);
    const d = diagnostiquerForme({ facade: sud, corps: [maison], hauteurMur: 5, lue });
    expect(d.propositions).toEqual([]);
    expect(d.elements.map((e) => [e.element, e.corps, e.cote, e.provenance])).toEqual([['cheminee', 0, 0, 'deterministe'], ['lucarne', 0, 0, 'deterministe']]);
    expect(d.elements[0]!.u).toBeCloseTo(0.3, 1);
    expect(d.elements[0]!.observation).toEqual({ elementsDesMurs: [{ mur: d.elements[0]!.mur, element: 'cheminee', a: expect.closeTo(3, 0) }] });
    expect(direElement(d.elements[1]!)).toMatch(/^une lucarne à 0,7 de la largeur de la façade, d’après le haut lu sur la photo$/);
    expect(d.constats.join(' ')).not.toMatch(/F7/);
  });

  it('une colonne qui saute (une antenne, une branche) n est pas un element', () => {
    const d = diagnostiquerForme({ facade: sud, corps: [maison], hauteurMur: 5, lue: haut([maison], [[0.5, 0.505, 1.8]]) });
    expect(d.elements).toEqual([]);
  });

  it('Claude donne son mot a la bosse (« des deux ») ; ce qu il est seul a voir, le haut lu ne le confirmant pas, n est pas propose', () => {
    const lue = haut([maison], [[0.65, 0.75, 1.3]]);
    const d = diagnostiquerForme({ facade: sud, corps: [maison], hauteurMur: 5, lue, ia: ia([{ element: 'lucarne', u: 0.71 }, { element: 'cheminee', u: 0.2 }]) });
    expect(d.elements.map((e) => [e.element, e.provenance])).toEqual([['lucarne', 'les-deux']]);
    expect(d.constats).toContain('Claude voit une cheminée à u 0,2, que le haut lu sur la photo ne confirme pas : rien n’est proposé.');
  });

  it('sans haut lu, Claude seul propose, et la proposition le dit', () => {
    const d = diagnostiquerForme({ facade: sud, corps: [maison], hauteurMur: 5, lue: null, ia: ia([{ element: 'cheminee', u: 0.5 }]) });
    expect(d.elements.map((e) => [e.element, e.corps, e.provenance])).toEqual([['cheminee', 0, 'ia']]);
    expect(direElement(d.elements[0]!)).toMatch(/d’après Claude seul$/);
  });
});

describe('le moteur pose l element sur le corps concerne (corpsSousContrainte)', () => {
  it('la cheminee sur le faitage, a sa place ; la lucarne sur le pan du mur ; les hauteurs du corps ne bougent pas', () => {
    const [c] = appliquer(ia([{ element: 'cheminee', u: 0.3 }, { element: 'lucarne', u: 0.7 }]), [maison]);
    expect(c!.cheminees).toEqual([{ x: 3, y: 4, largeurM: 0.6, profondeurM: 0.5, sommetM: 8.4, position: 'faitage', source: 'observation' }]);
    expect(c!.lucarnes).toEqual([{ type: 'inconnue', pan: 0, debutM: 6.4, finM: 7.6, faitageM: 6.8, profondeurM: 1.2, source: 'observation' }]);
    expect([c!.faitage, c!.egouts, c!.pts, c!.pignons]).toEqual([maison.faitage, maison.egouts, maison.pts, maison.pignons]);
  });

  it('un element pose a la main ne bouge pas, et n est pas propose une seconde fois', () => {
    const aLaMain: CorpsToit = { ...maison, cheminees: [{ x: 3.4, y: 4, largeurM: 0.8, profondeurM: 0.6, sommetM: 9, position: 'faitage', source: 'observation' }] };
    const d = diagnostiquerForme({ facade: sud, corps: [aLaMain], hauteurMur: 5, lue: null, ia: ia([{ element: 'cheminee', u: 0.3 }]) });
    expect(d.elements).toEqual([]);
    expect(d.constats.join(' ')).toMatch(/Une cheminée à u 0,3 : le corps 1 la porte déjà/);
    // Rejoue la meme observation sur le corps qui la porte : rien ne change, la cheminee posee a la main reste a sa place.
    const obs = { elementsDesMurs: [{ mur: { gauche: p(0, 0), droite: p(10, 0) }, element: 'cheminee' as const, a: 3 }] };
    const apres = corpsSousContrainte({ observation: obs, application: 'contrainte' }, [aLaMain], {} as ToitMesure, contour)!;
    expect(apres[0]).toEqual(aLaMain);
  });

  it('une lucarne ne se pose pas sur un toit plat', () => {
    const plat: CorpsToit = { ...maison, faitage: 5, egouts: [5, 5] };
    const d = diagnostiquerForme({ facade: sud, corps: [plat], hauteurMur: 5, lue: null, ia: ia([{ element: 'lucarne', u: 0.5 }]) });
    expect(d.elements).toEqual([]);
  });
});

describe('la calibration dit les elements (E5 bis, E8) et les juge contre la verite du cas', () => {
  it('la proposition a confirmer, l E8 qui l attend, et la mesure contre les cheminees vraies du corps', () => {
    const mur = { gauche: sud.gauche, droite: sud.droite };
    const vrai = (s: number) => [{ nom: 'Maison', mur, forme: 'deux-pans' as const, pignons: [], cheminees: [{ s }] }];
    const juste = etapeDiagnostic({ mur, corps: [maison] }, 5, null, ia([{ element: 'cheminee', u: 0.3 }]), undefined, vrai(3.2));
    expect(juste.etape.etat).toBe('a-confirmer');
    expect(juste.etape.resume).toMatch(/Proposition \(à confirmer\) : corps 1, long pan : une cheminée à 0,3 de la largeur de la façade, d’après Claude seul\./);
    expect(juste.etape.verite).toMatchObject({ juste: true, texte: expect.stringMatching(/1 cheminée vraie, 1 posée ou proposée : juste/) });
    expect(etapeToit(juste.diagnostic).resume).toMatch(/^1 proposition de toit à confirmer .*une cheminée ou une lucarne s’y pose/);
    const loin = etapeDiagnostic({ mur, corps: [maison] }, 5, null, ia([{ element: 'cheminee', u: 0.3 }]), undefined, vrai(8));
    expect(loin.etape.verite?.juste).toBe(false);
  });
});
