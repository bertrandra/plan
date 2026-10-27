import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { propositionsClaudeDuBatiment } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import { cochesParDefaut } from '../../../../../src/app/audit/parcelle/propositions.js';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { cleMesure } from '../../../../../src/app/audit/parcelle/mesures.js';
import { voterAnalyse } from '../../../../../src/app/regles/sujets/vote.js';
import { appliquerPropositions } from '../../../../../src/regles/decisions.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { FacadeAnalyse } from '../../../../../src/model/analyseClaude.js';
import type { MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import type { SilhouetteFacade } from '../../../../../src/model/silhouetteFacade.js';
import type { Proposition } from '../../../../../src/regles/decisions.js';
import { azimutFaitage } from '../../../../../src/facade/regles/toits/faits.js';
import type { CorpsToit, ObjetPlan, PtBrut, ChampsBatiment } from '../../../../../src/model/types.js';

// La forme du toit lue sur la silhouette des facades (lot « photos de l'audit -> toit ») : sur AE 101, le faitage
// du corps principal est a 74 degres (est-nord-est) ; les murs « est » et « ouest » ferment ses bouts, « sud » et
// « nord » sont ses longs pans. Cotes du contour : est 13 (5,9 m), ouest 9 (9,6 m), sud 6 (9 m), nord 12 (7,8 m).

const d = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101.json', 'utf8')) as { contour: PtBrut[]; toitMesure: ChampsBatiment['toitMesure']; corps: CorpsToit[] };
const maison = (): ObjetPlan => ({ key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: d.contour, elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, toitMesure: d.toitMesure, corpsToit: d.corps }) as unknown as ObjetPlan;
const parcelle = { key: 'parcelle', name: 'p', type: 'polygon', fonction: 'terrain', pts: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }] } as unknown as ObjetPlan;
const COTES = { est: 13, ouest: 9, sud: 6, nord: 12 } as const;
const ETIQ = { est: 'est (côté 14)', ouest: 'ouest (côté 10)', sud: 'sud (côté 7)', nord: 'nord (côté 13)' } as const;

const batiment = (o: ObjetPlan) => listeDeControle([parcelle, o], captureVide('78650000AE0101')).batiments[0]!;
const murAnalyse = (mur: keyof typeof ETIQ, silhouette: string, bout?: string): FacadeAnalyse => ({
  indices: [{ image: 1, vu: 'le haut du mur ' + mur }], facade: ETIQ[mur], ouvertures: { niveaux: 1, parNiveau: [2], manquees: 0, enTrop: 0 },
  details: { volets: 'indetermine', coffre: 'indetermine', balcon: 'indetermine', forme: 'indetermine' }, materiau: 'indetermine', silhouette, ...(bout ? { bout } : {}), ecart: '',
});

/** Les propositions de forme de Claude, la vue d'ensemble muette, d'apres les seules silhouettes. */
const depuisClaude = (o: ObjetPlan, murs: Partial<Record<keyof typeof ETIQ, string | [string, string]>>, ensemble: { forme?: string; gauche?: string; droite?: string } = {}): Proposition | undefined => {
  const r = reponse({
    forme: { indices: [], valeur: ensemble.forme ?? 'indetermine' }, bouts: { indices: [], gauche: ensemble.gauche ?? 'indetermine', droite: ensemble.droite ?? 'indetermine' },
    facades: Object.entries(murs).map(([m, s]) => (Array.isArray(s) ? murAnalyse(m as keyof typeof ETIQ, s[0], s[1]) : murAnalyse(m as keyof typeof ETIQ, s as string))),
  });
  return propositionsClaudeDuBatiment(o, batiment(o), { reponses: [r, r, r], etiquettes: [{ texte: 'photo de la façade', photo: { cle: 'maison', cote: 0, rang: 0 } }] }).find((p) => p.effet.type === 'corpsToit');
};

