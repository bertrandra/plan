import { afterEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { propositionsDeForme } from '../../../../../src/app/audit/parcelle/formeFacades.js';
import { cleMesure, type MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { appliquerPropositions, cocheeParDefaut } from '../../../../../src/regles/decisions.js';
import { diagnostiquerForme } from '../../../../../src/facade/regles/facades/diagnosticForme.js';
import { observationsDuRun } from '../../../../../src/facade/regles/facades/ia.js';
import { lireRunEnregistre } from '../../../../../src/regles/facades/observations.js';
import { reconstruireCorps, type Grille } from '../../../../../src/facade/toits/toitCorps.js';
import { toitMesureDepuisGrille } from '../../../../../src/model/toitMesure.js';
import { facadesDuContour } from '../../../../../src/geometry/cotesVusDeDehors.js';
import { essayerFaitsToits, lireFaitsToits } from '../../../../../src/regles/toits/faits.js';
import type { CorpsToit, ObjetPlan, PtBrut, ToitMesure } from '../../../../../src/model/types.js';

// Les propositions de toit de l'audit que fait le diagnostic de forme d'une facade (lot F4) : relues par le moteur des toits sur la
// mesure LiDAR (corpsSousContrainte), sur le corps que designe le mur, toujours decochees (decision 10), jamais contre le fait du
// batiment. AE 101 avec le LiDAR du 14 octobre au soir, sans ses faits : le corps principal n'a plus que le pignon ouest.

const soir = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101-lidar-soir.json', 'utf8')) as { contour: PtBrut[]; grille: Grille };
const mesure = toitMesureDepuisGrille(soir.grille as never, soir.contour) as ToitMesure;
const seul = reconstruireCorps(mesure, soir.contour, { grille: soir.grille }) as CorpsToit[];
const CLE = 'BATIMENT0000000322509182';
const maison = (extra: Record<string, unknown> = {}): ObjetPlan => ({ key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: soir.contour, elevation: 5, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, toitMesure: mesure, corpsToit: JSON.parse(JSON.stringify(seul)) }, ...extra }) as unknown as ObjetPlan;
const parcelle = { key: 'parcelle', name: 'p', type: 'polygon', fonction: 'terrain', pts: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }] } as unknown as ObjetPlan;
const sud = facadesDuContour(soir.contour, 0).find((f) => f.cote === 6)!;
const ia = observationsDuRun(lireRunEnregistre(JSON.parse(readFileSync('tests/fixtures/facades-ia/ae101-sud-synthetique.json', 'utf8')))!);
const diagnostic = diagnostiquerForme({ facade: sud, corps: seul, hauteurMur: 2.4, lue: null, ia });
const mesures = new Map<string, MesureFacade>([[cleMesure('maison', 6), { cle: 'maison', cote: 6, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, diagnostic }]]);
const proposer = (o: ObjetPlan) => { const capture = captureVide('78650000AE0101'); return propositionsDeForme({ objets: [parcelle, o], liste: listeDeControle([parcelle, o], capture), capture, mesures }); };

describe('les propositions de forme de l audit', () => {
  afterEach(() => essayerFaitsToits(null));

  it('une ligne par corps diagnostique, sur le corps principal, decochee, relue par le moteur ; l accepter pose le pignon est, rien d autre', () => {
    const o = maison();
    const [p, ...autres] = proposer(o);
    expect(autres).toEqual([]);
    expect(p).toMatchObject({ id: 'maison:forme:6:0:2', cible: { type: 'batiment', cle: 'maison' }, source: 'mesure', effet: { type: 'corpsDuToit', corps: 0 } });
    expect(p!.objet).toBe('Toit de maison, corps 1 (vu sur la façade sud (côté 7))');
    expect(p!.avant).toMatch(/^1 pignon \(de 7,5 à 9,91 m le long du faîtage\)/);
    expect(p!.apres).toMatch(/^un pignon de plus \(pignons de .* et de 7,5 à 9,91 m le long du faîtage\), d’après Claude seul/);
    expect(p!.reserve).toMatch(/^Une forme de toit lue sur la photo se confirme toujours/);
    expect(cocheeParDefaut(p!)).toBe(false);
    const avant = JSON.parse(JSON.stringify(o.batiment!.corpsToit)) as CorpsToit[];
    appliquerPropositions([o], [p!], [], '2026-10-29');
    const apres = o.batiment!.corpsToit!;
    expect(apres.slice(1)).toEqual(avant.slice(1));
    expect({ ...apres[0], pignons: [] }).toEqual({ ...avant[0], pignons: [] });
    expect(apres[0]!.pignons.filter((x) => x.pan === 1)).toHaveLength(2);
    // Le toit en a deja deux : plus rien a proposer (la boucle ne tourne qu'une fois).
    expect(proposer(o)).toEqual([]);
  });

  it('un toit fige a la main : la ligne dit ce qu elle remplacerait (§5 bis, regle 3)', () => {
    const o = maison();
    (o.batiment as { toitFige?: boolean }).toitFige = true;
    expect(proposer(o)[0]?.remplaceChoix).toBe('forme du toit saisie');
  });

  it('les pointes que Claude lit sur la bande au-dessus de l egout completent le diagnostic de l audit (lot F7) : sans run, rien ; avec, le pignon est', () => {
    const run = lireRunEnregistre(JSON.parse(readFileSync('tests/fixtures/facades-ia/ae101-sud-synthetique.json', 'utf8')))!;
    const sansClaude = diagnostiquerForme({ facade: sud, corps: seul, hauteurMur: 2.4, lue: null });
    const m = new Map<string, MesureFacade>([[cleMesure('maison', 6), { cle: 'maison', cote: 6, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, hautLu: null, diagnostic: sansClaude }]]);
    const o = maison(), capture = captureVide('78650000AE0101');
    const e = { objets: [parcelle, o], liste: listeDeControle([parcelle, o], capture), capture, mesures: m };
    expect(propositionsDeForme(e)).toEqual([]);
    const [p] = propositionsDeForme({ ...e, runs: { 'maison#6': run } });
    expect(p).toMatchObject({ id: 'maison:forme:6:0:2', effet: { type: 'corpsDuToit', corps: 0 } });
    expect(p!.apres).toMatch(/^un pignon de plus .*, d’après Claude seul/);
  });

  it('le fait du batiment l emporte : en remplacement, rien ne se propose', () => {
    essayerFaitsToits(lireFaitsToits({ format: 'plan-faits-toits', version: 1, faits: { [CLE]: { observation: { forme: 'deux-pans' }, application: 'remplacement', dimensions: { egoutM: 5, faitageM: 8 } } } }));
    expect(proposer(maison({ bdtopo: { cleabs: CLE } }))).toEqual([]);
  });
});
