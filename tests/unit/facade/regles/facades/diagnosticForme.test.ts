import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { diagnostiquerForme, direChangement } from '../../../../../src/facade/regles/facades/diagnosticForme.js';
import { gabaritDesCorps } from '../../../../../src/facade/gabaritMur.js';
import { facadesDuContour, type Facade } from '../../../../../src/geometry/cotesVusDeDehors.js';
import { corpsSousContrainte } from '../../../../../src/facade/regles/toits/faits.js';
import { lireObservationsFacade, type ObservationsFacade } from '../../../../../src/regles/facades/observations.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../../../src/model/types.js';

// Le diagnostic de forme (MD/spec-facade-calage-audit.md §5 bis, §5 ter ; lot F4) : le haut lu sur la photo contre le gabarit que
// donnent les corps, troncon par troncon ; les variantes du toit d'UN corps, faites par le moteur des toits ; des propositions qui
// expliquent mieux l'image, sur leur corps ; des alertes de hauteur, jamais des corrections.

const p = (x: number, y: number): PtBrut => ({ x, y });
const corps = (pts: PtBrut[], posFaitage: number, faitage: number, egouts: [number, number], extra: Partial<CorpsToit> = {}): CorpsToit =>
  ({ pts, posFaitage, faitage, egouts, pignons: [], ecart: 0, ...extra }) as CorpsToit;
const sud = (contour: PtBrut[]): Facade => facadesDuContour(contour, 5.2).find((f) => f.normale.y < -0.99 && Math.abs(f.gauche.y) < 1e-9)!;
/** Le haut d'un gabarit, lu tous les centiemes du mur : ce que montrerait une photo de ce toit. */
const hautDe = (f: Facade, cs: readonly CorpsToit[], H: number, retouche: (u: number, v: number) => number = (_u, v) => v) => {
  const g = gabaritDesCorps(f, cs, H);
  const en = (u: number) => { for (let i = 1; i < g.length; i++) { const a = g[i - 1]!, b = g[i]!; if (u <= b.u + 1e-9) return b.u - a.u < 1e-9 ? b.v : a.v + ((b.v - a.v) * (u - a.u)) / (b.u - a.u); } return g[g.length - 1]!.v; };
  return Array.from({ length: 101 }, (_, k) => ({ u: k / 100, v: retouche(k / 100, en(k / 100)) }));
};

// Une maison de 8 m de facade au sud, 9 m de profondeur, faitage nord-sud : la facade sud est son mur de bout (un pignon).
const maison = corps([p(0, 0), p(0, 9), p(8, 9), p(8, 0)], 4, 8.8, [5.2, 5.2]);
// Un appentis contre la maison, a l'est : son mur sud prolonge la facade.
const appentis = corps([p(8, 0), p(8, 6), p(11, 6), p(11, 0)], 0, 4, [4, 2.6]);
const enL = [p(0, 0), p(11, 0), p(11, 6), p(8, 6), p(8, 9), p(0, 9)];

const ae101 = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101.json', 'utf8')) as { contour: PtBrut[]; corpsAvecFaits: CorpsToit[] };
const sudAe101 = facadesDuContour(ae101.contour, 0).find((f) => f.cote === 6)!;
const sansEst = ae101.corpsAvecFaits.map((c, i) => (i === 0 ? { ...c, pignons: c.pignons.filter((x) => x.debut > 1) } : c));

const ia = (pointes: { u: number; v: number }[], silhouette = 'plusieurs-sommets'): ObservationsFacade =>
  lireObservationsFacade({ calage: { angles: {}, pointes: pointes.map((x) => ({ ...x, confiance: 'moyenne' })), appentis: [], corps: [], cache: [] }, forme: { silhouette, bout: 'sans-objet' }, elements: [], surface: { principale: 'enduit', zones: [] }, ouvertures: [], confiance: 'moyenne' })!;

