import { describe, it, expect } from 'vitest';
import {
  abscisseDuPortail, appliquerPropositions, avecReserveSurPlace, RESERVE_NOTE_SUR_PLACE, rivalesSurPlace, cocheeParDefaut, jourIso, projetApres, releveALaHauteur, type Proposition, type EffetProposition,
} from '../../../src/regles/decisions.js';
import { couleurMursRetenue, textureDesMurs } from '../../../src/model/couleurMur.js';
import { clotureDImport, clotureDe } from '../../../src/model/cloture.js';
import type { CorpsToit, ObjetPlan, PtBrut, ReleveFacade } from '../../../src/model/types.js';
import { champsBatiment } from '../../../src/model/champsFonction.js';
import { versMemoire } from '../../../src/model/champsFonction.js';

// Les propositions d'un audit de la parcelle (MD/spec-audit.md §14) : quelles cases arrivent cochees,
// et ce que chaque effet ecrit sur le projet, sans rien toucher d'autre.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan> | Record<string, unknown>): ObjetPlan => versMemoire({ key, name: key, type: 'polygon', ...plus }) as ObjetPlan;

const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const RELEVE: ReleveFacade = {
  cote: 0, largeur: 10, hauteur: 5, texture: 'data:image/jpeg;base64,AA', hauteurTexture: 6, distance: 8, sourceDistance: 'gps', releveLe: '2026-10-13T09:00:00Z',
  ouvertures: [{ type: 'fenetre', x: 1, y: 1, l: 1.2, h: 1.5 }], partieBasse: null,
};

function proposition(id: string, effet: EffetProposition, plus: Partial<Proposition> = {}): Proposition {
  const cible: Proposition['cible'] = effet.type === 'cloture' || effet.type === 'portail' ? { type: 'parcelle' } : { type: 'batiment', cle: 'maison' };
  return { id, cible, objet: id, avant: '', apres: '', source: 'mesure', indices: [], confiance: null, remplaceChoix: null, reserve: null, effet, ...plus };
}

function projet(): ObjetPlan[] {
  return [
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cloture: clotureDImport(rect(0, 0, 20, 30), 0) }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS] },  }),
  ];
}

describe('les cases a leur arrivee', () => {
  it('coche une mesure, decoche ce qui remplace un choix ou manque de confiance', () => {
    const e: EffetProposition = { type: 'hauteur', hauteurM: 5.8 };
    expect(cocheeParDefaut(proposition('a', e))).toBe(true);
    expect(cocheeParDefaut(proposition('a', e, { remplaceChoix: 'brique rouge' }))).toBe(false);
    expect(cocheeParDefaut(proposition('a', e, { reserve: 'coins prédits' }))).toBe(false);
    expect(cocheeParDefaut(proposition('a', e, { confiance: 0.4 }))).toBe(false);
    expect(cocheeParDefaut(proposition('a', e, { confiance: 0.7 }))).toBe(true);
  });

  it('demande 95 % d accord a Claude seul (spec-regles-toits §14.2)', () => {
    const e: EffetProposition = { type: 'couverture', couverture: 'ardoise' };
    expect(cocheeParDefaut(proposition('a', e, { source: 'claude', confiance: 0.9 }))).toBe(false);
    expect(cocheeParDefaut(proposition('a', e, { source: 'claude', confiance: 0.97 }))).toBe(true);
  });
});

