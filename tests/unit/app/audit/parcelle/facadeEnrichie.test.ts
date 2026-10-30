import { describe, it, expect } from 'vitest';
import { propositionsDeForme } from '../../../../../src/app/audit/parcelle/formeFacades.js';
import { facadeAEcrire } from '../../../../../src/app/audit/parcelle/facadeValidee.js';
import { lignesFacadeEnrichie } from '../../../../../src/app/audit/parcelle/facadeEnrichie.js';
import { avecPlacesApresForme } from '../../../../../src/app/audit/parcelle/apresForme.js';
import { cleMesure, type MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide, type AccordFacadeCapture } from '../../../../../src/model/auditParcelle.js';
import { appliquerPropositions, cocheeParDefaut, type Proposition } from '../../../../../src/regles/decisions.js';
import { diagnostiquerForme } from '../../../../../src/facade/regles/facades/diagnosticForme.js';
import { equipementPorte } from '../../../../../src/model/jardin.js';
import { releveReecrit } from '../../../../../src/model/facadeObjet.js';
import { facadesDuContour } from '../../../../../src/geometry/cotesVusDeDehors.js';
import type { RunEnregistre } from '../../../../../src/regles/facades/observations.js';
import type { CorpsToit, ObjetPlan, OuvertureFacade, PtBrut, ReleveFacade, ToitMesure } from '../../../../../src/model/types.js';

// La facade enrichie dans l'audit (lot L1 de MD/spec-lecture-ia-elargie.md §5.1) : les saillies proposees decochees et posees par le
// moteur seulement ; le perron, l'unite exterieure et la boite aux lettres proposes contre le mur, qui ne chargent rien ; la
// menuiserie, le garde-corps, la modenature, le store et l'etat du bati ecrits avec la Facade validee (V4) ; l'etat ne propose rien.

const p = (x: number, y: number): PtBrut => ({ x, y });
const PTS = [p(0, 0), p(10, 0), p(10, 8), p(0, 8)];
const CORPS: CorpsToit = { pts: PTS, posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0 };
const MESURE = { pts: [], hauteurs: [], egoutM: 6 } as unknown as ToitMesure;
const sud = facadesDuContour(PTS, 6).find((f) => f.cote === 0)!;
const OUV: OuvertureFacade = { id: 'o1', type: 'fenetre', x: 3, y: 3.6, l: 1.2, h: 1.5, source: 'detectee' };
const RELEVE = { cote: 0, largeur: 10, hauteur: 6, ouvertures: [OUV], releveLe: '2026-10-30' } as unknown as ReleveFacade;
const maison = (): ObjetPlan => ({
  key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: PTS, elevation: 6,
  batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, toitMesure: MESURE, corpsToit: [structuredClone(CORPS)], facades: [structuredClone(RELEVE)] },
}) as unknown as ObjetPlan;
const parcelle = { key: 'parcelle', name: 'p', type: 'polygon', fonction: 'terrain', pts: [p(-50, -50), p(50, -50), p(50, 50), p(-50, 50)] } as unknown as ObjetPlan;