describe('le decoupage de la facade en troncons de corps', () => {
  it('chaque part du haut est rattachee au mur du corps qui la porte : la maison puis l appentis', () => {
    const f = sud(enL);
    const d = diagnostiquerForme({ facade: f, corps: [maison, appentis], hauteurMur: 5.2, lue: null });
    expect(d.troncons.map((t) => [t.corps, t.cote])).toEqual([[0, 3], [1, 3]]);
    expect(d.troncons[0]!.u1).toBeCloseTo(8 / 11, 2);
    expect(d.troncons[1]!.u0).toBeCloseTo(8 / 11, 2);
  });
});

describe('le diagnostic, corps par corps', () => {
  it('un toit qui explique la photo : rien a proposer', () => {
    const f = sud(enL);
    const d = diagnostiquerForme({ facade: f, corps: [maison, appentis], hauteurMur: 5.2, lue: hautDe(f, [maison, appentis], 5.2) });
    expect(d.lue).toBe(true);
    expect(d.ecart).toBeLessThan(0.01);
    expect(d.propositions).toEqual([]);
  });

  it('un mur de bout plat la ou le gabarit a un pignon : une croupe sur la maison, et sur elle seule', () => {
    const f = sud(enL);
    const avecCroupe = { ...maison, croupes: [4, 0] as [number, number] };
    const d = diagnostiquerForme({ facade: f, corps: [maison, appentis], hauteurMur: 5.2, lue: hautDe(f, [avecCroupe, appentis], 5.2) });
    expect(d.propositions).toHaveLength(1);
    const pr = d.propositions[0]!;
    expect([pr.corps, pr.cote, pr.natures, pr.bout]).toEqual([0, 3, ['pignon-vers-croupe'], 'croupe']);
    expect(pr.gain).toBeGreaterThan(0.9);
    expect(pr.observation).toEqual({ boutsDesMurs: [{ mur: pr.mur, bout: 'croupe' }] });
    // Le moteur pose la croupe sur le corps que designe le mur ; l'appentis ne bouge pas, ni les hauteurs.
    const apres = corpsSousContrainte({ observation: pr.observation, application: 'contrainte' }, [maison, appentis], {} as ToitMesure, enL)!;
    expect(apres[0]).toMatchObject({ croupes: [4, 0], faitage: 8.8, egouts: [5.2, 5.2] });
    expect(apres[1]).toBe(appentis);
  });

  it('une bosse lue au-dessus de l appentis ne fait pas de pignon sur lui (il n a pas de faitage) : un diagnostic ne traverse pas deux corps', () => {
    const f = sud(enL);
    const bosse = hautDe(f, [maison, appentis], 5.2, (u, v) => (u > 0.82 && u < 0.92 ? v + 0.4 : v));
    const d = diagnostiquerForme({ facade: f, corps: [maison, appentis], hauteurMur: 5.2, lue: bosse });
    expect(d.propositions).toEqual([]);
  });

  it('AE 101 sud, un pignon de moins sur le corps principal : le deterministe propose de l ajouter, a sa place', () => {
    const d = diagnostiquerForme({ facade: sudAe101, corps: sansEst, hauteurMur: 2.4, lue: hautDe(sudAe101, ae101.corpsAvecFaits, 2.4) });
    expect(d.propositions).toHaveLength(1);
    const pr = d.propositions[0]!;
    expect(pr.corps).toBe(0);
    expect(pr.natures).toEqual(['ajouter-pignon']);
    expect(pr.provenance).toBe('deterministe');
    const nouveau = pr.pignons!.find((x) => x.debut < 1)!;
    expect(Math.abs(nouveau.fin - 3.7)).toBeLessThan(0.3);
    expect(nouveau.debut).toBeLessThan(0.3);
    expect(direChangement(pr)).toMatch(/^un pignon de plus \(pignons de 0(,\d+)? à/);
  });

  it('AE 101 sud, un pignon que la photo ne montre pas : le retirer', () => {
    const d = diagnostiquerForme({ facade: sudAe101, corps: ae101.corpsAvecFaits, hauteurMur: 2.4, lue: hautDe(sudAe101, sansEst, 2.4) });
    expect(d.propositions.map((x) => x.natures)).toEqual([['retirer-pignon']]);
    expect(d.propositions[0]!.pignons).toHaveLength(1);
  });

  it('une pointe lue plus haute que le gabarit : une alerte, le LiDAR garde la hauteur, aucune proposition', () => {
    const plusHaut = hautDe(sudAe101, ae101.corpsAvecFaits, 2.4, (_u, v) => (v > 2.3 ? 2.3 + (v - 2.3) * 1.6 : v));
    const d = diagnostiquerForme({ facade: sudAe101, corps: ae101.corpsAvecFaits, hauteurMur: 2.4, lue: plusHaut });
    expect(d.propositions).toEqual([]);
    expect(d.alertes.length).toBeGreaterThanOrEqual(1);
    expect(d.alertes.every((a) => a.vue > a.attendue && a.corps === 0 && a.source === 'deterministe')).toBe(true);
  });

  it('un haut lu sous l egout ne lit pas le haut du mur : il ne sert pas', () => {
    const d = diagnostiquerForme({ facade: sudAe101, corps: sansEst, hauteurMur: 2.4, lue: [{ u: 0, v: 0.5 }, { u: 0.4, v: 0.5 }, { u: 0.5, v: 2.1 }, { u: 1, v: 2.1 }] });
    expect(d.lue).toBe(false);
    expect(d.propositions).toEqual([]);
    expect(d.constats[0]).toMatch(/passe sous l’égout/);
  });
});

describe('Claude dans le diagnostic', () => {
  it('sans haut lu, une pointe que le plan n a pas : un pignon de plus, de la largeur du pignon voisin, propose par Claude seul', () => {
    const d = diagnostiquerForme({ facade: sudAe101, corps: sansEst, hauteurMur: 2.4, lue: null, ia: ia([{ u: 0.11, v: 3.1 }, { u: 0.8, v: 3.1 }]) });
    expect(d.propositions).toHaveLength(1);
    expect(d.propositions[0]).toMatchObject({ corps: 0, natures: ['ajouter-pignon'], provenance: 'ia', gain: null });
  });

  it('sans haut lu, une pointe du plan que Claude ne voit pas : un pignon de moins, propose par Claude seul', () => {
    const d = diagnostiquerForme({ facade: sudAe101, corps: ae101.corpsAvecFaits, hauteurMur: 2.4, lue: null, ia: ia([{ u: 0.11, v: 3.1 }]) });
    expect(d.propositions.map((x) => [x.natures, x.provenance])).toEqual([[['retirer-pignon'], 'ia']]);
  });

  it('avec un haut lu, Claude confirme (les deux) ou non : une pointe qu il voit seul ne se propose pas', () => {
    const lue = hautDe(sudAe101, ae101.corpsAvecFaits, 2.4);
    expect(diagnostiquerForme({ facade: sudAe101, corps: sansEst, hauteurMur: 2.4, lue, ia: ia([{ u: 0.11, v: 3.1 }, { u: 0.8, v: 3.1 }]) }).propositions[0]?.provenance).toBe('les-deux');
    const seule = diagnostiquerForme({ facade: sudAe101, corps: ae101.corpsAvecFaits, hauteurMur: 2.4, lue, ia: ia([{ u: 0.11, v: 3.1 }, { u: 0.45, v: 3 }, { u: 0.8, v: 3.1 }]) });
    expect(seule.propositions).toEqual([]);
    expect(seule.constats.some((c) => /que le haut lu sur la photo ne confirme pas/.test(c))).toBe(true);
  });

  it('une pointe que Claude voit plus haute : une alerte de Claude, jamais une correction', () => {
    const d = diagnostiquerForme({ facade: sudAe101, corps: ae101.corpsAvecFaits, hauteurMur: 2.4, lue: null, ia: ia([{ u: 0.11, v: 4 }, { u: 0.8, v: 3.1 }]) });
    expect(d.propositions).toEqual([]);
    expect(d.alertes).toEqual([expect.objectContaining({ source: 'ia', vue: 4, corps: 0 })]);
  });
});
