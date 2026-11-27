import { describe, it, expect } from 'vitest';
import {
  partagerRue, profilerRues, bornerPart, partTrottoirs, reglerPartTrottoirs, couleursRues, reglerCouleursRues,
  etiquettesSurChaussees, TROTTOIR_MIN_M, CHAUSSEE_MIN_M, PART_TROTTOIRS_DEFAUT, PART_TROTTOIRS_MIN, PART_TROTTOIRS_MAX, PART_TROTTOIRS_PAS,
  type StationRue,
} from '../../../src/model/trottoirs.js';
import { tracerRues } from '../../../src/model/rues.js';
import type { ChausseeRue, ObjetPlan, PtBrut } from '../../../src/model/types.js';

// Les trottoirs entre les parcelles et la chaussee (option « Rues », MD/spec-rues.md §8).

describe('partagerRue', () => {
  const large = 12;
  it('donne un cinquieme a chaque trottoir et le reste a la chaussee', () => {
    const p = partagerRue(10, large);
    expect(p.sansTrottoir).toBe(false);
    expect(p.trottoir).toBeCloseTo(2, 9);
    expect(p.chaussee).toBeCloseTo(6, 9);
  });
  it('garde 1,40 m par trottoir, puis rogne la chaussee', () => {
    const huit = partagerRue(8, large);
    expect(huit.trottoir).toBeCloseTo(1.6, 9);
    expect(huit.chaussee).toBeCloseTo(4.8, 9);
    const six = partagerRue(6, large);
    expect(six.trottoir).toBeCloseTo(TROTTOIR_MIN_M, 9);
    expect(six.chaussee).toBeCloseTo(3.2, 9);
  });
  it('laisse la rue partagee quand deux trottoirs et une chaussee de 3 m ne tiennent pas', () => {
    expect(partagerRue(5, 7)).toEqual({ trottoir: 0, chaussee: 5, sansTrottoir: true });
    expect(partagerRue(5, 4)).toEqual({ trottoir: 0, chaussee: 4, sansTrottoir: true });
    // 5,80 m : la limite exacte, deux fois 1,40 m et 3 m.
    expect(partagerRue(2 * TROTTOIR_MIN_M + CHAUSSEE_MIN_M, 7).sansTrottoir).toBe(false);
  });
  it('ne depasse pas la chaussee lue : les trottoirs prennent le reste', () => {
    const p = partagerRue(16, 7);
    expect(p.chaussee).toBe(7);
    expect(p.trottoir).toBeCloseTo(4.5, 9);
  });
  it('suit la part reglee, sans laisser la chaussee sous 3 m', () => {
    // A 10 %, 1,40 m l'emporte encore sur 10 m ; sur 20 m, chaque trottoir prend 2 m.
    expect(partagerRue(10, large, 10).chaussee).toBeCloseTo(7.2, 9);
    expect(partagerRue(20, 20, 10).chaussee).toBeCloseTo(16, 9);
    expect(partagerRue(10, large, 30).chaussee).toBeCloseTo(4, 9);
    expect(partagerRue(10, large, 30).trottoir).toBeCloseTo(3, 9);
    // A 30 %, 7 m laisseraient 2,80 m : la chaussee garde 3 m.
    expect(partagerRue(7, large, 30)).toEqual({ trottoir: 2, chaussee: CHAUSSEE_MIN_M, sansTrottoir: false });
    // Un chemin que la BD TOPO dit plus etroit que 3 m garde sa largeur.
    expect(partagerRue(10, 2.5).chaussee).toBe(2.5);
  });
  it('borne la part au pas du reglage', () => {
    expect([PART_TROTTOIRS_MIN, PART_TROTTOIRS_DEFAUT, PART_TROTTOIRS_MAX, PART_TROTTOIRS_PAS]).toEqual([10, 20, 30, 5]);
    expect(bornerPart(22)).toBe(20);
    expect(bornerPart(23)).toBe(25);
    expect(bornerPart(2)).toBe(10);
    expect(bornerPart(80)).toBe(30);
    expect(bornerPart(NaN)).toBe(20);
  });
});