/** La sortie d'une passe du run, telle que le serveur la rend : une baie d'etage. */
const SORTIE = {
  calage: { angles: {}, pointes: [], appentis: [], corps: [], cache: [] }, forme: { silhouette: 'ligne-droite', bout: 'sans-objet' }, elements: [],
  surface: { principale: 'enduit', zones: [], confiance: 'forte' },
  ouvertures: [{ type: 'fenetre', u0: 0.3, u1: 0.42, v0: 0.6, v1: 0.85, niveau: 1, travee: 0, confiance: 'forte', details: { volets: 'battants', allege: 'indetermine', forme: 'rect' }, carreaux: null }],
  confiance: 'forte',
};
/** La sortie d'une passe de la lecture enrichie (la seconde requete) : la baie en bois vert a garde-corps en fer forge, une galerie, un perron. */
const ENRICHIE = {
  baies: [{ u0: 0.3, u1: 0.42, v0: 0.6, v1: 0.85, menuiserie: 'bois', couleurMenuiserie: 'vert', couleurVolets: 'bleu', gardeCorps: 'fer-forge', hautGardeCorps: 0.78, couleurGardeCorps: 'noir' }],
  saillies: [{ genre: 'galerie', u0: 0.1, u1: 0.5, forme: 'rectangle', niveau: 'rdc', toit: 'pan', haut: 0.4, couverture: 'sans-objet', confiance: 'moyenne' }],
  decroches: [{ u: 0.7, sens: 'avance', confiance: 'moyenne' }],
  modenature: { egout: 'corniche', rangsGenoise: -1, bandeaux: [0.5], chaines: 'aucune', encadrements: 'indetermine', soubassement: 0, parementSoubassement: 'indetermine', descentes: [0.98] },
  appendices: [{ nature: 'store', u0: 0.6, u1: 0.8, v0: 0.4, v1: 0.47, marches: -1, confiance: 'moyenne' }, { nature: 'perron', u0: 0.55, u1: 0.65, v0: 0, v1: 0.08, marches: 3, confiance: 'forte' }, { nature: 'unite-exterieure', u0: 0.9, u1: 0.98, v0: 0, v1: 0.12, marches: -1, confiance: 'moyenne' }],
  etat: [{ nature: 'humidite', u0: 0, u1: 0.3, v0: 0, v1: 0.15, confiance: 'moyenne' }],
};
const RUN: RunEnregistre = {
  le: '2026-10-30T10:00:00Z', modele: 'claude-haiku-5-5', prompt: 4, schema: 4, passes: 3, sorties: [SORTIE, SORTIE, SORTIE], cout: 0.004, tokens: { entree: 9000, sortie: 2000 }, image: { largeur: 1024, hauteur: 700 }, chaine: 1,
  enrichie: { le: '2026-10-30T10:00:00Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, passes: 3, sorties: [ENRICHIE, ENRICHIE, ENRICHIE], cout: 0.003, tokens: { entree: 9000, sortie: 1000 } },
};

const proposer = (o: ObjetPlan, objets: ObjetPlan[] = [parcelle, o]) => {
  const diagnostic = diagnostiquerForme({ facade: sud, corps: o.batiment!.corpsToit!, hauteurMur: 6, lue: null });
  const mesures = new Map<string, MesureFacade>([[cleMesure('maison', 0), { cle: 'maison', cote: 0, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, diagnostic }]]);
  const capture = captureVide('78650000AE0101');
  return propositionsDeForme({ objets, liste: listeDeControle(objets, capture), capture, mesures, runs: { [cleMesure('maison', 0)]: RUN } });
};

describe('les propositions de la facade enrichie (lot L1)', () => {
  it('une galerie decochee, posee par le moteur seulement ; un perron et une unite exterieure contre le mur, qui ne chargent rien', () => {
    const o = maison();
    const ps = proposer(o);
    expect(ps.map((x) => [x.id, x.effet.type, cocheeParDefaut(x)])).toEqual([
      ['maison:saillie:0:galerie:10', 'saillieDuToit', false],
      ['facade:maison:0:perron:55', 'ajoutObjet', false],
      ['facade:maison:0:unite-exterieure:90', 'ajoutObjet', false],
    ]);
    expect(ps[0]!.apres).toMatch(/^une galerie de 4 m, à 2,4 m du sol, 1,5 m de profondeur par défaut/);
    const objets = [parcelle, o];
    appliquerPropositions(objets, ps, [], '2026-10-30');
    // Le corps d'avant ne bouge pas ; la galerie est ajoutee apres lui, et le toit se fige (une decision de la personne).
    expect(o.batiment!.corpsToit![0]).toEqual(CORPS);
    expect(o.batiment!.corpsToit![1]!.saillie).toMatchObject({ genre: 'galerie', hote: 0, largeurM: 4 });
    expect(o.batiment!.toitFige).toBe(true);
    const perron = objets.find((x) => x.key === 'maison:0:perron:55')!;
    expect(perron).toMatchObject({ fonction: 'equipement', nature: 'perron', elevation: 0.51 });
    expect(equipementPorte(perron)).toBe(false);
    // Poses : plus rien a proposer (la saillie est deja la, les equipements aussi).
    expect(proposer(o, objets)).toEqual([]);
  });

  it('validee avec une forme de toit proposee, la saillie est reposee par le moteur sur le corps qui porte son mur', () => {
    const ps = proposer(maison());
    const forme: Proposition = { ...ps[0]!, id: 'maison:forme', effet: { type: 'corpsToit', corps: [{ ...CORPS, faitage: 9.5 }] } };
    const [, s] = avecPlacesApresForme([forme, ps[0]!]);
    expect(s!.effet).toMatchObject({ type: 'saillieDuToit', apresForme: { corps: expect.objectContaining({ saillie: expect.objectContaining({ genre: 'galerie', hote: 0 }) }) } });
  });

  it('la Facade validee (V4) ecrit la menuiserie, le garde-corps, la modenature, le store et l etat signale', () => {
    const o = maison();
    const ia = { ...OUV, details: { volets: 'battants' as const, menuiserie: { materiau: 'bois' as const, couleur: '#5e7d5e', source: 'ia' as const }, couleurVolets: '#5b7a99', gardeCorps: { type: 'fer-forge' as const, hauteurM: 1.08, couleur: '#2e3033', source: 'ia' as const }, allege: 'garde-corps' as const } };
    const accord: AccordFacadeCapture = { ouvertures: [ia], decochees: [], bilan: {}, resume: null, confiance: 0.9, descentes: [0.98] };
    const m = { cle: 'maison', cote: 0, releve: RELEVE, facade: { dimensions: { largeurM: 10, egoutM: 6 }, forme: { gabarit: [], source: 'plan' } } } as unknown as MesureFacade;
    const r = facadeAEcrire(o, m, '2026-10-30', accord, RUN)!;
    // Les details que le run lit et que le releve n'a pas ; le reste (les volets) vient du releve, pas d'ici.
    expect(r.ouvertures[0]!.details).toEqual({ menuiserie: { materiau: 'bois', couleur: '#5e7d5e', source: 'ia' }, couleurVolets: '#5b7a99', gardeCorps: { type: 'fer-forge', hauteurM: 1.08, couleur: '#2e3033', source: 'ia' }, allege: 'garde-corps' });
    expect(r.modenature).toEqual({ egout: 'corniche', bandeauxM: [3], chaines: 'aucune', descentesM: [9.8], source: 'ia' });
    expect(r.appendices).toEqual([{ nature: 'store', xM: 6, largeurM: 2, hauteurM: 2.82, source: 'ia' }]);
    expect(r.etat).toEqual([{ nature: 'humidite', zone: { u0: 0, u1: 0.3, v0: 0, v1: 0.15 }, confiance: 0.6, vuLe: '2026-10-30' }]);
    // Sans descente retrouvee par la detection, aucune n'est ecrite.
    expect(facadeAEcrire(o, m, '2026-10-30', { ...accord, descentes: [] }, RUN)!.modenature!.descentesM).toBeUndefined();
    // Un releve neuf garde la modenature validee (elle dit le mur) ; l'etat disait l'ancienne photo, il part avec elle.
    const reecrit = releveReecrit({ batiment: { facades: [r] } }, r, { ...RELEVE, releveLe: '2026-11-02' });
    expect(reecrit.modenature).toEqual(r.modenature);
    expect(reecrit.etat).toBeUndefined();
  });

  it('les lignes de l ecran : ce qui est lu, le decroche a retoucher a la main, et l etat du mur en signal sans case', () => {
    const l = lignesFacadeEnrichie(RUN, { largeurM: 10, egoutM: 6 });
    expect(l.map((x) => x.texte)).toEqual([
      'Lu par Claude : menuiseries en bois, 1 couleur de menuiserie lue, garde-corps en fer forgé.',
      'Modénature lue : corniche, 1 bandeau, 1 descente, 1 store ; elle s’écrit avec la façade validée.',
      expect.stringMatching(/^Claude voit le mur avancer à u 0,7/),
      'Signalé par Claude, à vérifier : des traces d’humidité.',
    ]);
    expect(l[3]!.signal).toBe(true);
    expect(lignesFacadeEnrichie(null, { largeurM: 10, egoutM: 6 })).toEqual([]);
  });

  it('une lecture enrichie qui echoue : la facade est proposee sans ses champs, et un signal le dit', () => {
    const echec: RunEnregistre = { ...RUN, enrichie: { ...RUN.enrichie!, sorties: [], erreur: 'La lecture des détails (menuiseries, modénature…) n’a rendu aucune réponse lisible.' } };
    expect(lignesFacadeEnrichie(echec, { largeurM: 10, egoutM: 6 })).toEqual([
      { texte: 'La lecture des détails (menuiseries, modénature…) n’a rendu aucune réponse lisible. La façade est proposée sans les menuiseries, la modénature, les saillies ni l’état du mur.', signal: true },
    ]);
    // Un run d'avant le lot (sans lecture enrichie) ne dit rien.
    const avant: RunEnregistre = { ...RUN };
    delete avant.enrichie;
    expect(lignesFacadeEnrichie(avant, { largeurM: 10, egoutM: 6 })).toEqual([]);
  });
});