describe('ce que les propositions ecrivent', () => {
  it('ramene un releve a la hauteur du batiment, ouvertures comprises', () => {
    const r = releveALaHauteur(RELEVE, 6);
    expect(r.hauteur).toBe(6);
    expect(r.hauteurTexture).toBeCloseTo(7.2, 5);
    expect(r.ouvertures[0]).toMatchObject({ x: 1, l: 1.2, y: 1.2, h: 1.8 });
  });

  it('ecrit la hauteur d abord, puis le releve a cette hauteur', () => {
    const objets = projet();
    const touches = appliquerPropositions(objets, [
      proposition('releve', { type: 'releve', releve: RELEVE }, { cible: { type: 'facade', cle: 'maison', cote: 0 } }),
      proposition('hauteur', { type: 'hauteur', hauteurM: 5 }),
    ], [], '2026-10-13');
    const m = objets[1] as ObjetPlan;
    expect(touches).toEqual(['maison']);
    expect(m.elevation).toBe(5);
    expect(m.batiment?.facades?.[0]).toMatchObject({ cote: 0, hauteur: 5, ouvertures: [{ y: 1, h: 1.5 }] });
  });

  it('pose la couleur vue sur place, qui passe avant la photo de rue et le choix de source', () => {
    const objets = projet();
    const m = objets[1] as ObjetPlan;
    champsBatiment(m).couleurMurs = { photo: { couleur: '#AAAAAA', id: 'p', date: null, auteur: null, licence: null }, source: 'plan' };
    appliquerPropositions(objets, [proposition('c', { type: 'couleurMurs', couleur: '#c9b49a' })], [], '2026-10-13');
    expect(m.batiment?.couleurMurs).toEqual({ photo: { couleur: '#AAAAAA', id: 'p', date: null, auteur: null, licence: null }, terrain: { couleur: '#c9b49a', date: '2026-10-13' } });
    expect(couleurMursRetenue(m)).toEqual({ couleur: '#c9b49a', source: 'photo' });
  });

  it('pose le materiau des murs vu, et la couverture vue', () => {
    const objets = projet();
    const m = objets[1] as ObjetPlan;
    appliquerPropositions(objets, [proposition('m', { type: 'materiauMurs', materiau: 'brique' }), proposition('t', { type: 'couverture', couverture: 'ardoise' })], [], '2026-10-13');
    expect(textureDesMurs(m)).toBe('brique');
    expect(couleurMursRetenue(m)?.source).toBe('materiau');
    expect(m.batiment?.toit?.couverture).toBe('ardoise');
  });

  it('remplace les cheminees d une observation precedente, garde les autres', () => {
    const objets = projet();
    const m = objets[1] as ObjetPlan;
    const vieille = { x: 6, y: 14, largeurM: 0.5, profondeurM: 0.5, sommetM: 9.4, position: 'pan' as const, source: 'observation' as const };
    const lidar = { ...vieille, x: 7, source: 'lidar' as const };
    champsBatiment(m).corpsToit = [{ ...CORPS, cheminees: [vieille, lidar] }];
    const neuve = { ...vieille, x: 10, position: 'faitage' as const };
    appliquerPropositions(objets, [proposition('ch', { type: 'cheminees', corps: 0, cheminees: [neuve] })], [], '2026-10-13');
    expect(m.batiment?.corpsToit?.[0]?.cheminees).toEqual([lidar, neuve]);
  });

  it('decrit la toiture-terrasse du corps', () => {
    const objets = projet();
    const m = objets[1] as ObjetPlan;
    appliquerPropositions(objets, [proposition('te', { type: 'terrasse', corps: 0, terrasse: { accessible: true, acrotereM: 1, source: 'observation' } })], [], '2026-10-13');
    expect(m.batiment?.corpsToit?.[0]?.terrasse).toEqual({ accessible: true, acrotereM: 1, source: 'observation' });
  });

  it('regle la cloture du cote sur rue et son portail', () => {
    const objets = projet();
    const p = objets[0] as ObjetPlan;
    appliquerPropositions(objets, [
      proposition('cl', { type: 'cloture', cote: 0, typeCloture: 'mur', hauteurM: 1.6 }),
      proposition('po', { type: 'portail', cote: 0, nature: 'portail', position: 'gauche', largeurM: 3 }),
    ], [], '2026-10-13');
    const cl = clotureDe(p);
    expect(cl.cotes.find((c) => c.cote === 0)).toMatchObject({ type: 'mur', hauteur: 1.6, limite: 'rue' });
    expect(cl.portails.filter((a) => a.cote === 0)).toEqual([expect.objectContaining({ nature: 'portail', largeur: 3, x: 0.5 })]);
    expect(p.clotureActive).toBe(true);
  });

  it('retire les acces du cote quand on n a vu aucun portail', () => {
    const objets = projet();
    appliquerPropositions(objets, [proposition('po', { type: 'portail', cote: 0, nature: 'aucun' })], [], '2026-10-13');
    expect(clotureDe(objets[0] as ObjetPlan).portails.filter((a) => a.cote === 0)).toEqual([]);
  });

  it('marque les batiments verifies sur place, avec la date', () => {
    const objets = projet();
    expect(appliquerPropositions(objets, [], ['maison'], '2026-10-13')).toEqual(['maison']);
    expect((objets[1] as ObjetPlan).batiment?.verifieSurPlace).toEqual({ date: '2026-10-13' });
  });

  it('ne modifie rien en place sur un batiment : une copie de surface suffit a l apercu', () => {
    const objets = projet();
    const original = objets[1] as ObjetPlan;
    const avant = JSON.stringify(original);
    const copie = { ...original } as ObjetPlan;
    appliquerPropositions([copie], [
      proposition('r', { type: 'releve', releve: RELEVE }, { cible: { type: 'facade', cle: 'maison', cote: 0 } }),
      proposition('c', { type: 'couleurMurs', couleur: '#c9b49a' }),
      proposition('t', { type: 'couverture', couverture: 'ardoise' }),
      proposition('ch', { type: 'cheminees', corps: 0, cheminees: [] }),
      proposition('te', { type: 'terrasse', corps: 0, terrasse: { source: 'observation' } }),
      proposition('h', { type: 'hauteur', hauteurM: 7 }),
    ], ['maison'], '2026-10-13');
    expect(JSON.stringify(original)).toBe(avant);
    expect(copie.elevation).toBe(7);
  });
});

