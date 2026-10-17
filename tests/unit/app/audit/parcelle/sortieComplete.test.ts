import { describe, it, expect } from 'vitest';
import { propositionsDeClaude, propositionsDetails, detailsDeLaFacade } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import { observationsDeClaude } from '../../../../../src/app/audit/parcelle/observationsClaude.js';
import { avecReserveDesNiveaux, niveauxSousEgout, reserveNiveaux } from '../../../../../src/app/audit/parcelle/niveauxClaude.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide, type EtiquetteImage } from '../../../../../src/model/auditParcelle.js';
import { attributsEnDesaccord, voter, type ReponseAnalyse } from '../../../../../src/model/analyseClaude.js';
import { teinteDe } from '../../../../../src/model/couleurMur.js';
import { CHAMPS_SIMPLES } from '../../../../../src/app/regles/sujets/vote.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { EntreesPropositions } from '../../../../../src/app/audit/parcelle/propositions.js';
import type { MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import type { Proposition } from '../../../../../src/regles/decisions.js';
import type { ObjetPlan, PtBrut, ReleveFacade } from '../../../../../src/model/types.js';

// Ce que la sortie de l'analyse donne en plus au projet (schema version 5) : la teinte des murs, leur decor, les
// images hors sujet, les ouvertures par niveau confrontees a la hauteur a l'egout, et les details des ouvertures
// poses sur le releve d'une facade que le renfort n'a pas touchee.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const ETIQUETTES: EtiquetteImage[] = [
  { texte: 'photo de la façade sud de maison, prise à 8 m, vers 180°', photo: { cle: 'maison', cote: 0, rang: 0 } },
  { texte: 'photo de rue, prise à 20 m, vers 200°' },
];

function entrees(mesures = new Map<string, MesureFacade>(), plus: Partial<ObjetPlan> = {}): EntreesPropositions {
  const objets = [
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, bdtopo: { materiauxMurs: '30' }, ...plus }),
  ];
  const capture = captureVide('78650000AE0101');
  return { objets, liste: listeDeControle(objets, capture), capture, mesures };
}

const avec = (plus: Record<string, unknown>): ReponseAnalyse => ({ ...reponse(), ...plus } as ReponseAnalyse);
const blanc = () => avec({ teinteMurs: { indices: [{ image: 1, vu: 'enduit blanc' }], valeur: 'blanc' }, decorMurs: { indices: [{ image: 1, vu: 'pans de bois verts' }], valeur: 'colombages' } });

describe('la teinte et le décor des murs', () => {
  it('propose la famille de teinte vue quand la couleur du projet est d’une autre', () => {
    const e = entrees();
    expect(teinteDe('#BEBAB1')).toBe('gris-clair');
    const p = propositionsDeClaude(e.objets, e.liste.batiments, { maison: { reponses: [blanc(), blanc(), blanc()], etiquettes: ETIQUETTES } }).find((x) => x.id === 'maison:claude:couleurMurs');
    expect(p).toMatchObject({ source: 'claude', avant: '#BEBAB1 (matériau)', apres: '#EEEBE4 (blanc), teinte vue par Claude', confiance: 1, effet: { type: 'couleurMurs', couleur: '#EEEBE4' } });
    expect(p?.reserve).toMatch(/non encore mesuré/);
    // Deja de cette famille : rien de neuf.
    const gris = avec({ teinteMurs: { indices: [], valeur: 'gris-clair' } });
    expect(propositionsDeClaude(e.objets, e.liste.batiments, { maison: { reponses: [gris, gris, gris], etiquettes: [] } }).some((x) => x.id === 'maison:claude:couleurMurs')).toBe(false);
  });

  it('dit le décor en observation, et ne propose rien d’une réponse d’avant le schéma version 5', () => {
    const obs = observationsDeClaude(entrees(), { maison: { reponses: [blanc(), blanc(), blanc()], etiquettes: ETIQUETTES } }, {});
    expect(obs[0]?.observations.map((o) => o.texte)).toContain('Décor des murs : colombages');
    const e = entrees();
    expect(propositionsDeClaude(e.objets, e.liste.batiments, { maison: { reponses: [reponse(), reponse(), reponse()], etiquettes: [] } }).some((x) => x.id === 'maison:claude:couleurMurs')).toBe(false);
    // Un champ simple qu'aucune passe ne donne ne vaut pas un desaccord (pas d'escalade pour lui).
    expect(attributsEnDesaccord(voter([reponse(), reponse(), reponse()], CHAMPS_SIMPLES))).toEqual([]);
  });
});

