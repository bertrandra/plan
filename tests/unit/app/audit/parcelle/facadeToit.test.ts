import { describe, it, expect } from 'vitest';
import { propositionsDeForme } from '../../../../../src/app/audit/parcelle/formeFacades.js';
import { lignesToitDeLaFacade } from '../../../../../src/app/audit/parcelle/facadeToit.js';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { votesDesBatiments } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import { cleMesure, type MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { appliquerPropositions, cocheeParDefaut } from '../../../../../src/regles/decisions.js';
import { diagnostiquerForme } from '../../../../../src/facade/regles/facades/diagnosticForme.js';
import { facadesDuContour } from '../../../../../src/geometry/cotesVusDeDehors.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { RunEnregistre } from '../../../../../src/regles/facades/observations.js';
import type { CorpsToit, ObjetBrut, ObjetPlan, PtBrut, ToitMesure } from '../../../../../src/model/types.js';

// Le toit lu sur une facade dans l'audit (lot L2 de MD/spec-lecture-ia-elargie.md §5.1) : une fenetre de toit posee sur le bon pan du
// bon corps par le moteur, decochee ; le faitage et la gouttiere aux bords du corps ; le debord lu ne change rien (une alerte) ; la
// couverture lue sur la facade l'emporte sur celle de l'analyse d'une maison (la plus proche) ; un echec du toit lu laisse le reste.

const p = (x: number, y: number): PtBrut => ({ x, y });
const PTS = [p(0, 0), p(10, 0), p(10, 8), p(0, 8)];
const CORPS: CorpsToit = { pts: PTS, posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0 };
const MESURE = { pts: [], hauteurs: [], egoutM: 6 } as unknown as ToitMesure;
const sud = facadesDuContour(PTS, 6).find((f) => f.cote === 0)!;
const maison = (): ObjetPlan => ({
  key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: PTS, elevation: 6,
  batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, toitMesure: MESURE, corpsToit: [structuredClone(CORPS)] },
}) as unknown as ObjetPlan;
const parcelle = { key: 'parcelle', name: 'p', type: 'polygon', fonction: 'terrain', pts: [p(-50, -50), p(50, -50), p(50, 50), p(-50, 50)] } as unknown as ObjetPlan;