describe('la forme du toit lue sur la silhouette des façades vues par Claude', () => {
  it('un trapèze sur les deux longs pans dit des croupes et un faîtage parallèle à eux : relu sur la mesure, décoché, avec les murs en indices', () => {
    const o = maison();
    const p = depuisClaude(o, { sud: ['trapeze', 'sans-objet'], nord: ['trapeze', 'sans-objet'] });
    expect(p).toMatchObject({ id: 'maison:claude:formeToit', source: 'claude', avant: 'deux pans' });
    expect(p?.apres).toMatch(/^quatre pans \(croupes\), relue sur la mesure LiDAR d’après ce que Claude voit \(bouts en croupe, faîtage à 7\d°\)/);
    expect((p?.effet as { corps: CorpsToit[] }).corps[0]?.croupes?.every((h) => h > 0)).toBe(true);
    expect(p?.indices.map((i) => i.texte)).toEqual(expect.arrayContaining(['Silhouette des façades : façade sud (côté 7) trapèze → croupe ; façade nord (côté 13) trapèze → croupe', 'le haut du mur sud (photo 1 de la façade)']));
    expect(cochesParDefaut([p as Proposition]).size).toBe(0);
  });

  it('les murs de bout l’emportent sur la vue d’ensemble, qui se dit en réserve', () => {
    const o = maison();
    const p = depuisClaude(o, { est: ['triangle', 'croupe'], ouest: ['triangle', 'croupe'] }, { gauche: 'pignon', droite: 'pignon' });
    expect(p?.apres).toMatch(/bouts en croupe, faîtage à 7\d°\)$/);
    expect(p?.reserve).toMatch(/Sur l’ensemble de la maison, Claude voit bouts en pignon/);
  });

  it('un triangle de mur (pignon) de chaque côté dit ce que le toit est déjà : rien à proposer', () => {
    const o = maison();
    expect(depuisClaude(o, { est: ['triangle', 'pignon'], ouest: ['triangle', 'pignon'] })).toBeUndefined();
    // Sans `bout`, la silhouette seule dit la meme chose.
    expect(depuisClaude(o, { est: 'triangle', ouest: 'marches' })).toBeUndefined();
  });

  it('une demi-croupe ou un brisis ne se produisent pas : le moteur ne propose pas de bouts, et rien d’autre ne change', () => {
    const o = maison();
    expect(depuisClaude(o, { est: ['trapeze', 'demi-croupe'], ouest: ['trapeze', 'demi-croupe'] })).toBeUndefined();
  });

  it('validée, elle remplace les corps du bâtiment ; le plan d’origine n’est pas touché', () => {
    const o = maison();
    const avant = JSON.stringify(o.batiment?.corpsToit);
    const p = depuisClaude(o, { sud: ['trapeze', 'sans-objet'] }) as Proposition;
    const copie = { ...o } as ObjetPlan;
    expect(appliquerPropositions([copie], [p], [], '2026-10-17')).toEqual(['maison']);
    expect(copie.batiment?.corpsToit?.[0]?.croupes?.every((h) => h > 0)).toBe(true);
    expect(JSON.stringify(o.batiment?.corpsToit)).toBe(avant);
  });

  it('des façades est et ouest en long pan font tourner le faîtage de 90° : le moteur recalcule la toiture dans ce sens, sur la mesure', () => {
    const o = maison();
    const avant = azimutFaitage((o.batiment?.corpsToit as CorpsToit[])[0] as CorpsToit);
    const p = depuisClaude(o, { est: ['ligne-droite', 'sans-objet'], ouest: ['ligne-droite', 'sans-objet'] });
    expect(p?.apres).toMatch(/faîtage à 16\d°\)$/);
    const corps = (p?.effet as { corps: CorpsToit[] }).corps;
    expect(Math.abs(azimutFaitage(corps[0] as CorpsToit) - avant)).toBeGreaterThan(80);
    expect(p?.indices.map((i) => i.texte)).toEqual(expect.arrayContaining([expect.stringMatching(/^Silhouette des façades : .*façade est .*ligne droite → pignon/)]));
  });

  it('ne propose rien quand les murs ne disent rien', () => {
    const o = maison();
    expect(depuisClaude(o, { est: 'indetermine', ouest: 'indetermine' })).toBeUndefined();
    expect(depuisClaude(o, { est: 'plusieurs-sommets' })).toBeUndefined();
  });

  it('sans mesure LiDAR, rien ne se relit', () => {
    const o = maison();
    delete o.batiment?.toitMesure;
    expect(depuisClaude(o, { sud: ['trapeze', 'sans-objet'], nord: ['trapeze', 'sans-objet'] })).toBeUndefined();
  });
});

