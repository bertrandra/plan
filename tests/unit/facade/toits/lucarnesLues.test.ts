import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { avecLucarnesLues, lucarnesDuCorps, TYPE_LUCARNE_LUE } from '../../../../src/facade/toits/lucarnesLues.js';
import { corpsCalcules } from '../../../../src/facade/regles/toits/catalogue.js';
import { raccorderLesToits } from '../../../../src/facade/toits/raccord.js';
import { reporterElements } from '../../../../src/facade/regles/toits/elementsVus.js';
import { ecrivainPeut } from '../../../../src/model/protections.js';
import { toitMesureDepuisGrille } from '../../../../src/model/toitMesure.js';
import type { CorpsToit, Lucarne, PtBrut } from '../../../../src/model/types.js';

// Les lucarnes lues sur le LiDAR (MD/spec-toit-ign.md §13.11). Le proprietaire, Hardencourt 6501004, 27 novembre 2026 : « sur la
// grande facade, sur le lidar je vois bien les 2 chiens assis, pourquoi ont-ils disparu ? ».

const p = (x: number, y: number): PtBrut => ({ x, y });
/** Un toit a deux pans de 20 x 8 m le long de x : egouts a 4 m, faitage a 7 m au milieu. Le pan 0 est au sud (y = 0). */
const RECT = [p(0, 0), p(20, 0), p(20, 8), p(0, 8)];
const TOIT: CorpsToit = { pts: RECT, posFaitage: 4, faitage: 7, egouts: [4, 4], pignons: [], ecart: 0.1 };
const pan = (y: number): number => 4 + (3 * Math.min(y, 8 - y)) / 4;
/** La grille de ce toit, au pas de 50 cm, avec ce que `bosse(x, y)` y ajoute (une hauteur imposee, ou rien). */
function grille(bosse: (x: number, y: number) => number | null = () => null) {
  const pas = 0.5, x0 = -1.75, y0 = 9.75, nx = 48, ny = 24, z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * pas, y = y0 - j * pas;
    z.push(x < 0 || x > 20 || y < 0 || y > 8 ? 0 : bosse(x, y) ?? pan(y));
  }
  return { pas, x0, y0, nx, ny, z };
}
/** Un chien-assis de `l` metres de large a partir de `x0`, de la face (le mur sud) jusqu'a 2 m, dessus a 5,8 m. */
const chienAssis = (x0: number, l: number, haut = 5.8) => (x: number, y: number): number | null => (x >= x0 && x < x0 + l && y < 2 && haut > pan(y) ? haut : null);
const plusieurs = (...b: ((x: number, y: number) => number | null)[]) => (x: number, y: number): number | null => b.map((f) => f(x, y)).find((v) => v !== null) ?? null;

