import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cibleBatiment, cibleFacade, confianceCorps, constatsDuBatiment, formeArbitree, formeDesBouts, type EntreesConstats } from '../../../../../src/app/audit/parcelle/constats.js';
import { REGLES_LIDAR, SEUILS_LIDAR_CITES } from '../../../../../src/app/audit/parcelle/reglesLidar.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { cleMesure } from '../../../../../src/app/audit/parcelle/mesures.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { voterAnalyse } from '../../../../../src/app/regles/sujets/vote.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { Constat } from '../../../../../src/facade/regles/reconciliation.js';
import type { MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import type { FacadeAnalyse } from '../../../../../src/model/analyseClaude.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Les constats d'un batiment, source par source (lot R3) : sur AE 101 (faitage du corps principal a 74 degres, murs est et ouest
// en bout, sud en long pan ; cotes du contour : est 1, ouest 9, sud 6 ; le nord 12 est le bout de l'aile nord-est, corps 2).

const d = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101.json', 'utf8')) as { contour: PtBrut[]; toitMesure: ObjetPlan['toitMesure']; corps: CorpsToit[] };
const maison = (plus: Record<string, unknown> = {}): ObjetPlan => ({ key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: d.contour, elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, toitMesure: d.toitMesure, corpsToit: d.corps, ...plus }) as unknown as ObjetPlan;
const parcelle = { key: 'parcelle', name: 'p', type: 'polygon', fonction: 'terrain', pts: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }] } as unknown as ObjetPlan;
const COTES = { est: 1, ouest: 9, sud: 6, nord: 12 } as const;
const ETIQ = { est: 'est (côté 2)', ouest: 'ouest (côté 10)', sud: 'sud (côté 7)', nord: 'nord (côté 13)' } as const;
const entrees = (o: ObjetPlan, plus: Partial<EntreesConstats> = {}): EntreesConstats => ({ o, b: listeDeControle([parcelle, o], captureVide('78650000AE0101')).batiments[0]!, mesures: new Map(), vu: {}, vote: null, ...plus });
const de = (cs: Constat[], source: string, attribut: string) => cs.find((c) => c.source === source && c.attribut === attribut);
const mesure = (mur: keyof typeof COTES, plus: Partial<MesureFacade>): [string, MesureFacade] => [cleMesure('maison', COTES[mur]), { cle: 'maison', cote: COTES[mur], releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, ...plus }];

describe('les mots communs', () => {
  it('un quatre-pans, des croupes et un pavillon ne font qu’une forme ; les bouts disent la forme', () => {
    expect(['quatre-pans', 'croupes', 'pavillon', 'deux-pans', 'demi-croupe'].map(formeArbitree)).toEqual(['croupes', 'croupes', 'croupes', 'deux-pans', 'demi-croupes']);
    expect(formeDesBouts(['pignon', 'pignon'])).toBe('deux-pans');
    expect(formeDesBouts(['croupe', 'pignon'])).toBe('croupes');
    expect(formeDesBouts(['pignon'])).toBeNull();
    expect(cibleBatiment('m')).toBe('batiment:m');
    expect(cibleFacade('m', 3)).toBe('facade:m#3');
  });
  it('la confiance d’un corps décroît avec son écart à la mesure', () => {
    expect([0, 0.6, 1.2, 3].map(confianceCorps)).toEqual([0.95, 0.68, 0.4, 0.4]);
  });
  it('les seuils que les constats LiDAR citent existent dans regles/toits/reglages.json : ils font surface à l’écran', () => {
    const f = JSON.parse(readFileSync('regles/toits/reglages.json', 'utf8')) as { seuils: Record<string, unknown> };
    for (const nom of SEUILS_LIDAR_CITES) expect(Object.keys(f.seuils), nom).toContain(nom);
    expect(REGLES_LIDAR.lidar.egout).toBe('RETRAIT_EGOUT_M');
  });
});