describe('les images hors sujet', () => {
  it('sont celles que plus de la moitié des passes citent, et se disent à reprendre', () => {
    const h = avec({ imagesHorsSujet: [2] });
    const v = voter([h, h, avec({ imagesHorsSujet: [1, 2] })]);
    expect(v.imagesHorsSujet).toEqual([2]);
    expect(voter([reponse(), avec({ imagesHorsSujet: ['x', 2] })]).imagesHorsSujet).toEqual([]);
    const obs = observationsDeClaude(entrees(), { maison: { reponses: [h, h, h], etiquettes: ETIQUETTES } }, {});
    expect(obs[0]?.observations.find((o) => o.texte.startsWith('L’image 2'))?.texte).toBe('L’image 2 ne montre pas ce bâtiment, d’après Claude : à reprendre');
  });
});

describe('les niveaux d’ouvertures', () => {
  const longPan = (niveaux: number) => avec({ facades: [{ ...reponse().facades[0]!, bout: 'sans-objet', ouvertures: { niveaux, parNiveau: Array(niveaux).fill(3), manquees: 0, enTrop: 0 } }] });

  it('se votent par niveau, et ne comptent sous l’égout que sur un long pan', () => {
    const v = voter([longPan(2), longPan(2), longPan(2)]);
    expect(v.facades[0]?.parNiveau).toMatchObject({ valeur: [3, 3], accord: 1 });
    expect(niveauxSousEgout(v)).toEqual({ niveaux: 2, facade: 'sud' });
    // Un pignon porte des fenetres au-dessus de l'egout : il ne compte pas.
    expect(niveauxSousEgout(voter([reponse()]))).toBe(null);
  });

  it('mettent une réserve sur une hauteur à l’égout qui ne les loge pas', () => {
    const e = entrees();
    const o = e.objets[1] as ObjetPlan;
    const v = voter([longPan(3), longPan(3), longPan(3)]);
    expect(reserveNiveaux(o, v, 7)).toBe(null);
    expect(reserveNiveaux(o, v, 5)).toBe('Claude voit 3 niveaux d’ouvertures sur la façade sud : il leur faut au moins 6,6 m à l’égout.');
    const hauteur = { id: 'maison:hauteur', cible: { type: 'batiment', cle: 'maison' }, effet: { type: 'hauteur', hauteurM: 5 }, reserve: null } as unknown as Proposition;
    const [p] = avecReserveDesNiveaux([hauteur], e.objets, { maison: v });
    expect(p?.reserve).toMatch(/^Claude voit 3 niveaux/);
  });
});

describe('les détails des ouvertures', () => {
  const releve: ReleveFacade = { cote: 0, largeur: 10, hauteur: 6, ouvertures: [
    { type: 'fenetre', x: 2, y: 1, l: 1.2, h: 1.3, source: 'detectee' },
    { type: 'fenetre', x: 5, y: 1, l: 1.2, h: 1.3, source: 'detectee', details: { volets: 'roulant' } },
    { type: 'porte', x: 8, y: 0, l: 1, h: 2.1, source: 'detectee' },
  ] } as ReleveFacade;
  const mesures = () => new Map<string, MesureFacade>([['maison#0', { cle: 'maison', cote: 0, releve, rangReleve: 0, coinsTrouves: true, confiance: 0.8, hauteurM: 6, couleur: null }]]);

  it('traduit les volets, le coffre et les baies cintrées dans le vocabulaire du relevé', () => {
    const v = voter([avec({ facades: [{ ...reponse().facades[0]!, details: { volets: 'indetermine', coffre: 'oui', balcon: 'non', forme: 'cintree' } }] })]);
    expect(detailsDeLaFacade(v.facades[0]!).details).toEqual({ volets: 'roulant', forme: 'cintre' });
    expect(detailsDeLaFacade(voter([avec({ facades: [{ ...reponse().facades[0]!, details: { volets: 'mixte', coffre: 'non', balcon: 'non', forme: 'mixte' } }] })]).facades[0]!).votes).toEqual([]);
  });

  it('complète les fenêtres sans détail, jamais une porte ni un détail déjà reconnu, et arrive décochée', () => {
    const e = entrees(mesures());
    const [p] = propositionsDetails(e, { maison: { reponses: [reponse(), reponse(), reponse()], etiquettes: ETIQUETTES } });
    expect(p).toMatchObject({ id: 'maison#0:claude:details', source: 'claude', apres: 'volets battants sur 1 ouverture, vu par Claude', confiance: 1, cible: { type: 'facade', cle: 'maison', cote: 0 } });
    const ouvertures = (p?.effet as { releve: ReleveFacade }).releve.ouvertures;
    expect(ouvertures.map((o) => o.details?.volets)).toEqual(['battants', 'roulant', undefined]);
    expect(p?.reserve).toMatch(/majorité des ouvertures/);
    // Le renfort a touche la facade : il donne les details ouverture par ouverture, la ligne s'efface.
    expect(propositionsDetails({ ...e, renfort: { 'maison#0': { resume: '…' } as never } }, { maison: { reponses: [reponse()], etiquettes: [] } })).toEqual([]);
  });
});
