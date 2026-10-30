import { describe, it, expect } from 'vitest';
import { lireObservationsFacade, type ObservationsFacade } from '../../../../../src/regles/facades/observations.js';
import { escaladerObservations, observationsDuRun, ouvertureDeLIa, reglagesIa, voterObservations } from '../../../../../src/facade/regles/facades/ia.js';
import { detailsDeLIa, direDetailsLus } from '../../../../../src/facade/regles/facades/menuiseries.js';
import { appendicesDeLIa, descentesRetrouvees, direModenature, equipementsLus, modenatureDeLIa } from '../../../../../src/facade/regles/facades/modenature.js';
import { direEtat, etatDeLIa } from '../../../../../src/facade/regles/facades/etat.js';
import { constatsDecroches, direSaillie, sailliesProposees } from '../../../../../src/facade/regles/facades/saillies.js';
import { diagnostiquerForme } from '../../../../../src/facade/regles/facades/diagnosticForme.js';
import { corpsSousContrainte } from '../../../../../src/facade/regles/toits/faits.js';
import { facadesDuContour, type Facade } from '../../../../../src/geometry/cotesVusDeDehors.js';
import { PALETTE_FACADES, couleurDuMot, lirePalette } from '../../../../../src/regles/facades/palette.js';
import type { CartesAretes } from '../../../../../src/facade/detection/recalageIa.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../../../src/model/types.js';

// La facade enrichie (lot L1 de MD/spec-lecture-ia-elargie.md) : ce que le run d'une facade lit de plus que ses ouvertures, le vote
// de trois passes, l'escalade, et les regles qui en font des decisions (des details, une modenature, des saillies, un signal).

const baie = (extra: Record<string, unknown> = {}) => ({
  type: 'fenetre', u0: 0.3, u1: 0.42, v0: 0.6, v1: 0.85, niveau: 1, travee: 0, confiance: 'forte',
  details: { volets: 'battants', allege: 'indetermine', forme: 'rect', menuiserie: { materiau: 'bois', couleur: 'vert' }, couleurVolets: 'bleu', gardeCorps: { type: 'fer-forge', haut: 0.78, couleur: 'noir' }, ...extra },
  carreaux: { vantaux: 2, colonnes: 1, rangees: 3, petitsBois: 'fins', imposte: 'aucune', vitrage: 'clair' },
});
/** Une passe du run, telle que le serveur la rend (ramenee au schema), avec les champs du lot L1. */
const passe = (d: Record<string, unknown> = {}, reste: Record<string, unknown> = {}): ObservationsFacade => lireObservationsFacade({
  calage: { angles: {}, pointes: [], appentis: [], corps: [], cache: [] }, forme: { silhouette: 'ligne-droite', bout: 'sans-objet' }, elements: [],
  surface: { principale: 'enduit', zones: [], confiance: 'forte' }, ouvertures: [baie(d)],
  saillies: [{ genre: 'bow-window', u0: 0.1, u1: 0.3, forme: 'pans', niveau: 'rdc', toit: 'pan', haut: 0.45, couverture: 'sans-objet', confiance: 'moyenne' }],
  decroches: [{ u: 0.7, sens: 'recul', confiance: 'moyenne' }],
  modenature: { egout: 'genoise', rangsGenoise: 2, bandeaux: [0.5], chaines: 'pierre', encadrements: 'enduit', soubassement: { haut: 0.1, parement: 'pierre' }, descentes: [0.98] },
  appendices: [{ nature: 'store', u0: 0.5, u1: 0.7, v0: 0.4, v1: 0.48, marches: 'indetermine', confiance: 'moyenne' }, { nature: 'perron', u0: 0.45, u1: 0.55, v0: 0, v1: 0.06, marches: 3, confiance: 'forte' }],
  etat: [{ nature: 'fissure', u0: 0.8, u1: 0.82, v0: 0.2, v1: 0.5, confiance: 'moyenne' }],
  confiance: 'forte', ...reste,
})!;

