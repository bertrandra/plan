import { describe, it, expect } from 'vitest';
import { diagnostiquerForme, direChangement } from '../../../../../src/facade/regles/facades/diagnosticForme.js';
import { gabaritDesCorps } from '../../../../../src/facade/gabaritMur.js';
import { facadesDuContour, type Facade } from '../../../../../src/geometry/cotesVusDeDehors.js';
import { corpsSousContrainte } from '../../../../../src/facade/regles/toits/faits.js';
import { corpsAvecBout, demiCroupeLueALaPointe, demiCroupeLueAuBout, demiCroupeNeuve } from '../../../../../src/facade/toits/culDeGeai.js';
import { hauteurDuToitEn } from '../../../../../src/facade/toits/toitCorps.js';
import { lireObservationsFacade, type ObservationsFacade } from '../../../../../src/regles/facades/observations.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../../../src/model/types.js';

// La decouverte du cul de geai (demi-croupe ; demande du proprietaire, 5 novembre 2026) : l'E7 le propose sur un bout (la pointe du
// pignon se lit coupee, ou Claude le voit) et sur la pointe d'un pignon d'un long pan ; le moteur des toits le relit sur la mesure LiDAR
// (boutsDesMurs, pointesDesMurs). Rien de cela ne change la sortie du moteur sans proposition.

const p = (x: number, y: number): PtBrut => ({ x, y });
const corps = (pts: PtBrut[], posFaitage: number, faitage: number, egouts: [number, number], extra: Partial<CorpsToit> = {}): CorpsToit =>
  ({ pts, posFaitage, faitage, egouts, pignons: [], ecart: 0, ...extra }) as CorpsToit;
const hautDe = (f: Facade, cs: readonly CorpsToit[], H: number) => {
  const g = gabaritDesCorps(f, cs, H);
  const en = (u: number) => { for (let i = 1; i < g.length; i++) { const a = g[i - 1]!, b = g[i]!; if (u <= b.u + 1e-9) return b.u - a.u < 1e-9 ? b.v : a.v + ((b.v - a.v) * (u - a.u)) / (b.u - a.u); } return g[g.length - 1]!.v; };
  return Array.from({ length: 101 }, (_, k) => ({ u: k / 100, v: en(k / 100) }));
};
const ia = (bout: string, silhouette = 'triangle'): ObservationsFacade =>
  lireObservationsFacade({ calage: { angles: {}, pointes: [], appentis: [], corps: [], cache: [] }, forme: { silhouette, bout }, elements: [], surface: { principale: 'enduit', zones: [] }, ouvertures: [], confiance: 'moyenne' })!;

// La maison de l'etalon 28 : 8 m de facade au sud, 9 m de profondeur, faitage nord-sud a 8,8 m : la facade sud est son pignon.
const contour = [p(0, 0), p(8, 0), p(8, 9), p(0, 9)];
const maison = corps([p(0, 0), p(0, 9), p(8, 9), p(8, 0)], 4, 8.8, [5.2, 5.2]);
const sud = facadesDuContour(contour, 5.2).find((f) => f.cote === 0)!;
const vraie = corpsAvecBout(maison, 0, demiCroupeNeuve(5.2, 8.8, 4, 0.33));

/** Une surface mesuree tiree d'un toit : le LiDAR d'un batiment dont on connait le toit. */
function mesureDe(cs: readonly CorpsToit[], ctr: readonly PtBrut[]): ToitMesure {
  const xs = ctr.map((q) => q.x), ys = ctr.map((q) => q.y), pas = 0.5;
  const x0 = Math.min(...xs) + 0.25, y0 = Math.max(...ys) - 0.25, nx = Math.round((Math.max(...xs) - x0) / pas) + 1, ny = Math.round((y0 - Math.min(...ys)) / pas) + 1;
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(hauteurDuToitEn(cs, { x: x0 + i * pas, y: y0 - j * pas }));
  const v = z.filter((x): x is number => x !== null);
  return { pas, x0, y0, nx, ny, z, egout: Math.min(...v), faite: Math.max(...v), source: 'lidar' };
}

