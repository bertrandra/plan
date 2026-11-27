import { describe, it, expect } from 'vitest';
import { raccorderLesToits } from '../../../../src/facade/toits/raccord.js';
import { reconstruireCorps } from '../../../../src/facade/toits/toitCorps.js';
import { hauteurCorpsEn } from '../../../../src/facade/toits/toitCorps/ajustement.js';
import { toitMesureDepuisGrille } from '../../../../src/model/toitMesure.js';
import { SEUILS_TOITS as S } from '../../../../src/regles/toits/reglages.js';
import { readFileSync } from 'node:fs';
import type { CorpsToit, PtBrut } from '../../../../src/model/types.js';

// Le raccord des toits qui se touchent (MD/spec-toit-ign.md §13.10). Une maison en L : un corps de 20 x 6 m le long de x, une aile
// de 5 m de large qui part vers le sud au bout ouest. Le proprietaire (Hardencourt, 27 novembre 2026) : « une maison en L avec
// des faitages centres, les deux corps fusionnent ».
const p = (x: number, y: number): PtBrut => ({ x, y });
const corps = (pts: PtBrut[], posFaitage: number, faitage: number, e: number, pignons: CorpsToit['pignons'] = []): CorpsToit => ({ pts, posFaitage, faitage, egouts: [e, e], pignons, ecart: 0.1 });
// Le corps principal : faitage a y = 3, pan 0 au sud (y = 0), pan 1 au nord.
const PRINCIPAL = [p(0, 0), p(20, 0), p(20, 6), p(0, 6)];
// L'aile : de y = 0 (contre le mur sud du principal) a y = -8, faitage a x = 2,5. pts[0]->pts[1] descend vers le sud.
const AILE = [p(0, 0), p(0, -8), p(5, -8), p(5, 0)];

describe('le raccord en equerre', () => {
  it('au coin, memes hauteurs lues a 40 cm pres : un retour d angle, memes faitages, memes egouts, deux croupes, aucun pignon', () => {
    const faux = { pan: 0 as const, debut: 1, fin: 4, faitage: 6.9, profondeur: 3 };
    const r = raccorderLesToits([{ cle: 'a', corps: [corps(PRINCIPAL, 3, 7, 4, [faux])] }, { cle: 'w', corps: [corps(AILE, 2.5, 6.6, 4.2)] }]);
    const a = r.get('a')![0]!, w = r.get('w')![0]!;
    // Les deux faitages a la meme altitude, les memes egouts : ceux du plus grand corps.
    expect([a.faitage, w.faitage]).toEqual([7, 7]);
    expect([a.egouts, w.egouts]).toEqual([[4, 4], [4, 4]]);
    // Le corps se ferme au coin par une croupe jusqu'au faitage de l'aile ; l'aile traverse le corps et s'y ferme par une croupe.
    expect(a.croupes).toEqual([2.5, 0]);
    expect(w.croupes).toEqual([2.95, 0]);
    expect(w.pts[0]).toEqual(p(0, 5.95));
    expect(w.pts[3]).toEqual(p(5, 5.95));
    // Le pignon lu sur le pan, en face de l'aile, etait le toit de l'aile.
    expect(a.pignons).toEqual([]);
    // Au coin exterieur, un aretier : sur la diagonale, les deux toits ont la meme hauteur ; au coin interieur, la noue.
    // (le coin exterieur est en (0, 6) ; l'aretier ou 1,2 x = 6 - y ; l'aile s'arrete 5 cm avant le mur du fond.)
    for (const d of [0.5, 1.5, 2.4]) {
      const y = 6 - 1.2 * d, surA = hauteurCorpsEn(a, 20, 6, d, y), surW = hauteurCorpsEn(w, 13.95, 5, 5.95 - y, d);
      expect(surA).toBeCloseTo(4 + 1.2 * d, 2);
      expect(Math.abs(surA - surW)).toBeLessThan(0.1);
    }
    // Et le raccord refait sur ses propres sorties ne change plus rien.
    expect(raccorderLesToits([{ cle: 'a', corps: [a] }, { cle: 'w', corps: [w] }]).size).toBe(0);
  });

  it('au milieu du corps (un T), l aile se prolonge jusqu au faitage, sans croupe ; une aile plus basse, jusqu ou son faitage rencontre le pan', () => {
    const aileT = [p(8, 0), p(8, -8), p(13, -8), p(13, 0)];
    const t = raccorderLesToits([{ cle: 'a', corps: [corps(PRINCIPAL, 3, 7, 4)] }, { cle: 'w', corps: [corps(aileT, 2.5, 7, 4)] }]);
    expect(t.has('a')).toBe(false);
    expect(t.get('w')![0]!.pts[0]).toEqual(p(8, 3));
    expect(t.get('w')![0]!.croupes).toBeUndefined();
    const bas = raccorderLesToits([{ cle: 'a', corps: [corps(PRINCIPAL, 3, 7, 4)] }, { cle: 'w', corps: [corps(aileT, 2.5, 5.5, 4)] }]);
    expect(bas.get('w')![0]!.pts[0]).toEqual(p(8, 1.5));
    expect(bas.get('w')![0]!.faitage).toBe(5.5);
  });

  it('des hauteurs qui ne s accordent pas, un toit asymetrique, des corps qui ne se touchent pas : rien ne change', () => {
    const loin = AILE.map((q) => p(q.x, q.y - 2));
    expect(raccorderLesToits([{ cle: 'a', corps: [corps(PRINCIPAL, 3, 7, 4)] }, { cle: 'w', corps: [corps(loin, 2.5, 7, 4)] }]).size).toBe(0);
    const asym: CorpsToit = { ...corps(AILE, 2.5, 7, 4), egouts: [4, 5.5] };
    expect(raccorderLesToits([{ cle: 'a', corps: [corps(PRINCIPAL, 3, 7, 4)] }, { cle: 'w', corps: [asym] }]).size).toBe(0);
    // Un faitage a 1,5 m sous l'autre reste a sa hauteur : l'aile entre dans le pan, pas de retour d'angle.
    const r = raccorderLesToits([{ cle: 'a', corps: [corps(PRINCIPAL, 3, 7, 4)] }, { cle: 'w', corps: [corps(AILE, 2.5, 5.5, 4)] }]);
    expect(r.get('w')![0]!.faitage).toBe(5.5);
    expect(r.get('a')?.[0]?.croupes).toBeUndefined();
  });
});