describe('les lucarnes que la mesure montre sur un pan', () => {
  it('un toit a deux pans sans rien dessus n en porte aucune', () => {
    expect(lucarnesDuCorps(grille(), TOIT, RECT)).toEqual([]);
  });

  it('deux bosses de 1,5 m parties du mur, nettes : deux chiens-assis a leur place, sur leur pan', () => {
    const lues = lucarnesDuCorps(grille(plusieurs(chienAssis(5, 1.5), chienAssis(12, 1.5))), TOIT, RECT);
    expect(lues.map((l) => [l.type, l.pan, l.debutM, l.finM, l.source])).toEqual([[TYPE_LUCARNE_LUE, 0, 5, 6.5, 'lidar'], [TYPE_LUCARNE_LUE, 0, 12, 13.5, 'lidar']]);
    for (const l of lues) { expect(l.faitageM).toBeCloseTo(5.8, 1); expect(l.profondeurM).toBeGreaterThanOrEqual(1); }
  });

  it('seule sur son pan, une bosse basse n est pas une lucarne ; haute d un metre, elle l est', () => {
    // Une bosse qui suit le pan a 80 cm au-dessus de lui, sur 2 m de large et 2 m de profondeur.
    const basse = (x0: number) => (x: number, y: number): number | null => (x >= x0 && x < x0 + 2 && y < 2 ? pan(y) + 0.8 : null);
    expect(lucarnesDuCorps(grille(basse(8)), TOIT, RECT)).toEqual([]);
    // Deux pareilles se confirment l'une l'autre.
    expect(lucarnesDuCorps(grille(plusieurs(basse(5), basse(12))), TOIT, RECT)).toHaveLength(2);
    expect(lucarnesDuCorps(grille(chienAssis(8, 2, 5.8)), TOIT, RECT)).toHaveLength(1);
  });

  it('ni une souche de cheminee (50 cm), ni un pignon ou un autre toit (4 m), ni un arbre plus haut que le faitage', () => {
    expect(lucarnesDuCorps(grille(chienAssis(8, 0.5, 6.5)), TOIT, RECT)).toEqual([]);
    expect(lucarnesDuCorps(grille(chienAssis(8, 4, 6)), TOIT, RECT)).toEqual([]);
    expect(lucarnesDuCorps(grille(plusieurs(chienAssis(5, 1.5, 9), chienAssis(12, 1.5, 9))), TOIT, RECT)).toEqual([]);
  });

  it('ni au bout du corps, ni en haut du pan loin du mur, ni sous un pignon deja lu', () => {
    expect(lucarnesDuCorps(grille(plusieurs(chienAssis(0, 1.5), chienAssis(18.5, 1.5))), TOIT, RECT)).toEqual([]);
    const enHaut = (x: number, y: number): number | null => ((x >= 5 && x < 6.5) || (x >= 12 && x < 13.5)) && y >= 1.5 && y < 3 ? 7 : null;
    expect(lucarnesDuCorps(grille(enHaut), TOIT, RECT)).toEqual([]);
    const sousPignon: CorpsToit = { ...TOIT, pignons: [{ pan: 1, debut: 4, fin: 7, faitage: 7, profondeur: 4 }] };
    expect(lucarnesDuCorps(grille(plusieurs(chienAssis(5, 1.5), chienAssis(12, 1.5))), sousPignon, RECT).map((l) => l.debutM)).toEqual([12]);
  });

  it('jamais la ou un autre toit entre dans le pan : un batiment accole au mur, devant la bosse', () => {
    const g = grille(plusieurs(chienAssis(5, 1.5), chienAssis(12, 1.5)));
    const aile = [p(4, 0.2), p(4, -6), p(8, -6), p(8, 0.2)];
    expect(lucarnesDuCorps(g, TOIT, RECT, [], [aile]).map((l) => l.debutM)).toEqual([12]);
  });

  it('rien sur un toit plat, un appentis ouvert, un toit de revolution, ni sur un toit presque plat', () => {
    const g = grille(plusieurs(chienAssis(5, 1.5), chienAssis(12, 1.5)));
    expect(lucarnesDuCorps(g, { ...TOIT, ouvert: true }, RECT)).toEqual([]);
    expect(lucarnesDuCorps(g, { ...TOIT, faitage: 4.5 }, RECT)).toEqual([]);
    expect(lucarnesDuCorps(g, { ...TOIT, terrasse: {} as NonNullable<CorpsToit['terrasse']> }, RECT)).toEqual([]);
  });

  it('un pan que le toit ajuste n explique pas ne porte pas de lucarne : ses bosses sont celles d un toit mal lu', () => {
    // Un bruit de 40 cm en damier sur tout le pan, et deux bosses dedans.
    const bruit = (x: number, y: number): number | null => chienAssis(5, 1.5)(x, y) ?? chienAssis(12, 1.5)(x, y) ?? (y < 4 ? pan(y) + (((Math.floor(x * 2) * 7 + Math.floor(y * 2) * 3) % 5) - 2) * 0.25 : null);
    expect(lucarnesDuCorps(grille(bruit), TOIT, RECT)).toEqual([]);
  });
});

describe('avecLucarnesLues', () => {
  const g = grille(plusieurs(chienAssis(5, 1.5), chienAssis(12, 1.5)));
  const vue: Lucarne = { type: 'jacobine', pan: 0, debutM: 9, finM: 10.2, faitageM: 5.6, profondeurM: 1.2, source: 'observation' };

  it('pose les lucarnes lues ; sans grille, ne touche a rien', () => {
    expect(avecLucarnesLues([TOIT], g, RECT)[0]?.lucarnes).toHaveLength(2);
    expect(avecLucarnesLues([TOIT], null, RECT)[0]).toBe(TOIT);
  });

  it('un corps qui porte une lucarne vue ou posee garde les siennes : la mesure n y ajoute rien', () => {
    expect(avecLucarnesLues([{ ...TOIT, lucarnes: [vue] }], g, RECT)[0]?.lucarnes).toEqual([vue]);
  });

  it('relue, la mesure remplace ses propres lucarnes, et les retire quand elle n en montre plus', () => {
    const lues = avecLucarnesLues([TOIT], g, RECT);
    expect(avecLucarnesLues(lues, g, RECT)).toEqual(lues);
    expect(avecLucarnesLues(lues, grille(), RECT)[0]?.lucarnes).toBeUndefined();
  });
});

