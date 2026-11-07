import { describe, it, expect } from 'vitest';
import { avecLeChoix, avecLeForcage, lectureSelonLesChoix, lireChoix, lireForcages, ouverturesSelonLesChoix, poseSelonLesChoix, sourceDe } from '../../../../src/facade/releve/choixSources.js';
import type { AccordIa } from '../../../../src/facade/regles/facades/ia.js';
import type { ObservationsFacade } from '../../../../src/regles/facades/observations.js';
import type { OuvertureFacade } from '../../../../src/model/types.js';

// Les choix de la personne (Calcul, Claude, Manuel) et le forcage de Claude (lot C2) : ce qu'ils changent a ce que les etapes recoivent.
// Sans choix ni forcage, chaque fonction rend ce qu'elle a recu : rien ne change.

const LE = '2026-11-07T10:00:00.000Z';
const ia = (k: number) => ({ type: 'fenetre', u0: k / 10, u1: k / 10 + 0.1, v0: 0.3, v1: 0.6 }) as unknown as ObservationsFacade['ouvertures'][number];
const lues = [ia(1), ia(4), ia(7), ia(9)];
const reponse = { ouvertures: lues, calage: { pointes: [{ u: 0.5, v: 1.8, confiance: 'forte' }, { u: 0.9, v: 1.2, confiance: 'forte' }], appentis: [], corps: [{ debut: 0.7, fin: 1, confiance: 'forte' }], cache: [] },
  forme: { silhouette: 'triangle', bout: 'pignon' }, elements: [{ element: 'cheminee', u: 0.3, confiance: 'forte' }] } as unknown as ObservationsFacade;
const o = (x: number, l = 1): OuvertureFacade => ({ type: 'fenetre', x, y: 1, l, h: 1.2, source: 'detectee' });
const calculees = [o(1), o(4)];
const devinees = [o(7)];
const accord = {
  ouvertures: [...calculees, devinees[0]], decochees: [], retirees: [],
  boites: [
    { ouverture: { ...o(1.1), source: 'claude' }, ia: lues[0], cochee: true, avec: 'detectee', vers: 0 },
    { ouverture: { ...o(4), source: 'claude' }, ia: lues[1], cochee: true, avec: 'detectee', vers: 1 },
    { ouverture: { ...o(7.05), source: 'claude' }, ia: lues[2], cochee: true, avec: 'devinee', vers: 0 },
  ],
  ecartees: [lues[3]], bilan: { boites: 4, retrouvees: 2, devineesConfirmees: 1, seules: 0, ecartees: 1, detailsAjoutes: 0 },
} as unknown as AccordIa;
const base = accord.ouvertures;

describe('la source d un element', () => {
  it('le choix l emporte sur le forcage, le forcage sur le moteur ; un element que Claude n a pas lu garde le calcul et le dit', () => {
    expect(sourceDe({}, 'ouverture:0', 'ouverture', true, 'calcul')).toMatchObject({ source: 'calcul', choisie: null, forcee: null, sansClaude: false });
    const forcages = avecLeForcage(undefined, { etape: 'ouvertures' }, true, LE);
    expect(sourceDe({ forcages }, 'ouverture:0', 'ouverture', true, 'calcul').source).toBe('claude');
    expect(sourceDe({ forcages }, 'pointe:0', 'pointe', true, 'calcul').source).toBe('calcul');
    expect(sourceDe({ forcages, choix: avecLeChoix(undefined, 'ouverture:0', 'calcul', LE) }, 'ouverture:0', 'ouverture', true, null).source).toBe('calcul');
    expect(sourceDe({ forcages: avecLeForcage(undefined, { toutes: true }, true, LE) }, 'pointe-attendue:0', 'pointe', false, 'calcul')).toMatchObject({ source: 'calcul', sansClaude: true });
  });

  it('poser, remplacer et retirer un choix ou un forcage ; relire un cas', () => {
    let c = avecLeChoix(undefined, 'ouverture:1', 'claude', LE);
    c = avecLeChoix(c, 'ouverture:1', 'manuel', LE, { x: 2, y: 1, l: 1, h: 1, type: 'porte' });
    expect(c).toEqual([{ cle: 'ouverture:1', source: 'manuel', le: LE, valeur: { x: 2, y: 1, l: 1, h: 1, type: 'porte' } }]);
    expect(avecLeChoix(c, 'ouverture:1', null, LE)).toEqual([]);
    const f = avecLeForcage(avecLeForcage(undefined, { toutes: true }, true, LE), { etape: 'calage' }, true, LE);
    expect(avecLeForcage(f, { toutes: true }, false, LE)).toEqual([{ etape: 'calage', source: 'claude', le: LE }]);
    expect(lireChoix([...c, { cle: '', source: 'claude', le: LE }, { cle: 'x', source: 'autre', le: LE }])).toEqual(c);
    expect(lireForcages([...f, { etape: 'prises', source: 'claude', le: LE }, { toutes: true, source: 'calcul', le: LE }])).toEqual(f);
  });
});