describe('les constats de l’IGN, du LiDAR et du projet', () => {
  it('l’IGN dit la hauteur BD TOPO et le matériau des murs des fichiers fonciers', () => {
    const { constats } = constatsDuBatiment(entrees(maison({ bdtopo: { hauteurM: 5.4, materiauxMurs: '4' } })));
    expect(de(constats, 'ign', 'hauteurEgout')).toMatchObject({ cible: 'batiment:maison', valeur: 5.4, confiance: null });
    expect(de(constats, 'ign', 'materiauMurs')).toMatchObject({ valeur: 'brique', confiance: 0.7 });
    // Sans hauteur mesuree, la hauteur retenue (estimee) vaut moins.
    expect(de(constatsDuBatiment(entrees(maison({ bdtopo: { hauteurM: null, hauteurRetenueM: 5.4 } }))).constats, 'ign', 'hauteurEgout')).toMatchObject({ valeur: 5.4, confiance: 0.4 });
    // Le toit de repli de la BD TOPO ne parle que quand le LiDAR n'a rien lu.
    const repli = constatsDuBatiment(entrees(maison({ corpsToit: undefined, toitMesure: undefined, toit: { forme: 'quatre-pans', hauteur: 3, angleFaitage: 0, source: 'bdtopo' } }))).constats;
    expect(de(repli, 'ign', 'formeToit')).toMatchObject({ valeur: 'croupes', confiance: 0.4 });
    expect(de(constats, 'ign', 'formeToit')).toBeUndefined();
  });

  it('le LiDAR dit l’égout, le faîtage, la forme, les bouts et le sens des corps, chacun avec sa règle', () => {
    const { constats } = constatsDuBatiment(entrees(maison()));
    expect(de(constats, 'lidar', 'hauteurEgout')).toMatchObject({ valeur: Math.round(d.toitMesure!.egout * 100) / 100, regle: 'RETRAIT_EGOUT_M', confiance: 0.9 });
    expect(de(constats, 'lidar', 'hauteurTotale')).toMatchObject({ regle: 'SAILLIE_M' });
    expect(de(constats, 'lidar', 'formeToit')).toMatchObject({ valeur: 'deux-pans', regle: 'SEUIL_MARCHE_M' });
    expect(de(constats, 'lidar', 'boutsToit')?.valeur).toEqual(['pignon', 'pignon']);
    expect(de(constats, 'lidar', 'sensFaitage')?.valeur).toBeCloseTo(74.31, 2);
    // Un toit ecrit a la main n'est plus une lecture du LiDAR : il ne dit rien de la forme.
    const saisi = constatsDuBatiment(entrees(maison({ toit: { forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'saisie' } }))).constats;
    expect(de(saisi, 'lidar', 'formeToit')).toBeUndefined();
    expect(de(saisi, 'lidar', 'hauteurEgout')).toBeDefined();
  });

  it('le projet dit ce qu’il a, et ce qu’une personne a choisi (un veto)', () => {
    const p = constatsDuBatiment(entrees(maison({ bdtopo: { hauteurM: 5 }, couleurMurs: { materiau: 'pierre' } })));
    expect(p.projet('batiment:maison', 'hauteurEgout')).toEqual({ valeur: 6, choisi: false });
    expect(p.projet('batiment:maison', 'formeToit')).toEqual({ valeur: 'deux-pans', choisi: false });
    expect(p.projet('batiment:maison', 'boutsToit').valeur).toEqual(['pignon', 'pignon']);
    expect(p.projet('batiment:maison', 'materiauMurs')).toEqual({ valeur: 'pierre', choisi: true });
    expect(p.projet('batiment:maison', 'couverture')).toEqual({ valeur: null, choisi: false });
    // Sans attributs IGN, la hauteur a ete saisie.
    expect(constatsDuBatiment(entrees(maison())).projet('batiment:maison', 'hauteurEgout').choisi).toBe(true);
    expect(constatsDuBatiment(entrees(maison({ toit: { forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'saisie', couverture: 'zinc' } }))).projet('batiment:maison', 'couverture')).toEqual({ valeur: 'zinc', choisi: true });
    expect(p.projet('batiment:maison', 'silhouetteFacade')).toEqual({ valeur: null, choisi: false });
  });
});

describe('les constats de la photo de façade', () => {
  it('la hauteur du mur est la médiane des façades dont les coins sont trouvés', () => {
    const mesures = new Map([mesure('sud', { hauteurM: 5.8 }), mesure('nord', { hauteurM: 6.2, confiance: 0.7 }), mesure('est', { hauteurM: 9, coinsTrouves: false })]);
    const h = de(constatsDuBatiment(entrees(maison(), { mesures })).constats, 'photo', 'hauteurEgout');
    expect(h).toMatchObject({ valeur: 6, confiance: 0.7 });
    expect(h?.indices).toHaveLength(2);
  });

  it('la silhouette des murs dit les bouts, le sens du faîtage et la forme', () => {
    const mesures = new Map([mesure('est', { silhouette: 'triangle' }), mesure('ouest', { silhouette: 'triangle' })]);
    const { constats } = constatsDuBatiment(entrees(maison(), { mesures }));
    expect(de(constats, 'photo', 'boutsToit')?.valeur).toEqual(['pignon', 'pignon']);
    expect(Math.abs((de(constats, 'photo', 'sensFaitage')?.valeur as number) - 74)).toBeLessThan(2);
    expect(de(constats, 'photo', 'formeToit')).toMatchObject({ valeur: 'deux-pans', regle: 'regles/toits/silhouettes.json', confiance: 0.9 });
    expect(constats.filter((c) => c.source === 'photo' && c.attribut === 'silhouetteFacade').map((c) => [c.cible, c.valeur])).toEqual([['facade:maison#1', 'triangle'], ['facade:maison#9', 'triangle']]);
  });

  it('des coins non trouvés rendent la photo moins sûre ; sans silhouette, elle ne dit rien du toit', () => {
    const mesures = new Map([mesure('est', { silhouette: 'triangle', coinsTrouves: false }), mesure('ouest', { silhouette: 'triangle', coinsTrouves: false })]);
    expect(de(constatsDuBatiment(entrees(maison(), { mesures })).constats, 'photo', 'boutsToit')?.confiance).toBeCloseTo(0.72, 6);
    expect(constatsDuBatiment(entrees(maison(), { mesures: new Map([mesure('est', { silhouette: 'indetermine' })]) })).constats.filter((c) => c.source === 'photo')).toEqual([]);
  });
});

