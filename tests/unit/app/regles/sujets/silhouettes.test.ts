import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { propositionsClaudeDuBatiment } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import { propositionsDeLAudit, cochesParDefaut, cleMesure } from '../../../../../src/app/audit/parcelle/propositions.js';
import { appliquerPropositions } from '../../../../../src/regles/decisions.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { FacadeAnalyse } from '../../../../../src/model/analyseClaude.js';
import type { MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import type { SilhouetteFacade } from '../../../../../src/model/silhouetteFacade.js';
import type { Proposition } from '../../../../../src/regles/decisions.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La forme du toit lue sur la silhouette des facades (lot « photos de l'audit -> toit ») : sur AE 101, le faitage
// du corps principal est a 74 degres (est-nord-est) ; les murs « est » et « ouest » ferment ses bouts, « sud » et
// « nord » sont ses longs pans. Cotes du contour : est 13 (5,9 m), ouest 9 (9,6 m), sud 6 (9 m), nord 12 (7,8 m).

const d = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101.json', 'utf8')) as { contour: PtBrut[]; toitMesure: ObjetPlan['toitMesure']; corps: CorpsToit[] };
const maison = (): ObjetPlan => ({ key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: d.contour, elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, toitMesure: d.toitMesure, corpsToit: d.corps }) as unknown as ObjetPlan;
const parcelle = { key: 'parcelle', name: 'p', type: 'polygon', fonction: 'terrain', pts: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }] } as unknown as ObjetPlan;
const COTES = { est: 13, ouest: 9, sud: 6, nord: 12 } as const;
const ETIQ = { est: 'est (côté 14)', ouest: 'ouest (côté 10)', sud: 'sud (côté 7)', nord: 'nord (côté 13)' } as const;

const batiment = (o: ObjetPlan) => listeDeControle([parcelle, o], captureVide('78650000AE0101')).batiments[0]!;
const murAnalyse = (mur: keyof typeof ETIQ, silhouette: string): FacadeAnalyse => ({
  indices: [{ image: 1, vu: 'le haut du mur ' + mur }], facade: ETIQ[mur], ouvertures: { niveaux: 1, parNiveau: [2], manquees: 0, enTrop: 0 },
  details: { volets: 'indetermine', coffre: 'indetermine', balcon: 'indetermine', forme: 'indetermine' }, materiau: 'indetermine', silhouette, ecart: '',
});

/** Les propositions de forme de Claude, la vue d'ensemble muette, d'apres les seules silhouettes. */
const depuisClaude = (o: ObjetPlan, murs: Partial<Record<keyof typeof ETIQ, string>>, ensemble: { forme?: string; gauche?: string; droite?: string } = {}): Proposition | undefined => {
  const r = reponse({
    forme: { indices: [], valeur: ensemble.forme ?? 'indetermine' }, bouts: { indices: [], gauche: ensemble.gauche ?? 'indetermine', droite: ensemble.droite ?? 'indetermine' },
    facades: Object.entries(murs).map(([m, s]) => murAnalyse(m as keyof typeof ETIQ, s as string)),
  });
  return propositionsClaudeDuBatiment(o, batiment(o), { reponses: [r, r, r], etiquettes: [{ texte: 'photo de la façade', photo: { cle: 'maison', cote: 0, rang: 0 } }] }).find((p) => p.effet.type === 'corpsToit');
};