describe('les petits calculs', () => {
  it('place le portail a gauche, au milieu ou a droite du cote', () => {
    expect(abscisseDuPortail('gauche', 20, 3.5, 7)).toBe(0.5);
    expect(abscisseDuPortail('centre', 20, 3.5, 7)).toBe(8.25);
    expect(abscisseDuPortail('droite', 20, 3.5, 7)).toBe(16);
    expect(abscisseDuPortail(undefined, 20, 3.5, 7)).toBe(7);
  });

  it('donne le jour de la visite', () => {
    expect(jourIso(new Date(2026, 9, 3, 23, 30))).toBe('2026-10-03');
  });
});

describe('le projet apres les propositions, pour l apercu', () => {
  it('copie les objets vises et y ecrit les propositions, sans toucher le projet', () => {
    const objets = projet();
    const avant = JSON.stringify(objets);
    const r = projetApres(objets, [
      proposition('couverture', { type: 'couverture', couverture: 'ardoise' }),
      proposition('cloture', { type: 'cloture', cote: 0, typeCloture: 'mur', hauteurM: 1.6 }),
    ], '2026-10-15');
    expect(JSON.stringify(objets)).toBe(avant);
    expect([...r.touches].sort()).toEqual(['maison', 'parcelle']);
    const [parcelle, maison] = r.objets as [ObjetPlan, ObjetPlan];
    expect(maison).not.toBe(objets[1]);
    expect(maison.batiment?.toit?.couverture).toBe('ardoise');
    // La cloture, modifiee en place par model/cloture.ts, est une copie profonde.
    expect(parcelle.cloture).not.toBe(objets[0]?.cloture);
    expect(clotureDe(parcelle).cotes[0]).toMatchObject({ type: 'mur', hauteur: 1.6 });
    expect(clotureDe(objets[0] as ObjetPlan).cotes.find((c) => c.cote === 0)?.type).not.toBe('mur');
  });

  it('rend les objets non vises tels quels, dans le meme ordre', () => {
    const objets = [...projet(), obj('abri', { fonction: 'annexe', pts: rect(0, 0, 2, 2) })];
    const r = projetApres(objets, [proposition('couverture', { type: 'couverture', couverture: 'zinc' })], '2026-10-15');
    expect(r.objets.map((o) => o.key)).toEqual(['parcelle', 'maison', 'abri']);
    expect(r.objets[0]).toBe(objets[0]);
    expect(r.objets[2]).toBe(objets[2]);
    expect(r.touches).toEqual(['maison']);
  });
});

// D21 : la valeur notee sur place l'emporte sur celle de Claude (MD/plan-vague-3-generaliser.md).
describe('les rivales sur place', () => {
  const base = { avant: 'a', apres: 'b', indices: [], confiance: null, remplaceChoix: null, reserve: null };
  const p = (id: string, source: 'mesure' | 'claude', type: 'couverture' | 'materiauMurs' | 'hauteur', cle = 'maison'): Proposition => ({
    ...base, id, cible: { type: 'batiment', cle }, objet: 'o', source,
    effet: type === 'hauteur' ? { type, hauteurM: 6 } : type === 'couverture' ? { type, couverture: 'zinc' } : { type, materiau: 'brique' },
  });

  it('sont les lignes de l autre source qui ecrivent le meme attribut du meme batiment', () => {
    const toutes = [p('n', 'mesure', 'couverture'), p('c', 'claude', 'couverture'), p('autre', 'claude', 'couverture', 'annexe'), p('m', 'claude', 'materiauMurs')];
    expect(rivalesSurPlace(toutes[0]!, toutes).map((x) => x.id)).toEqual(['c']);
    expect(rivalesSurPlace(toutes[1]!, toutes).map((x) => x.id)).toEqual(['n']);
    expect(rivalesSurPlace(toutes[2]!, toutes)).toEqual([]);
    expect(rivalesSurPlace(toutes[3]!, toutes)).toEqual([]);
  });

  it('ne concernent que les attributs notes sur place : la hauteur mesuree n a pas de rivale', () => {
    const toutes = [p('h1', 'mesure', 'hauteur'), p('h2', 'claude', 'hauteur')];
    expect(rivalesSurPlace(toutes[0]!, toutes)).toEqual([]);
  });

  it('ajoutent la reserve a celle de la ligne de Claude, sans changer les autres lignes', () => {
    const toutes = [p('n', 'mesure', 'couverture'), p('c', 'claude', 'couverture'), { ...p('c2', 'claude', 'materiauMurs'), reserve: 'x' }, p('seule', 'claude', 'materiauMurs', 'annexe')];
    const r = avecReserveSurPlace(toutes);
    expect(r[0]).toBe(toutes[0]);
    expect(r[1]?.reserve).toBe(RESERVE_NOTE_SUR_PLACE);
    // Une reserve deja la (taux d'accord, contradiction) reste, la nouvelle s'y ajoute — quand la ligne a une rivale.
    expect(avecReserveSurPlace([toutes[0]!, { ...toutes[1]!, reserve: 'x' }])[1]?.reserve).toBe('x ' + RESERVE_NOTE_SUR_PLACE);
    expect(r[2]).toBe(toutes[2]);
    expect(r[3]).toBe(toutes[3]);
    expect(toutes[1]?.reserve).toBeNull();
  });
});