/** Un rectangle de parcelle. */
const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
/** Une rue d'ouest en est sur l'axe y = 0 : sa gauche est au nord. */
const rue: ChausseeRue = { nature: 'Route à 1 chaussée', largeurM: 7, nom: 'Allée des Limites', pts: [{ x: -30, y: 0 }, { x: 30, y: 0 }] };
const milieu = (stations: StationRue[]) => stations.find((s) => Math.abs(s.x) < 1e-9)!;

describe('profilerRues', () => {
  it('mesure tous les 2 m au plus, la normale a gauche', () => {
    const [p] = profilerRues([rue], []);
    expect(p!.stations).toHaveLength(31);
    const s0 = p!.stations[0]!;
    expect([s0.x, s0.y, s0.ny]).toEqual([-30, 0, 1]);
    expect(Math.abs(s0.nx)).toBe(0);
  });
  it('sans limite a portee, garde la chaussee d avant, sans trottoir', () => {
    const s = milieu(profilerRues([rue], [{ pts: rect(-40, 40, 40, 60), projet: true }])[0]!.stations);
    expect(s).toMatchObject({ chausseeG: 3.5, chausseeD: -3.5, trottoirG: null, trottoirD: null });
  });
  it('les deux limites connues : la chaussee au milieu de l espace, un trottoir de chaque cote jusqu aux limites', () => {
    const parcelles = [{ pts: rect(-40, 6, 40, 30), projet: true }, { pts: rect(-40, -30, 40, -4), projet: false }];
    const s = milieu(profilerRues([rue], parcelles)[0]!.stations);
    // E = 10 m, l'axe a 1 m au sud du milieu : chaussee de 6 m centree en y = 1, trottoirs de 2 m.
    expect(s.chausseeG).toBeCloseTo(4, 9);
    expect(s.chausseeD).toBeCloseTo(-2, 9);
    expect(s.trottoirG).toBeCloseTo(6, 9);
    expect(s.trottoirD).toBeCloseTo(-4, 9);
  });
  it('la parcelle d en face inconnue : la rue supposee symetrique, le trottoir le long du projet seulement', () => {
    const s = milieu(profilerRues([rue], [{ pts: rect(-40, 5, 40, 30), projet: true }])[0]!.stations);
    expect(s.chausseeG).toBeCloseTo(3, 9);
    expect(s.chausseeD).toBeCloseTo(-3, 9);
    expect(s.trottoirG).toBeCloseTo(5, 9);
    expect(s.trottoirD).toBeNull();
    // De l'autre cote de la rue, la meme parcelle du projet donne le trottoir de droite.
    const sud = milieu(profilerRues([rue], [{ pts: rect(-40, -30, 40, -5), projet: true }])[0]!.stations);
    expect(sud.trottoirD).toBeCloseTo(-5, 9);
    expect(sud.trottoirG).toBeNull();
  });
  it('une voisine seule : pas de trottoir, la chaussee tient dans l espace suppose', () => {
    const s = milieu(profilerRues([rue], [{ pts: rect(-40, 3, 40, 30), projet: false }])[0]!.stations);
    expect(s).toMatchObject({ chausseeG: 3, chausseeD: -3, trottoirG: null, trottoirD: null });
  });
  it('une rue trop etroite reste partagee, sa chaussee entre les limites', () => {
    const s = milieu(profilerRues([rue], [{ pts: rect(-40, 2.5, 40, 30), projet: true }, { pts: rect(-40, -30, 40, -2.5), projet: false }])[0]!.stations);
    expect(s).toMatchObject({ chausseeG: 2.5, chausseeD: -2.5, trottoirG: null, trottoirD: null });
  });
  it('suit la part reglee', () => {
    const parcelles = [{ pts: rect(-40, 5, 40, 30), projet: true }, { pts: rect(-40, -30, 40, -5), projet: false }];
    const s = milieu(profilerRues([rue], parcelles, 30)[0]!.stations);
    expect(s.chausseeG - s.chausseeD).toBeCloseTo(4, 9);
    expect(s.trottoirG! - s.chausseeG).toBeCloseTo(3, 9);
  });
  it('s arrete ou la parcelle s arrete : au-dela, plus de trottoir', () => {
    const stations = profilerRues([rue], [{ pts: rect(-10, 5, 10, 30), projet: true }])[0]!.stations;
    expect(stations.filter((s) => s.trottoirG !== null).every((s) => s.x >= -12 && s.x <= 12)).toBe(true);
    expect(stations.find((s) => s.x === -30)!.trottoirG).toBeNull();
    expect(milieu(stations).trottoirG).toBeCloseTo(5, 9);
  });
  it('ne traverse pas une autre rue : au-dela de son axe, la limite n est plus celle de cette rue', () => {
    // Une rue parallele a 8 m au nord, et la parcelle au-dela : le rayon la traverse avant la limite.
    const parallele: ChausseeRue = { nature: 'Route à 1 chaussée', largeurM: 5, pts: [{ x: -30, y: 8 }, { x: 30, y: 8 }] };
    const [p] = profilerRues([rue, parallele], [{ pts: rect(-40, 12, 40, 30), projet: true }]);
    expect(milieu(p!.stations)).toMatchObject({ chausseeG: 3.5, chausseeD: -3.5, trottoirG: null, trottoirD: null });
  });
  it('ne lit rien d un axe pose dans une parcelle', () => {
    const s = milieu(profilerRues([rue], [{ pts: rect(-40, -2, 40, 30), projet: true }])[0]!.stations);
    expect(s).toMatchObject({ chausseeG: 3.5, chausseeD: -3.5, trottoirG: null, trottoirD: null });
  });
});