describe('la lecture des champs du lot L1', () => {
  it('lit les details, les saillies, la modenature, les appendices et l etat ; une reponse d avant le lot n en a aucun', () => {
    const o = passe();
    expect(o.ouvertures[0]!.lus).toEqual({ menuiserie: { materiau: 'bois', couleur: 'vert' }, couleurVolets: 'bleu', gardeCorps: { type: 'fer-forge', haut: 0.78, couleur: 'noir' } });
    expect(o.saillies).toHaveLength(1);
    expect(o.modenature).toMatchObject({ egout: 'genoise', bandeaux: [0.5], soubassement: { haut: 0.1, parement: 'pierre' } });
    expect(o.appendices.map((a) => a.nature)).toEqual(['store', 'perron']);
    const ancienne = lireObservationsFacade({ calage: {}, ouvertures: [{ type: 'fenetre', u0: 0.1, u1: 0.2, v0: 0.3, v1: 0.6, details: { volets: 'aucun' } }] })!;
    expect(ancienne.ouvertures[0]!.lus).toBeUndefined();
    expect([ancienne.saillies, ancienne.decroches, ancienne.appendices, ancienne.etat, ancienne.modenature]).toEqual([[], [], [], [], null]);
  });

  it('un mot hors de la palette est indetermine, une hauteur de pixels est ecartee', () => {
    const o = passe({ menuiserie: { materiau: 'zinc', couleur: 'fuchsia' }, gardeCorps: { type: 'fer-forge', haut: 312, couleur: 'noir' } });
    expect(o.ouvertures[0]!.lus).toMatchObject({ menuiserie: { materiau: null, couleur: null }, gardeCorps: { haut: null } });
  });
});

describe('le vote de trois passes et l escalade', () => {
  it('une couleur dite par deux passes sur trois est retenue ; sans majorite, indeterminee', () => {
    const v = voterObservations([passe(), passe(), passe({ menuiserie: { materiau: 'pvc', couleur: 'blanc' } })])!;
    expect(v.ouvertures[0]!.lus!.menuiserie).toEqual({ materiau: 'bois', couleur: 'vert' });
    const w = voterObservations([passe(), passe({ menuiserie: { materiau: 'pvc', couleur: 'blanc' } }), passe({ menuiserie: { materiau: 'alu', couleur: 'noir' } })])!;
    expect(w.ouvertures[0]!.lus!.menuiserie).toEqual({ materiau: null, couleur: null });
  });

  it('une saillie, un store ou une fissure vus par une seule passe ne sont pas gardes ; la mediane des positions', () => {
    const seule = passe({}, { saillies: [], appendices: [], etat: [] });
    const v = voterObservations([passe(), seule, seule])!;
    expect([v.saillies, v.appendices, v.etat]).toEqual([[], [], []]);
    const decale = passe({}, { saillies: [{ genre: 'bow-window', u0: 0.12, u1: 0.32, forme: 'pans', niveau: 'rdc', toit: 'pan', haut: 0.5, couverture: 'sans-objet', confiance: 'forte' }] });
    const m = voterObservations([passe(), decale, passe()])!;
    expect(m.saillies).toHaveLength(1);
    expect(m.saillies[0]).toMatchObject({ u0: 0.1, u1: 0.3, haut: 0.45 });
    expect(m.modenature).toMatchObject({ egout: 'genoise', rangsGenoise: 2, bandeaux: [0.5], chaines: 'pierre' });
  });

  it('l escalade l emporte la ou elle dit autre chose, et le dit', () => {
    const vote = voterObservations([passe(), passe(), passe()])!;
    const e = escaladerObservations(vote, passe({ menuiserie: { materiau: 'alu', couleur: 'gris-anthracite' } }, { modenature: { egout: 'corniche', rangsGenoise: 'indetermine', bandeaux: [0.5], chaines: 'pierre', encadrements: 'enduit', soubassement: { haut: 0.1, parement: 'pierre' }, descentes: [0.98] } }), 'claude-sonnet-5-5');
    expect(e.ouvertures[0]!.lus!.menuiserie).toEqual({ materiau: 'alu', couleur: 'gris-anthracite' });
    expect(e.modenature!.egout).toBe('corniche');
    // Un mot que l'escalade ne dit pas (indetermine) ne contredit rien : la genoise avait deux rangs, l'escalade ne le dit pas.
    expect(e.modenature!.rangsGenoise).toBe(2);
    expect(e.escalade!.tranche).toEqual(expect.arrayContaining(['les détails d’une baie', 'la modénature']));
  });
});

describe('la palette des facades (regles/facades/reglages.json)', () => {
  it('traduit un mot en couleur, refuse une couleur mal ecrite, garde la couleur des volets d avant', () => {
    expect(couleurDuMot('gris-anthracite')).toBe('#3b3f42');
    expect(couleurDuMot('fuchsia')).toBeNull();
    expect(PALETTE_FACADES.bleu).toBe('#5B7A99');
    expect(() => lirePalette({ palette: { couleurs: { rouge: 'rouge' } } })).toThrow(/hexadécimal/);
  });
});