describe('la forme du toit lue sur la silhouette des façades vues par Claude', () => {
  it('un trapèze sur les deux longs pans dit des croupes : relu sur la mesure, décoché, avec les murs en indices', () => {
    const o = maison();
    const p = depuisClaude(o, { sud: 'trapeze', nord: 'trapeze' });
    expect(p).toMatchObject({ id: 'maison:claude:formeToit', source: 'claude', avant: 'deux pans' });
    expect(p?.apres).toMatch(/^quatre pans \(croupes\), relue sur la mesure LiDAR d’après ce que Claude voit \(bouts en croupe\)/);
    expect((p?.effet as { corps: CorpsToit[] }).corps[0]?.croupes?.every((h) => h > 0)).toBe(true);
    expect(p?.indices.map((i) => i.texte)).toEqual(expect.arrayContaining(['Silhouette des façades : façade sud (côté 7) croupe ; façade nord (côté 13) croupe', 'le haut du mur sud (photo 1 de la façade)']));
    expect(cochesParDefaut([p as Proposition]).size).toBe(0);
  });

  it('les murs de bout l’emportent sur la vue d’ensemble, qui se dit en réserve', () => {
    const o = maison();
    const p = depuisClaude(o, { est: 'croupe', ouest: 'croupe' }, { gauche: 'pignon', droite: 'pignon' });
    expect(p?.apres).toMatch(/bouts en croupe\)$/);
    expect(p?.reserve).toMatch(/Sur l’ensemble de la maison, Claude voit deux bouts en pignon/);
  });

  it('validée, elle remplace les corps du bâtiment ; le plan d’origine n’est pas touché', () => {
    const o = maison();
    const avant = JSON.stringify(o.corpsToit);
    const p = depuisClaude(o, { sud: 'trapeze' }) as Proposition;
    const copie = { ...o } as ObjetPlan;
    expect(appliquerPropositions([copie], [p], [], '2026-10-17')).toEqual(['maison']);
    expect(copie.corpsToit?.[0]?.croupes?.every((h) => h > 0)).toBe(true);
    expect(JSON.stringify(o.corpsToit)).toBe(avant);
  });

  it('ne propose rien quand les murs disent ce que le toit est déjà (pignons), ni quand ils ne disent rien', () => {
    const o = maison();
    expect(depuisClaude(o, { est: 'pignon', ouest: 'pignon' })).toBeUndefined();
    expect(depuisClaude(o, { est: 'indetermine', ouest: 'indetermine' })).toBeUndefined();
    expect(depuisClaude(o, { est: 'pignon' })).toBeUndefined();
  });

  it('sans mesure LiDAR, rien ne se relit', () => {
    const o = maison();
    delete o.toitMesure;
    expect(depuisClaude(o, { sud: 'trapeze', nord: 'trapeze' })).toBeUndefined();
  });
});

describe('la forme du toit lue sur la silhouette mesurée sur les photos de l’audit', () => {
  const mesures = (parMur: Partial<Record<keyof typeof COTES, SilhouetteFacade>>): Map<string, MesureFacade> => new Map(Object.entries(parMur).map(([m, silhouette]) => {
    const cote = COTES[m as keyof typeof COTES];
    return [cleMesure('maison', cote), { cle: 'maison', cote, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, silhouette }];
  }));
  const propose = (o: ObjetPlan, parMur: Partial<Record<keyof typeof COTES, SilhouetteFacade>>): Proposition | undefined => {
    const capture = captureVide('78650000AE0101');
    return propositionsDeLAudit({ objets: [parcelle, o], liste: listeDeControle([parcelle, o], capture), capture, mesures: mesures(parMur) }).find((p) => p.effet.type === 'corpsToit');
  };

  it('des trapèzes sur les longs pans : une ligne des mesures, jamais cochée d’office, avec photo et avant/après', () => {
    const o = maison();
    const p = propose(o, { sud: 'trapeze', nord: 'trapeze' });
    expect(p).toMatchObject({ id: 'maison:toit:silhouettes', source: 'mesure', objet: 'Forme du toit de maison', avant: 'deux pans' });
    expect(p?.apres).toMatch(/^quatre pans \(croupes\), relue sur la mesure LiDAR d’après la silhouette de vos photos/);
    expect(p?.reserve).toMatch(/un triangle de mur \(pignon\) et un pan de toit vu de face \(croupe\) se ressemblent/);
    expect(p?.indices[0]).toMatchObject({ texte: 'Façade sud (côté 7) : croupe', photo: { cle: 'maison', cote: 6, rang: 0 } });
    expect(cochesParDefaut([p as Proposition]).size).toBe(0);
  });

  it('des pignons là où le toit est déjà en deux pans : rien à proposer', () => {
    expect(propose(maison(), { est: 'pignon', ouest: 'pignon' })).toBeUndefined();
  });

  it('une photo sans silhouette ne propose rien ; la validation écrit les corps', () => {
    const o = maison();
    expect(propose(o, { est: 'indetermine', ouest: 'indetermine' })).toBeUndefined();
    const p = propose(o, { sud: 'trapeze' }) as Proposition;
    const copie = { ...o } as ObjetPlan;
    expect(appliquerPropositions([copie], [p], [], '2026-10-17')).toEqual(['maison']);
    expect(copie.corpsToit?.[0]?.croupes?.every((h) => h > 0)).toBe(true);
  });
});