const SORTIE = {
  calage: { angles: {}, pointes: [], appentis: [], corps: [], cache: [] }, forme: { silhouette: 'ligne-droite', bout: 'sans-objet' }, elements: [],
  surface: { principale: 'enduit', zones: [], confiance: 'forte' }, ouvertures: [], confiance: 'forte',
};
/** Le toit lu : une ardoise en ecaille, un fort debord, un faitage en zinc, une gouttiere pendante, une fenetre de toit a mi-pan. */
const TOIT = { toit: { couverture: 'ardoise', pose: 'ecaille', debord: 'fort', faitage: 'zinc', gouttiere: 'pendante', confiance: 'forte' }, elements: [{ element: 'fenetre-toit', u0: 0.6, u1: 0.68, v: 1.25, confiance: 'forte' }] };
const lecture = (sorties: unknown[], erreur?: string) => ({ le: '2026-10-30T10:00:00Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, passes: 3 as const, sorties, cout: 0.002, tokens: { entree: 9000, sortie: 600 }, ...(erreur ? { erreur } : {}) });
const run = (toit = lecture([TOIT, TOIT, TOIT])): RunEnregistre => ({
  le: '2026-10-30T10:00:00Z', modele: 'claude-haiku-5-5', prompt: 2, schema: 2, passes: 3, sorties: [SORTIE, SORTIE, SORTIE], cout: 0.004, tokens: { entree: 9000, sortie: 2000 }, image: { largeur: 1024, hauteur: 700 }, chaine: 1, toit,
});

const proposer = (o: ObjetPlan, r: RunEnregistre = run()) => {
  const objets = [parcelle, o];
  const diagnostic = diagnostiquerForme({ facade: sud, corps: o.batiment!.corpsToit!, hauteurMur: 6, lue: null });
  const mesures = new Map<string, MesureFacade>([[cleMesure('maison', 0), { cle: 'maison', cote: 0, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, diagnostic }]]);
  const capture = captureVide('78650000AE0101');
  return propositionsDeForme({ objets, liste: listeDeControle(objets, capture), capture, mesures, runs: { [cleMesure('maison', 0)]: r } });
};

describe('le toit lu sur une facade (lot L2)', () => {
  it('une fenetre de toit posee par le moteur sur le pan de ce mur, decochee ; le faitage et la gouttiere aux bords du corps', () => {
    const o = maison();
    const ps = proposer(o);
    expect(ps.map((x) => [x.effet.type, cocheeParDefaut(x)])).toEqual([['elementsToitDuToit', false], ['bordsDuToit', false]]);
    const fenetre = ps[0]!;
    expect(fenetre.apres).toMatch(/posée par le moteur des toits sur ce pan/);
    if (fenetre.effet.type !== 'elementsToitDuToit') throw new Error('effet');
    // Le pan du mur sud (cote pts[0]-pts[1]), a mi-pente : la hauteur lue (1,25 fois l'egout de 6 m) est a mi-chemin de l'egout au faitage.
    expect(fenetre.effet).toMatchObject({ corps: 0, elements: [{ type: 'fenetre-toit', pan: 0, dM: 2 }] });
    expect(fenetre.effet.elements[0]!.sM).toBeCloseTo(sud.gauche.x === 0 ? 6.4 : 3.6, 1);
    appliquerPropositions([parcelle, o], ps, [], '2026-10-30');
    const c = o.batiment!.corpsToit![0]!;
    expect(c.elementsToit).toHaveLength(1);
    expect(c.bords).toEqual({ faitage: 'zinc', gouttiere: 'pendante' });
    // Le debord lu (fort) ne change pas celui du toit : seule une alerte le dit.
    expect(c.bords?.debordEgoutM).toBeUndefined();
    expect({ ...c, elementsToit: undefined, bords: undefined }).toEqual({ ...CORPS, elementsToit: undefined, bords: undefined });
    expect(o.batiment!.toitFige).toBe(true);
    // Rejouee sur le toit qui la porte, la meme lecture ne repose rien.
    expect(proposer(o).filter((x) => x.effet.type === 'elementsToitDuToit')).toEqual([]);
  });

  it('le debord lu se dit, sans case ; un echec du toit lu laisse le run et dit pourquoi', () => {
    const lignes = lignesToitDeLaFacade(run(), [maison()], 'maison', 0);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toEqual({ texte: 'Toit lu par Claude : couverture : ardoise en écaille, faîtage en zinc, gouttière pendante, 1 élément sur le pan (fenêtre de toit ou panneau).' });
    expect(lignes[1]).toMatchObject({ texte: expect.stringMatching(/^Claude voit un fort débord sur cette façade ; le toit garde le sien \(0,35 m, celui du dessin\)/), signal: true });
    const rate = run(lecture([], 'La lecture du toit (couverture, fenêtres de toit…) n’a rendu aucune réponse lisible.'));
    expect(lignesToitDeLaFacade(rate, [maison()], 'maison', 0)).toEqual([{ texte: expect.stringMatching(/^La lecture du toit .* sans ce qu’elle montre du toit/), signal: true }]);
    expect(proposer(maison(), rate)).toEqual([]);
  });

  it('une couverture lue sur la facade et par l analyse d une maison : la plus proche (la facade) l emporte', () => {
    const objets = normalizeObjects([
      { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: [p(-20, -20), p(30, -20), p(30, 30), p(-20, 30)], cadastre: { idu: '78650000AE0101' } },
      { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: PTS, elevation: 6, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 } } },
    ] as ObjetBrut[]) as ObjetPlan[];
    const capture = creerCapture('78650000AE0101', () => new Date('2026-10-30T09:00:00Z')).lire();
    const liste = listeDeControle(objets, capture);
    const cote = liste.batiments[0]!.facades[0]!.cote;
    const votes = votesDesBatiments({ maison: { reponses: [0, 1, 2].map(() => reponse({ couverture: { indices: [{ image: 1, vu: 'tuiles' }], valeur: 'tuile-plate' } })), etiquettes: [] } });
    const e = { objets, liste, capture, mesures: new Map() };
    const sansFacade = propositionsArbitrees(e, votes).find((x) => x.id === 'maison:couverture');
    expect(sansFacade?.effet).toEqual({ type: 'couverture', couverture: 'tuile-plate' });
    const avec = propositionsArbitrees({ ...e, runs: { [cleMesure('maison', cote)]: run() } }, votes).find((x) => x.id === 'maison:couverture');
    expect(avec?.effet).toEqual({ type: 'couverture', couverture: 'ardoise', pose: 'ecaille' });
    expect(avec?.apres).toMatch(/^Ardoise en écaille/);
    // La facade passe devant (regle prioritaire) ; vue par Claude, elle ne decide pas seule : la personne coche.
    expect(avec?.arbitrages?.[0]).toMatchObject({ attribut: 'couverture', decision: 'manuelle' });
    expect(avec?.arbitrages?.[0]?.raison).toMatch(/^Photo de façade seul ne décide pas/);
    expect(cocheeParDefaut(avec!)).toBe(false);
  });
});
