import { describe, it, expect } from 'vitest';
import { libelleForme, nombreObservations, observationsDeClaude } from '../../../../../src/app/audit/parcelle/observationsClaude.js';
import { detailAnalyse } from '../../../../../src/app/audit/parcelle/analyseClaude.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide, type EtiquetteImage, type RenfortFacadeCapture } from '../../../../../src/model/auditParcelle.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { EntreesPropositions } from '../../../../../src/app/audit/parcelle/propositions.js';
import type { MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import type { CorpsToit, ObjetPlan, PtBrut, ReleveFacade } from '../../../../../src/model/types.js';

// Ce que Claude a vu sans que le projet sache l'ecrire (essai d'AE 101 sur telephone : « il ne
// trouve rien : pignon, ouverture, porte, rien ») : la forme, les pignons, les lucarnes, les
// elements, les ouvertures manquees par facade, et ce que le renfort a fait des ouvertures, par type.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const ETIQUETTES: EtiquetteImage[] = [
  { texte: 'photo de la façade sud de Maison, prise à 8 m, vers 180°', photo: { cle: 'maison', cote: 0, rang: 0 } },
  { texte: 'rendu du modèle actuel de Plan, même point de vue que l’image 1' },
  { texte: 'orthophoto, vue du dessus, recadrée sur le contour de Maison' },
];

function entrees(mesures = new Map<string, MesureFacade>()): EntreesPropositions {
  const objets = [
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
    obj('maison', { name: 'Maison', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, toit: { forme: 'croupes', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS] }),
  ];
  const capture = captureVide('78650000AE0101');
  return { objets, liste: listeDeControle(objets, capture), capture, mesures };
}

/** Un deux-pans a pignons, deux lucarnes cote rue, une fenetre de toit, et deux ouvertures que Plan n'a pas vues au sud. */
const vue = () => reponse({
  forme: { indices: [{ image: 3, vu: 'une arête, deux pignons' }], valeur: 'deux-pans' },
  bouts: { indices: [{ image: 1, vu: 'mur pignon à gauche et à droite' }], gauche: 'pignon', droite: 'pignon' },
  lucarnes: { indices: [{ image: 1, vu: 'deux lucarnes à fronton' }], nombre: 2, types: ['jacobine'], pan: 'rue' },
  elements: [{ indices: [{ image: 3, vu: 'un châssis vitré' }], element: 'fenetre-de-toit' }],
  facades: [{ ...reponse().facades[0]!, ouvertures: { niveaux: 2, parNiveau: [3, 3], manquees: 2, enTrop: 0 }, ecart: 'la porte d’entrée manque au modèle' }],
});

describe('les observations de Claude', () => {
  it('montre la forme, les pignons, les lucarnes, les elements et les ouvertures manquees, avec l image et l accord', () => {
    const e = entrees();
    const obs = observationsDeClaude(e, { maison: { reponses: [vue(), vue(), vue()], etiquettes: ETIQUETTES } }, {});
    expect(obs.map((b) => b.nom)).toEqual(['Maison']);
    const textes = obs[0]!.observations.map((o) => o.texte);
    expect(textes).toContain('Forme du toit vue : deux pans, faîtage parallèle à la rue ; le modèle de Plan dit : quatre pans (croupes)');
    expect(textes).toContain('Pignons aux deux bouts du faîtage');
    expect(textes).toContain('2 lucarnes vues (jacobine), côté rue');
    expect(textes).toContain('Vu aussi : fenêtre de toit');
    expect(textes).toContain('Façade sud : 2 niveaux d’ouvertures (3 + 3), volets battants');
    expect(textes).toContain('Façade sud : 2 ouvertures non détectées par Plan');
    expect(textes).toContain('Façade sud : la porte d’entrée manque au modèle');
    const pignons = obs[0]!.observations.find((o) => o.id === 'maison:obs:pignons');
    expect(pignons).toMatchObject({ ou: ['photo de la façade sud de Maison'], accord: 1 });
    const manquees = obs[0]!.observations.find((o) => o.texte.startsWith('Façade sud : 2 ouvertures'));
    expect(manquees?.ou).toEqual(['photo de la façade sud de Maison']);
    expect(nombreObservations(obs)).toBe(textes.length);
  });

  it('dit les bouts differents, la part d accord, et rien sur un attribut sans majorite', () => {
    const r = (gauche: string) => reponse({ bouts: { indices: [], gauche, droite: 'croupe' } });
    const obs = observationsDeClaude(entrees(), { maison: { reponses: [r('pignon'), r('pignon'), r('croupe')], etiquettes: ETIQUETTES } }, {});
    const bouts = obs[0]!.observations.find((o) => o.id === 'maison:obs:pignons');
    expect(bouts?.texte).toBe('Bouts du faîtage, vus de la rue : pignon à gauche, croupe à droite');
    expect(bouts?.accord).toBeCloseTo(2 / 3, 6);
    const sans = observationsDeClaude(entrees(), { maison: { reponses: [reponse({ forme: { indices: [], valeur: 'plat' } }), reponse({ forme: { indices: [], valeur: 'mansart' } })], etiquettes: [] } }, {});
    expect(sans[0]?.observations.some((o) => o.id === 'maison:obs:forme')).toBe(false);
    expect(libelleForme('dome')).toBe('Dôme');
  });

  it('dit par type ce que le renfort a fait des ouvertures, dont celles en pointille', () => {
    const releve: ReleveFacade = { cote: 0, largeur: 10, hauteur: 6, ouvertures: [{ type: 'fenetre', x: 2, y: 1, l: 1.2, h: 1.3, source: 'detectee' }] } as ReleveFacade;
    const m: MesureFacade = { cle: 'maison', cote: 0, releve, rangReleve: 0, coinsTrouves: true, confiance: 0.8, hauteurM: 6, couleur: null };
    const rf: RenfortFacadeCapture = {
      passes: 3,
      ouvertures: [{ ...releve.ouvertures[0]!, type: 'porte-fenetre', source: 'claude' }, { type: 'porte', x: 6, y: 0, l: 1, h: 2.1, source: 'claude', confiance: 0.75 }],
      decochees: [{ type: 'fenetre', x: 8, y: 1, l: 1, h: 1.2, source: 'claude', confiance: 0.4 }],
      bilan: { pleines: 1, pointille: 1, typesCorriges: 1 }, resume: '…',
    };
    const obs = observationsDeClaude(entrees(new Map([['maison#0', m]])), {}, { 'maison#0': rf });
    expect(obs[0]!.observations.map((o) => o.texte)).toEqual(['Façade sud, relevé revu par Claude : 1 porte ajoutée, 1 fenêtre en pointillé, vue par Claude, non confirmée sur la photo, 1 type corrigé']);
  });

  it('dit combien de propositions et d observations sont pretes, ou que Claude n a rien vu', () => {
    const a = { accord: { t: '2026-10-13T10:00:00.000Z', partage: true }, resultats: { t: '', modele: '', schema: 1, prompt: 1, parBatiment: { maison: [] } } };
    expect(detailAnalyse('prete', a, 'repos', null, { propositions: 2, observations: 7 })).toBe('Propositions de Claude prêtes : 2 propositions et 7 observations (1 bâtiment, accord du 13 octobre).');
    expect(detailAnalyse('prete', a, 'repos', null, { propositions: 0, observations: 0 })).toBe('Claude a répondu (1 bâtiment, accord du 13 octobre), mais n’a rien vu à proposer ni à signaler.');
  });
});