describe('le cul de geai que montre la photo (E7)', () => {
  it('propose un cul de geai au bout quand la pointe du pignon se lit coupee, et le moteur le relit sur la mesure', () => {
    const lue = hautDe(sud, [vraie], 5.2);
    const d = diagnostiquerForme({ facade: sud, corps: [maison], hauteurMur: 5.2, lue });
    expect(d.propositions).toHaveLength(1);
    const x = d.propositions[0]!;
    expect(x).toMatchObject({ bout: 'demi-croupe', natures: ['vers-demi-croupe'], provenance: 'deterministe' });
    expect(direChangement(x)).toMatch(/cul de geai/);
    expect(x.observation.boutsDesMurs?.[0]?.bout).toBe('demi-croupe');
    // Le moteur relit la coupe sur la mesure : celle du vrai toit, au decimetre.
    const relus = corpsSousContrainte({ observation: x.observation, application: 'contrainte' }, [maison], mesureDe([vraie], contour), contour)!;
    const b = relus[0]!.bouts?.[0];
    expect(b?.type).toBe('demi-croupe');
    expect(Math.abs((b as { hauteurPignonM: number }).hauteurPignonM - (vraie.bouts![0] as { hauteurPignonM: number }).hauteurPignonM)).toBeLessThan(0.3);
  });

  it('un pignon que la photo montre entier ne se propose pas en cul de geai', () => {
    expect(diagnostiquerForme({ facade: sud, corps: [maison], hauteurMur: 5.2, lue: hautDe(sud, [maison], 5.2) }).propositions).toEqual([]);
  });

  it('Claude dit « demi-croupe » : propose sur le bout en pignon, que le haut lu le montre ou non', () => {
    const avec = diagnostiquerForme({ facade: sud, corps: [maison], hauteurMur: 5.2, lue: hautDe(sud, [maison], 5.2), ia: ia('demi-croupe') });
    expect(avec.propositions.map((x) => [x.bout, x.provenance])).toEqual([['demi-croupe', 'ia']]);
    const sans = diagnostiquerForme({ facade: sud, corps: [maison], hauteurMur: 5.2, lue: null, ia: ia('demi-croupe') });
    expect(sans.propositions.map((x) => [x.bout, x.provenance])).toEqual([['demi-croupe', 'ia']]);
    // Un autre mot de Claude ne propose rien.
    expect(diagnostiquerForme({ facade: sud, corps: [maison], hauteurMur: 5.2, lue: null, ia: ia('pignon') }).propositions).toEqual([]);
  });

  it('propose la pointe d un pignon de long pan coupee en cul de geai, et le moteur la pose sur ce pignon', () => {
    // Un gouttereau de 12 m au sud, faitage est-ouest, un pignon de 4 m au milieu.
    const ctr = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
    const g = { pan: 0 as const, debut: 4, fin: 8, faitage: 8.6, profondeur: 4 };
    const long = corps([p(0, 0), p(12, 0), p(12, 8), p(0, 8)], 4, 9, [5.2, 5.2], { pignons: [g] });
    const coupe = { ...long, pignons: [{ ...g, pointe: demiCroupeNeuve(5.2, 8.6, 2, 0.5) }] };
    const f = facadesDuContour(ctr, 5.2).find((x) => x.cote === 0)!;
    const d = diagnostiquerForme({ facade: f, corps: [long], hauteurMur: 5.2, lue: hautDe(f, [coupe], 5.2) });
    const x = d.propositions.find((q) => q.pointe);
    expect(x).toMatchObject({ natures: ['pointe-en-demi-croupe'], bout: null });
    expect(x!.observation.pointesDesMurs?.[0]?.pointe).toBe('demi-croupe');
    const relus = corpsSousContrainte({ observation: x!.observation, application: 'contrainte' }, [long], mesureDe([coupe], ctr), ctr)!;
    expect(relus[0]!.pignons[0]!.pointe?.type).toBe('demi-croupe');
  });
});

describe('le cul de geai lu sur la mesure LiDAR', () => {
  it('lit la coupe d un bout et d une pointe de pignon, et rien sur un pignon entier', () => {
    const m = mesureDe([vraie], contour);
    expect(demiCroupeLueAuBout(maison, 0, m, contour)).toMatchObject({ type: 'demi-croupe' });
    expect(demiCroupeLueAuBout(maison, 1, m, contour)).toBeNull();
    const ctr = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
    const g = { pan: 0 as const, debut: 4, fin: 8, faitage: 8.6, profondeur: 4 };
    const long = corps([p(0, 0), p(12, 0), p(12, 8), p(0, 8)], 4, 9, [5.2, 5.2], { pignons: [g] });
    const coupe = { ...long, pignons: [{ ...g, pointe: demiCroupeNeuve(5.2, 8.6, 2, 0.5) }] };
    expect(demiCroupeLueALaPointe(long, g, mesureDe([coupe], ctr), ctr)).toMatchObject({ type: 'demi-croupe' });
    expect(demiCroupeLueALaPointe(long, g, mesureDe([long], ctr), ctr)).toBeNull();
  });
});

describe('les etalons du cul de geai (E6, E7)', () => {
  it('etalon 28 : le pignon du plan, la pointe lue coupee sur la photo : l E7 propose le cul de geai, decoche', async () => {
    const { chargerCorpus } = await import('../../../../banc/facades/banc.js');
    const { casDeLEtalon, photosDeLEtalon } = await import('../../../../../src/facade/banc/etalons.js');
    const { batimentDeLEtalon } = await import('../../../../../src/facade/banc/projetEtalon.js');
    const { derouler, entreesDuCas } = await import('../../../../../src/facade/releve/enchainement.js');
    const { rechercher } = await import('../../../../../src/facade/releve/serie.js');
    const s = chargerCorpus().find((x) => x.nom.startsWith('28'))!, ph = photosDeLEtalon(s), b = batimentDeLEtalon(s);
    const f = facadesDuContour(b.contour, 0).find((x) => x.cote === 0)!;
    const e = entreesDuCas(casDeLEtalon(s, ph, ph.map((_, k) => 'p' + k)), ph.map((x) => x.image));
    const r = await derouler({ ...e, toit: { mur: { gauche: f.gauche, droite: f.droite }, corps: b.corps } }, { vue: 'calibration', chercherCoins: async (x: Parameters<typeof rechercher>[0]) => rechercher(x) });
    expect(r.sorties.forme?.diagnostic?.propositions.map((x) => x.bout)).toEqual(['demi-croupe']);
    expect(r.etapes.find((x) => x.id === 'diagnostic')!.resume).toMatch(/cul de geai/);
  }, 120_000);
});