describe('les reglages des rues dessinees', () => {
  const parcelle = () => ({ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: rect(-40, 5, 40, 30) }) as unknown as ObjetPlan;
  it('n ecrivent que ce qui differe du defaut, et la parcelle revient a sa forme d avant', () => {
    const o = parcelle();
    expect(partTrottoirs(o)).toBe(PART_TROTTOIRS_DEFAUT);
    expect(couleursRues(o)).toBe('plan');
    reglerPartTrottoirs(o, 25);
    reglerCouleursRues(o, 'reelles');
    expect(o.voisinage3d).toEqual({ rues: { afficher: false, partTrottoirs: 25, couleurs: 'reelles' } });
    expect(partTrottoirs(o)).toBe(25);
    expect(couleursRues(o)).toBe('reelles');
    reglerPartTrottoirs(o, 20);
    reglerCouleursRues(o, 'plan');
    expect('voisinage3d' in o).toBe(false);
  });
  it('restent quand « Rues » se decoche, pour la prochaine fois', () => {
    const o = parcelle();
    tracerRues(o, true);
    reglerPartTrottoirs(o, 30);
    expect(o.voisinage3d).toEqual({ rues: { afficher: false, tracer: true, partTrottoirs: 30 } });
    tracerRues(o, false);
    expect(o.voisinage3d).toEqual({ rues: { afficher: false, partTrottoirs: 30 } });
    tracerRues(o, true);
    expect(o.voisinage3d).toEqual({ rues: { afficher: false, partTrottoirs: 30, tracer: true } });
  });
  it('se lisent bornes', () => {
    const o = { ...parcelle(), voisinage3d: { rues: { afficher: false, partTrottoirs: 99 } } } as unknown as ObjetPlan;
    expect(partTrottoirs(o)).toBe(PART_TROTTOIRS_MAX);
  });
});

describe('etiquettesSurChaussees', () => {
  it('pose le nom au milieu de la chaussee decalee, et dit sa largeur', () => {
    const profils = profilerRues([rue], [{ pts: rect(-40, 6, 40, 30), projet: true }, { pts: rect(-40, -30, 40, -4), projet: false }]);
    const [e] = etiquettesSurChaussees([{ nom: 'Allée des Limites', x: 0, y: 0, angleDeg: 0 }], profils);
    expect(e!.x).toBeCloseTo(0, 9);
    expect(e!.y).toBeCloseTo(1, 9);
    expect(e!.largeurM).toBeCloseTo(6, 9);
  });
  it('laisse ou il est un nom loin de toute chaussee, ou d une autre rue', () => {
    const profils = profilerRues([rue], []);
    expect(etiquettesSurChaussees([{ nom: 'Allée des Limites', x: 0, y: 50, angleDeg: 0 }], profils)).toEqual([{ nom: 'Allée des Limites', x: 0, y: 50, angleDeg: 0 }]);
    expect(etiquettesSurChaussees([{ nom: 'Autre rue', x: 0, y: 0, angleDeg: 0 }], profils)[0]!.largeurM).toBeUndefined();
  });
});