describe('les ouvertures selon les choix (E12, E14)', () => {
  it('sans choix ni forcage : rien (la liste du moteur vaut)', () => {
    expect(ouverturesSelonLesChoix({}, accord, reponse, base, calculees, devinees)).toBeNull();
    expect(ouverturesSelonLesChoix({ choix: [], forcages: [] }, accord, reponse, base, calculees, devinees)).toBeNull();
  });

  it('Claude pour une boite retrouvee : sa place remplace celle de l ouverture calculee qu elle confirme', () => {
    const r = ouverturesSelonLesChoix({ choix: avecLeChoix(undefined, 'ouverture:0', 'claude', LE) }, accord, reponse, base, calculees, devinees);
    expect(r?.changees).toEqual(['ouverture:0']);
    expect(r?.ouvertures.map((x) => [x.x, x.source])).toEqual([[1.1, 'claude'], [4, 'detectee'], [7, 'detectee']]);
  });

  it('Manuel pour une boite ecartee, et une ouverture ajoutee a la main : elles s ajoutent', () => {
    const choix = avecLeChoix(avecLeChoix(undefined, 'ouverture:3', 'manuel', LE, { type: 'porte', x: 8, y: 0, l: 0.9, h: 2.1 }), 'ajout:0', 'manuel', LE, { type: 'fenetre', x: 2.5, y: 1, l: 0.6, h: 0.6 });
    const r = ouverturesSelonLesChoix({ choix }, accord, reponse, base, calculees, devinees);
    expect(r?.ouvertures.map((x) => [x.type, x.x, x.source])).toEqual([['fenetre', 1, 'detectee'], ['fenetre', 2.5, 'ajoutee'], ['fenetre', 4, 'detectee'], ['fenetre', 7, 'detectee'], ['porte', 8, 'ajoutee']]);
  });

  it('Claude force pour l E12 : chaque boite lue prend sa place ; une boite dont la place est deja la sienne ne change rien', () => {
    const r = ouverturesSelonLesChoix({ forcages: avecLeForcage(undefined, { etape: 'ouvertures' }, true, LE) }, accord, reponse, base, calculees, devinees);
    expect(r?.changees).toEqual(['ouverture:0', 'ouverture:2']);
    // La boite ecartee (hors du mur) ne se pose pas par le forcage : elle n'a pas de place sur lui.
    expect(r?.ouvertures).toHaveLength(3);
  });
});

describe('la lecture de Claude selon les choix (E10, E14)', () => {
  const attendues = [{ u: 0.5, v: 1.6 }, { u: 0.2, v: 1.5 }];
  it('sans choix : la reponse telle quelle', () => {
    expect(lectureSelonLesChoix({}, reponse, attendues)).toEqual({ reponse, pris: [] });
  });

  it('une pointe en plus prise du calcul s en va, une attendue s ajoute a la main, un volume pris du calcul s en va', () => {
    const choix = avecLeChoix(avecLeChoix(avecLeChoix(undefined, 'pointe:1', 'calcul', LE), 'pointe-attendue:0', 'manuel', LE, { u: 0.2, v: 1.4 }), 'corps:0', 'calcul', LE);
    const l = lectureSelonLesChoix({ choix }, reponse, attendues);
    expect(l.reponse?.calage.pointes.map((p) => [p.u, p.v])).toEqual([[0.5, 1.8], [0.2, 1.4]]);
    expect(l.reponse?.calage.corps).toEqual([]);
  });

  it('un element du toit pris de Claude est pris malgre le haut lu ; pris du calcul, il s en va ; le mot du haut pris du calcul ne dit plus rien', () => {
    expect(lectureSelonLesChoix({ choix: avecLeChoix(undefined, 'element-toit:0', 'claude', LE) }, reponse, attendues).pris).toEqual([{ element: 'cheminee', u: 0.3 }]);
    const l = lectureSelonLesChoix({ choix: avecLeChoix(avecLeChoix(undefined, 'element-toit:0', 'calcul', LE), 'forme', 'calcul', LE) }, reponse, attendues);
    expect(l.reponse?.elements).toEqual([]);
    expect(l.reponse?.forme).toEqual({ silhouette: 'indetermine', bout: 'indetermine' });
  });
});

describe('la pose du mur selon le choix des angles (E7)', () => {
  const pose = { x0: 10, x1: 110, y0: 5, y1: 80 };
  it('Claude : sa pose ; Manuel : les valeurs de la personne ; sans choix, ou Claude sans pose : rien', () => {
    expect(poseSelonLesChoix({}, pose)).toBeNull();
    expect(poseSelonLesChoix({ choix: avecLeChoix(undefined, 'angles', 'claude', LE) }, pose)).toEqual({ rect: pose, source: 'claude' });
    expect(poseSelonLesChoix({ choix: avecLeChoix(undefined, 'angles', 'claude', LE) }, null)).toBeNull();
    expect(poseSelonLesChoix({ choix: avecLeChoix(undefined, 'angles', 'manuel', LE, { x0: 12, x1: 108, y0: 6, y1: 79 }) }, pose)).toEqual({ rect: { x0: 12, x1: 108, y0: 6, y1: 79 }, source: 'manuel' });
  });
});

describe('un cas de calibration garde ses choix (aucune migration)', () => {
  const C = [{ x: 1, y: 2 }, { x: 9, y: 2 }, { x: 9, y: 8 }, { x: 1, y: 8 }];
  const brut = { format: 'plan-facade-reelle', version: 1, nom: 'x', statut: 'brouillon', largeurM: 8, hauteurM: 5, ouvertures: [], photos: [{ fichier: 'p', coins: C }] };
  it('un cas d avant se relit sans choix ; un cas qui en a les garde, les illisibles laisses de cote', async () => {
    const { lireCasReel } = await import('../../../../src/facade/corpusReel.js');
    const avant = lireCasReel(brut);
    expect('choix' in avant || 'forcages' in avant).toBe(false);
    const choix = [{ cle: 'ouverture:0', source: 'claude', le: LE }];
    const lu = lireCasReel({ ...brut, choix: [...choix, { cle: 'z', source: 'n importe', le: LE }], forcages: [{ etape: 'ouvertures', source: 'claude', le: LE }, { etape: 'inconnue', source: 'claude', le: LE }] });
    expect(lu.choix).toEqual(choix);
    expect(lu.forcages).toEqual([{ etape: 'ouvertures', source: 'claude', le: LE }]);
  });
});