describe('les constats de Claude', () => {
  const mur = (m: keyof typeof ETIQ, silhouette: string, bout: string): FacadeAnalyse => ({
    indices: [{ image: 1, vu: 'le haut du mur ' + m }], facade: ETIQ[m], ouvertures: { niveaux: 1, parNiveau: [2], manquees: 0, enTrop: 0 },
    details: { volets: 'indetermine', coffre: 'indetermine', balcon: 'indetermine', forme: 'indetermine' }, materiau: 'brique', silhouette, bout, ecart: '',
  });
  const vote = (plus: Parameters<typeof reponse>[0] = {}) => { const r = reponse(plus); return voterAnalyse([r, r, r]); };

  it('la forme et les bouts de l’ensemble, le matériau et la couverture, avec l’accord des passes', () => {
    const { constats } = constatsDuBatiment(entrees(maison(), { vote: vote({ forme: { indices: [], valeur: 'croupes' }, bouts: { indices: [], gauche: 'croupe', droite: 'croupe' } }) }));
    expect(de(constats, 'claude', 'formeToit')).toMatchObject({ valeur: 'croupes', confiance: 1 });
    expect(de(constats, 'claude', 'boutsToit')?.valeur).toEqual(['croupe', 'croupe']);
    expect(de(constats, 'claude', 'materiauMurs')).toMatchObject({ valeur: 'brique' });
    expect(de(constats, 'claude', 'couverture')).toMatchObject({ valeur: 'ardoise' });
  });

  it('les murs disent les bouts et le sens mieux que la vue d’ensemble : leurs constats la remplacent', () => {
    const v = vote({ bouts: { indices: [], gauche: 'pignon', droite: 'pignon' }, facades: [mur('est', 'triangle', 'croupe'), mur('ouest', 'triangle', 'croupe')] });
    const { constats } = constatsDuBatiment(entrees(maison(), { vote: v }));
    expect(constats.filter((c) => c.source === 'claude' && c.attribut === 'boutsToit')).toHaveLength(1);
    expect(de(constats, 'claude', 'boutsToit')?.valeur).toEqual(['croupe', 'croupe']);
    expect(de(constats, 'claude', 'sensFaitage')).toBeDefined();
    expect(constats.filter((c) => c.source === 'claude' && c.attribut === 'silhouetteFacade').map((c) => c.valeur)).toEqual(['triangle', 'triangle']);
  });

  it('la forme dite par les murs remplace celle de l’ensemble et a le dernier mot ; dite par des lignes droites de longs pans seules, non', () => {
    const bouts = constatsDuBatiment(entrees(maison(), { vote: vote({ forme: { indices: [], valeur: 'deux-pans' }, facades: [mur('est', 'triangle', 'croupe'), mur('ouest', 'triangle', 'croupe')] }) })).constats;
    expect(bouts.filter((c) => c.source === 'claude' && c.attribut === 'formeToit').map((c) => [c.valeur, c.regle])).toEqual([['croupes', 'regles/toits/silhouettes.json']]);
    // L'abri d'AE 101 : Claude voit un appentis, et une ligne droite sur un long pan (celle d'un appentis aussi bien que d'un deux-pans).
    const longs = constatsDuBatiment(entrees(maison(), { vote: vote({ forme: { indices: [], valeur: 'appentis' }, facades: [mur('sud', 'ligne-droite', 'sans-objet')] }) })).constats;
    expect(longs.filter((c) => c.source === 'claude' && c.attribut === 'formeToit').map((c) => c.valeur)).toEqual(['appentis']);
    expect(longs.filter((c) => c.source === 'claude' && (c.attribut === 'sensFaitage' || c.attribut === 'boutsToit') && c.regle?.startsWith('regles/toits/silhouettes.json')).every((c) => c.regle?.endsWith('(longs pans seuls)'))).toBe(true);
  });

  it('sans analyse, Claude ne dit rien', () => {
    expect(constatsDuBatiment(entrees(maison())).constats.filter((c) => c.source === 'claude')).toEqual([]);
  });
});

describe('les constats de la personne qui a vu', () => {
  it('ce qu’elle a noté, avec une confiance pleine', () => {
    const { constats } = constatsDuBatiment(entrees(maison(), { vu: { forme: 'croupes', bouts: 'pignon-croupe', murs: 'pierre', couverture: 'zinc' } }));
    const t = constats.filter((c) => c.source === 'terrain');
    expect(t.map((c) => [c.attribut, c.valeur, c.confiance])).toEqual([['formeToit', 'croupes', 1], ['boutsToit', ['pignon', 'croupe'], 1], ['materiauMurs', 'pierre', 1], ['couverture', 'zinc', 1]]);
    expect(constatsDuBatiment(entrees(maison(), { vu: { forme: 'autre', couverture: 'terrasse' } })).constats.filter((c) => c.source === 'terrain')).toEqual([]);
  });
});