describe('la forme du toit arbitrée entre le LiDAR et la silhouette mesurée sur les photos de l’audit', () => {
  const mesures = (parMur: Partial<Record<keyof typeof COTES, SilhouetteFacade>>): Map<string, MesureFacade> => new Map(Object.entries(parMur).map(([m, silhouette]) => {
    const cote = COTES[m as keyof typeof COTES];
    return [cleMesure('maison', cote), { cle: 'maison', cote, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, silhouette }];
  }));
  const propose = (o: ObjetPlan, parMur: Partial<Record<keyof typeof COTES, SilhouetteFacade>>): Proposition | undefined => {
    const capture = captureVide('78650000AE0101');
    return propositionsArbitrees({ objets: [parcelle, o], liste: listeDeControle([parcelle, o], capture), capture, mesures: mesures(parMur) }, {}).find((p) => p.effet.type === 'corpsToit');
  };

  it('des trapèzes sur les longs pans contre un LiDAR en deux pans : la silhouette est retenue, la photo seule laisse la décision à prendre', () => {
    const o = maison();
    const p = propose(o, { sud: 'trapeze', nord: 'trapeze' });
    expect(p).toMatchObject({ id: 'maison:toit', source: 'arbitrage', objet: 'Forme du toit de maison', avant: 'deux pans' });
    expect(p?.apres).toMatch(/^quatre pans \(croupes\), relue sur la mesure LiDAR \(quatre pans \(croupes\), bouts en croupe, faîtage à 7\d°\) d’après /);
    // La silhouette l'emporte sur le LiDAR (regles prioritaires) ; mais une photo seule ne decide pas.
    expect(p?.reserve).toMatch(/Photo de façade seul ne décide pas/);
    expect(p?.arbitrages?.map((a) => a.attribut)).toEqual(['formeToit', 'boutsToit', 'silhouetteFacade']);
    // La silhouette du mur sud, arbitree d'abord : la photo gagne sur ce que montrent les corps lus au LiDAR.
    const sud = p?.arbitrages?.find((a) => a.attribut === 'silhouetteFacade');
    expect(sud).toMatchObject({ cible: 'facade:maison#6', decision: 'auto' });
    expect(sud?.groupes.map((g) => [g.valeur, g.retenu, g.lignes.map((l) => l.source)])).toEqual([['plusieurs sommets', false, ['lidar']], ['trapèze', true, ['photo']]]);
    const bouts = p?.arbitrages?.find((a) => a.attribut === 'boutsToit');
    expect(bouts?.groupes.map((g) => [g.valeur, g.retenu, g.lignes.map((l) => l.source)])).toEqual([['croupe + croupe', true, ['photo']], ['pignon + pignon', false, ['lidar']]]);
    expect(bouts?.groupes[1]?.lignes[0]?.regle).toMatch(/^GAIN_CROUPES = /);
    expect(bouts?.regles).not.toEqual(expect.arrayContaining(['MARGE_AUTO_MIN = 1,5']));
    expect(p?.indices.some((i) => i.texte === 'Façade sud (côté 7) : trapèze → croupe' && i.photo?.cote === 6)).toBe(true);
    expect(cochesParDefaut([p as Proposition]).size).toBe(0);
  });

  it('une seule source qui parle contre un LiDAR de poids voisin ne décide pas ; deux sources qui s’accordent contre lui, si', () => {
    const o = maison();
    const capture = captureVide('78650000AE0101');
    const e = { objets: [parcelle, o], liste: listeDeControle([parcelle, o], capture), capture, mesures: mesures({ sud: 'trapeze', nord: 'trapeze' }) };
    const vote = (() => { const r = reponse({ forme: { indices: [], valeur: 'croupes' }, bouts: { indices: [], gauche: 'croupe', droite: 'croupe' }, facades: [] }); return voterAnalyse([r, r, r]); })();
    const p = propositionsArbitrees(e, { maison: vote }).find((x) => x.effet.type === 'corpsToit');
    expect(p?.arbitrages?.every((a) => a.decision === 'auto')).toBe(true);
    expect(p?.reserve).toBeNull();
    expect(cochesParDefaut([p as Proposition]).has('maison:toit')).toBe(true);
  });

  it('des pignons là où le toit est déjà en deux pans : rien à proposer', () => {
    expect(propose(maison(), { est: 'triangle', ouest: 'triangle' })).toBeUndefined();
  });

  it('une photo sans silhouette ne propose rien ; la validation écrit les corps', () => {
    const o = maison();
    expect(propose(o, { est: 'indetermine', ouest: 'indetermine' })).toBeUndefined();
    const p = propose(o, { sud: 'trapeze' }) as Proposition;
    const copie = { ...o } as ObjetPlan;
    expect(appliquerPropositions([copie], [p], [], '2026-10-17')).toEqual(['maison']);
    expect(copie.batiment?.corpsToit?.[0]?.croupes?.every((h) => h > 0)).toBe(true);
  });

  it('un toit saisi à la main est un veto : la ligne arrive décochée, et le dit', () => {
    const o = { ...maison(), batiment: { ...(maison()).batiment, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' } } } as ObjetPlan;
    const p = propose(o, { sud: 'trapeze', nord: 'trapeze' });
    expect(p?.remplaceChoix).toBe('forme du toit saisie');
    expect(cochesParDefaut([p as Proposition]).size).toBe(0);
  });
});