describe('les regles des menuiseries', () => {
  it('une baie d etage : menuiserie, volets et garde-corps traduits, la hauteur du garde-corps calee sur l egout', () => {
    const o = passe().ouvertures[0]!;
    const d = detailsDeLIa(o.lus, { y: 0.6 * 6 }, 6);
    expect(d).toEqual({ menuiserie: { materiau: 'bois', couleur: PALETTE_FACADES.vert!.toLowerCase(), source: 'ia' }, couleurVolets: PALETTE_FACADES.bleu!.toLowerCase(), gardeCorps: { type: 'fer-forge', hauteurM: 1.08, couleur: '#2e3033', source: 'ia' }, allege: 'garde-corps' });
    // La baie et ses details en metres, par l'ouverture de Claude.
    expect(ouvertureDeLIa(o, 10, 6).details).toMatchObject({ volets: 'battants', gardeCorps: { type: 'fer-forge' }, carreaux: { vantaux: 2 } });
    expect(direDetailsLus([d])).toBe('menuiseries en bois, 1 couleur de menuiserie lue, garde-corps en fer forgé');
  });

  it('une baie au sol n a pas de garde-corps ; une hauteur invraisemblable est omise, le type reste ; une allege dite reste', () => {
    const o = passe().ouvertures[0]!;
    expect(detailsDeLIa(o.lus, { y: 0 }, 6).gardeCorps).toBeUndefined();
    const haut = detailsDeLIa({ ...o.lus!, gardeCorps: { type: 'verre', haut: 1.2, couleur: null } }, { y: 3 }, 6);
    expect(haut.gardeCorps).toEqual({ type: 'verre', source: 'ia' });
    expect(detailsDeLIa(o.lus, { y: 3 }, 6, 'balcon').allege).toBeUndefined();
    expect(detailsDeLIa(undefined, { y: 3 }, 6)).toEqual({});
  });
});

describe('les regles de la modenature et de l etat', () => {
  it('les parts deviennent des metres ; une descente n est retenue que si la detection la retrouve', () => {
    const o = passe();
    const m = modenatureDeLIa(o, { largeurM: 10, egoutM: 6 }, null);
    expect(m).toEqual({ egout: 'genoise', rangsGenoise: 2, bandeauxM: [3], chaines: 'pierre', encadrements: 'enduit', soubassement: { hauteurM: 0.6, parement: 'pierre' }, source: 'ia' });
    expect(modenatureDeLIa(o, { largeurM: 10, egoutM: 6 }, [0.98])!.descentesM).toEqual([9.8]);
    expect(direModenature(m, 1)).toBe('génoise à 2 rangs, 1 bandeau, chaînes d’angle en pierre, encadrements en enduit, soubassement de 0,6 m, 1 store');
  });

  it('la regle des descentes : une verticale soutenue par les aretes a sa place', () => {
    // Une carte de 100 x 60 pixels (10 x 6 m) : une arete verticale franche a x = 9,8 m.
    const l = 100, h = 60;
    const gx = new Float32Array(l * h);
    for (let y = 0; y < h; y++) gx[y * l + 98] = 40;
    const C: CartesAretes = { l, h, pxParM: 10, gx, gy: new Float32Array(l * h), seuil: 10 };
    expect(descentesRetrouvees([0.98, 0.5], C, 10)).toEqual([0.98]);
    expect(descentesRetrouvees([0.98], null, 10)).toEqual([]);
  });

  it('le store va au mur, le perron est un equipement ; l etat est un signal date', () => {
    const o = passe();
    expect(appendicesDeLIa(o, { largeurM: 10, egoutM: 6 })).toEqual([{ nature: 'store', xM: 5, largeurM: 2, hauteurM: 2.88, source: 'ia' }]);
    expect(equipementsLus(o).map((a) => [a.nature, a.marches])).toEqual([['perron', 3]]);
    const etat = etatDeLIa(o, '2026-10-30');
    expect(etat).toEqual([{ nature: 'fissure', zone: { u0: 0.8, u1: 0.82, v0: 0.2, v1: 0.5 }, confiance: 0.6, vuLe: '2026-10-30' }]);
    expect(direEtat(etat)).toBe('Signalé par Claude, à vérifier : une fissure.');
    expect(direEtat([])).toBeNull();
  });
});