describe('Hardencourt 6501004, la longere du 11 route du Guesclin', () => {
  const d = JSON.parse(readFileSync(new URL('../../../fixtures/toits/hardencourt-6501004.json', import.meta.url), 'utf8')) as { contour: PtBrut[]; grille: Parameters<typeof toitMesureDepuisGrille>[0] };
  // Le batiment de l'aile (6500957), accole au mur de la cour au bout sud-ouest.
  const AILE = [p(-4.661, -45.979), p(-8.288, -49.456), p(-11.559, -46.126), p(-8.037, -42.45)];
  const corps = corpsCalcules(toitMesureDepuisGrille(d.grille, d.contour)!, d.contour, { grille: d.grille })!;

  it('trois chiens-assis sur le pan de la cour, a leur place ; rien sur le pan de la rue', () => {
    const lues = avecLucarnesLues(corps, d.grille, d.contour, [AILE])[0]?.lucarnes ?? [];
    expect(lues.map((l) => [l.type, l.pan, l.debutM, l.finM])).toEqual([['chien-assis', 0, 8.5, 10.5], ['chien-assis', 0, 13.5, 15], ['chien-assis', 0, 17.5, 19]]);
    // Sous le faitage que la mesure montre (6,7 m), au-dessus de l'egout (4,9 m).
    for (const l of lues) { expect(l.faitageM).toBeGreaterThan(5.9); expect(l.faitageM).toBeLessThanOrEqual(6.5); expect(l.source).toBe('lidar'); }
  });

  it('la bosse du coin, ou le toit de l aile entre dans le pan, n est pas une lucarne, meme sans connaitre l aile', () => {
    const lues = avecLucarnesLues(corps, d.grille, d.contour)[0]?.lucarnes ?? [];
    expect(lues.every((l) => l.debutM >= 6)).toBe(true);
  });
});

describe('ce que la lecture fait de ses lucarnes', () => {
  const lue: Lucarne = { type: 'chien-assis', pan: 0, debutM: 5, finM: 6.5, faitageM: 5.8, profondeurM: 2, source: 'lidar' };
  const vue: Lucarne = { type: 'jacobine', pan: 0, debutM: 9, finM: 10.2, faitageM: 5.6, profondeurM: 1.2, source: 'observation' };

  it('une lucarne lue n est pas un element pose : la lecture peut reecrire les elements du toit ; une lucarne vue le lui interdit', () => {
    const bat = (l: Lucarne) => ({ fonction: 'batiment', batiment: { corpsToit: [{ ...TOIT, lucarnes: [l] }] } });
    expect(ecrivainPeut(bat(lue), 'lidar', 'elements')).toBe(true);
    expect(ecrivainPeut(bat(vue), 'lidar', 'elements')).toBe(false);
  });

  it('a la relecture, une lucarne vue l emporte sur celles que la mesure vient de lire sur le corps neuf', () => {
    const neuf: CorpsToit = { ...TOIT, pts: RECT.map((q) => ({ ...q })), lucarnes: [lue] };
    expect(reporterElements([{ ...TOIT, lucarnes: [vue] }], [neuf])[0]?.lucarnes).toEqual([vue]);
  });

  it('le raccord garde les lucarnes a leur place quand il prolonge une aile, et retire celles qu une aile recouvre', () => {
    // Un corps de 20 x 6 m, une aile de 5 m de large au sud, au milieu (un T) : l'aile entre de 3 m dans le pan.
    const principal: CorpsToit = { pts: [p(0, 0), p(20, 0), p(20, 6), p(0, 6)], posFaitage: 3, faitage: 7, egouts: [4, 4], pignons: [], ecart: 0.1, lucarnes: [{ ...lue, debutM: 9, finM: 11 }, { ...lue, debutM: 15, finM: 16.5 }] };
    const aile: CorpsToit = { pts: [p(8, 0), p(8, -8), p(13, -8), p(13, 0)], posFaitage: 2.5, faitage: 7, egouts: [4, 4], pignons: [], ecart: 0.1, lucarnes: [{ ...lue, pan: 1, debutM: 3, finM: 4.5 }] };
    const r = raccorderLesToits([{ cle: 'a', corps: [principal] }, { cle: 'w', corps: [aile] }]);
    expect(r.get('a')?.[0]?.lucarnes?.map((l) => l.debutM)).toEqual([15]);
    // L'aile, prolongee de 3 m a son bout `s = 0` : sa lucarne a 3 m du bout d'origine est a 6 m du nouveau.
    expect(r.get('w')?.[0]?.lucarnes?.map((l) => [l.debutM, l.finM])).toEqual([[6, 7.5]]);
  });
});