// Le toit decide par l'audit (MD/spec-ouvrages.md, « Les toits dans l'audit de la parcelle », points 1, 3 et 5).
describe('le toit decide par l audit', () => {
  const NEUF: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 10, egouts: [6.5, 6.5], pignons: [], ecart: 0.05 };
  const SOUCHE = { x: 10, y: 14, largeurM: 0.6, profondeurM: 0.5, sommetM: 9.4, position: 'faitage' as const, source: 'observation' as const };

  it('fige le toit ecrit : la relecture du LiDAR ne le remplacera plus ; la couverture seule ne le fige pas', () => {
    const objets = projet();
    appliquerPropositions(objets, [proposition('toit', { type: 'corpsToit', corps: [NEUF] })], [], '2026-10-28');
    expect(objets[1]?.batiment?.toitFige).toBe(true);
    const autres = projet();
    appliquerPropositions(autres, [proposition('couverture', { type: 'couverture', couverture: 'zinc' })], [], '2026-10-28');
    expect(autres[1]?.batiment?.toitFige).toBeUndefined();
    // Une cheminee qui n'a pas de corps ou se poser n'ecrit rien : rien ne se fige.
    appliquerPropositions(autres, [proposition('ch', { type: 'cheminees', corps: 3, cheminees: [SOUCHE] })], [], '2026-10-28');
    expect(autres[1]?.batiment?.toitFige).toBeUndefined();
  });

  it('pose un element sur la forme ecrite dans la meme validation (apresForme), et a sa place d avant sinon', () => {
    const surNeuf = { ...SOUCHE, sommetM: 10.4 };
    const ch = proposition('ch', { type: 'cheminees', corps: 0, cheminees: [SOUCHE], apresForme: { corps: 0, cheminees: [surNeuf] } });
    const avec = projet();
    appliquerPropositions(avec, [ch, proposition('toit', { type: 'corpsToit', corps: [NEUF] })], [], '2026-10-28');
    expect(avec[1]?.batiment?.corpsToit?.[0]?.cheminees).toEqual([surNeuf]);
    const sans = projet();
    appliquerPropositions(sans, [ch], [], '2026-10-28');
    expect(sans[1]?.batiment?.corpsToit?.[0]?.cheminees).toEqual([SOUCHE]);
    // Un element qui ne tient pas sur la forme neuve (apresForme: null) n'est pas ecrit avec elle.
    const terrasse = proposition('t', { type: 'terrasse', corps: 0, terrasse: { accessible: true, source: 'observation' }, apresForme: null });
    const plat = projet();
    appliquerPropositions(plat, [terrasse, proposition('toit', { type: 'corpsToit', corps: [NEUF] })], [], '2026-10-28');
    expect(plat[1]?.batiment?.corpsToit?.[0]?.terrasse).toBeUndefined();
  });

  it('l apercu des details d ouvertures ne touche pas le releve du projet', () => {
    const objets = projet();
    champsBatiment(objets[1] as ObjetPlan).facades = [{ ...RELEVE, ouvertures: RELEVE.ouvertures.map((o) => ({ ...o })) }];
    const avant = JSON.stringify(objets);
    const r = projetApres(objets, [proposition('details', { type: 'detailsOuvertures', cote: 0, details: { volets: 'roulant' } })], '2026-10-28');
    expect(JSON.stringify(objets)).toBe(avant);
    expect(r.objets[1]?.batiment?.facades?.[0]?.ouvertures[0]?.details).toMatchObject({ volets: 'roulant' });
    expect(r.objets[1]?.batiment?.facades?.[0]).not.toBe(objets[1]?.batiment?.facades?.[0]);
  });
});