const p = (x: number, y: number): PtBrut => ({ x, y });
const corps = (pts: PtBrut[], posFaitage: number, faitage: number, egouts: [number, number]): CorpsToit => ({ pts, posFaitage, faitage, egouts, pignons: [], ecart: 0 }) as CorpsToit;
// Une maison de 10 m de facade au sud, faitage est-ouest : la facade sud est un long pan.
const maison = corps([p(0, 0), p(10, 0), p(10, 8), p(0, 8)], 4, 9, [6, 6]);
const contour = [p(0, 0), p(10, 0), p(10, 8), p(0, 8)];
const sud = (): Facade => facadesDuContour(contour, 6).find((f) => f.normale.y < -0.99)!;
const mesure = { grille: { x0: 0, y0: 0, pas: 0.5, nx: 1, ny: 1, z: [6] } } as unknown as ToitMesure;

describe('les saillies, posees par le moteur des toits', () => {
  it('une saillie dans le troncon d un corps est adressee a son mur ; le moteur la pose apres les corps d avant', () => {
    const f = sud();
    const d = diagnostiquerForme({ facade: f, corps: [maison], hauteurMur: 6, lue: null });
    const constats: string[] = [];
    const [prop] = sailliesProposees(passe(), d.troncons, f, 6, constats);
    expect(prop).toBeDefined();
    expect(prop!.observation.sailliesDesMurs[0]).toMatchObject({ genre: 'bow-window', de: 1, a: 3, hauteurM: 2.7 });
    const relus = corpsSousContrainte({ observation: prop!.observation, application: 'contrainte' }, [maison], mesure, contour)!;
    expect(relus).toHaveLength(2);
    expect(relus[0]).toEqual(maison);
    expect(relus[1]!.saillie).toMatchObject({ genre: 'bow-window', hote: 0, largeurM: 2, profondeurM: 0.8, hauteurM: 2.7 });
    // Deja posee : le moteur ne la pose pas une seconde fois.
    expect(corpsSousContrainte({ observation: prop!.observation, application: 'contrainte' }, relus, mesure, contour)).toHaveLength(2);
    expect(direSaillie(prop!)).toBe('un bow-window de 2 m, à 2,7 m du sol, 0,8 m de profondeur par défaut (une vue de face ne la montre pas)');
  });

  it('un auvent tient sur ses consoles : ouvert, presque plat, sa couverture gardee', () => {
    const f = sud();
    const d = diagnostiquerForme({ facade: f, corps: [maison], hauteurMur: 6, lue: null });
    const o = passe({}, { saillies: [{ genre: 'auvent', u0: 0.4, u1: 0.6, forme: 'rectangle', niveau: 'rdc', toit: 'pan', haut: 'indetermine', couverture: 'verre', confiance: 'forte' }] });
    const [prop] = sailliesProposees(o, d.troncons, f, 6, []);
    const relus = corpsSousContrainte({ observation: prop!.observation, application: 'contrainte' }, [maison], mesure, contour)!;
    const a = relus[1]!;
    expect(a.saillie).toMatchObject({ genre: 'auvent', couverture: 'verre', hauteurM: 2.5, profondeurM: 0.9 });
    expect(a.ouvert).toBe(true);
    expect(a.faitage - a.egouts[0]).toBeLessThanOrEqual(0.21);
  });

  it('une saillie hors des corps n est pas proposee ; un decroche est dit, jamais propose', () => {
    const f = sud();
    const constats: string[] = [];
    expect(sailliesProposees(passe(), [], f, 6, constats)).toEqual([]);
    expect(constats[0]).toMatch(/rien n’est proposé/);
    expect(constatsDecroches(passe())[0]).toMatch(/reculer à u 0,7.*retouchez le contour à la main/);
  });
});

describe('un run enregistre d avant le lot L1', () => {
  it('se relit sans aucun champ nouveau : rien a proposer, rien a ecrire', () => {
    const run = { le: '2026-10-29T10:00:00Z', modele: 'claude-haiku-5-5', prompt: 2, schema: 2, passes: 1 as const, sorties: [{ calage: {}, ouvertures: [] }], cout: null, tokens: { entree: 0, sortie: 0 }, image: { largeur: 1, hauteur: 1 }, chaine: 1 };
    const o = observationsDuRun(run, reglagesIa())!;
    expect(modenatureDeLIa(o, { largeurM: 10, egoutM: 6 }, null)).toBeNull();
    expect([appendicesDeLIa(o, { largeurM: 10, egoutM: 6 }), etatDeLIa(o, 'x'), equipementsLus(o), constatsDecroches(o)]).toEqual([[], [], [], []]);
  });
});