describe('le raccord bout a bout', () => {
  it('un corps qui en prolonge un autre, trace 60 cm a cote, s aligne sur lui mur pour mur : la meme ligne de faitage et d egout', () => {
    // Le proprietaire (Hardencourt) : « il s'agit du meme batiment qui est aligne ».
    const bout = [p(20.3, 0.6), p(26, 0.6), p(26, 6.4), p(20.3, 6.4)];
    const r = raccorderLesToits([{ cle: 'a', corps: [corps(PRINCIPAL, 3, 7, 4)] }, { cle: 'w', corps: [corps(bout, 2.6, 6.7, 3.6)] }]);
    expect(r.has('a')).toBe(false);
    expect(r.get('w')![0]).toMatchObject({ pts: [p(20, 0), p(26, 0), p(26, 6), p(20, 6)], posFaitage: 3, faitage: 7, egouts: [4, 4] });
  });
});

describe('un corps plus bas garde son toit', () => {
  it('au bout d un corps, un batiment aux murs plus bas n en prend ni le faitage ni les egouts, meme si le haut mesure de son rectangle le dit aussi haut', () => {
    // Le proprietaire (Hardencourt 6501003) : « sur la partie droite le batiment est plus bas, il faut le respecter ».
    const bout = [p(20.3, 0.6), p(26, 0.6), p(26, 6.4), p(20.3, 6.4)];
    const bas = corps(bout, 2.9, 5.8, 3.1);
    // Le toit du grand corps entre dans le rectangle du petit : son haut mesure (6,9 m) est celui du voisin, pas le sien.
    const r = raccorderLesToits([{ cle: 'a', corps: [corps(PRINCIPAL, 3, 7, 4)], hauts: [7] }, { cle: 'w', corps: [bas], hauts: [6.9] }]);
    expect(r.size).toBe(0);
  });
});

describe('une bosse etroite n est pas un pignon', () => {
  it('Hardencourt 6501004 : la longere n a plus de pignon de 1,5 m monte au faitage ; AE 101 garde les siens (2,0 et 2,9 m)', () => {
    const lire = (f: string) => { const d = JSON.parse(readFileSync(new URL(`../../../fixtures/toits/${f}.json`, import.meta.url), 'utf8')); return reconstruireCorps(d.toitMesure ?? toitMesureDepuisGrille(d.grille, d.contour)!, d.contour, { grille: d.grille })!; };
    expect(lire('hardencourt-6501004').flatMap((c) => c.pignons)).toEqual([]);
    const ae101 = lire('vesinet-ae101')[0]!.pignons;
    expect(ae101).toHaveLength(2);
    for (const g of ae101) expect(g.fin - g.debut).toBeGreaterThanOrEqual(S.LARGEUR_PIGNON_LU_MIN_M - 1e-6);
  });
});
