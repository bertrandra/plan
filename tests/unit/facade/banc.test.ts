import { describe, it, expect } from 'vitest';
import { chargerCorpus, rejouerCorpus, rejouerScene, tableau } from '../../banc/facades/banc.js';
import { coinsVrais, peindreElevation, murSeul, stenope, projeter, type SceneFacade } from '../../banc/facades/synthese.js';
import { apparier, recouvrement, mesurerDetection, erreurCoinsCm } from '../../banc/facades/mesure.js';
import { coinsProposes } from '../../../src/facade/analyse.js';

// Le banc de facades (spec-facades-calage-detection §14, lot L5) : il doit tourner, sa verite doit
// suivre son generateur, et les images de synthese d'origine doivent rester justes a 1 ou 2 cm.
// Les chiffres des scenes difficiles ne sont pas figes ici : c'est le tableau du banc qui les suit,
// avant et apres chaque lot qui touche la detection.

const corpus = chargerCorpus();
/** Une scene se peint, se photographie et s'analyse en une seconde environ : de la marge pour la CI. */
const LONG = 30_000;
const parNom = (debut: string): SceneFacade => {
  const s = corpus.find((c) => c.nom.startsWith(debut));
  if (!s) throw new Error('scene absente : ' + debut);
  return s;
};

describe('corpus de facades', () => {
  it('porte au moins dix scenes, aux noms uniques, chacune avec sa verite', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(10);
    expect(new Set(corpus.map((s) => s.nom)).size).toBe(corpus.length);
    for (const s of corpus) {
      expect(s.verite.ouvertures.length, s.nom).toBeGreaterThan(0);
      expect(s.difficultes.length, s.nom).toBeGreaterThan(0);
      for (const o of s.verite.ouvertures) {
        expect(o.x, s.nom).toBeGreaterThanOrEqual(0);
        expect(o.x + o.l, s.nom).toBeLessThanOrEqual(s.verite.largeur + 1e-9);
        expect(o.y + o.h, s.nom).toBeLessThanOrEqual(s.verite.hauteur + 1e-9);
      }
    }
  });

  it('couvre les difficultes du terrain', () => {
    const toutes = new Set(corpus.flatMap((s) => s.difficultes));
    for (const d of ['existante', 'brique', 'soubassement', 'ombre-debord', 'ombre-balcon', 'volets-battants', 'coffres', 'voiture', 'haie', 'biais-fort']) expect(toutes.has(d), d).toBe(true);
  });

  it('garde des coins vrais conformes au generateur (sinon : banc.ts --ecrire-coins)', () => {
    for (const s of corpus) {
      const c = coinsVrais(s);
      if (!c) {
        expect(s.verite.coins, s.nom).toBeNull();
        continue;
      }
      c.forEach((p, i) => {
        expect(Math.abs(p.x - (s.verite.coins?.[i]?.x ?? NaN)), s.nom).toBeLessThan(0.01);
        expect(Math.abs(p.y - (s.verite.coins?.[i]?.y ?? NaN)), s.nom).toBeLessThan(0.01);
      });
    }
  });
});

describe('generateur', () => {
  it('peint une ouverture a sa place, au centimetre', () => {
    const s = parNom('02-');
    const px = 100;
    const e = murSeul(s, peindreElevation(s, px, true), px);
    expect(e.largeur).toBe(1000);
    expect(e.hauteur).toBe(580);
    const o = s.verite.ouvertures[0]!;
    const lum = (xm: number, ym: number) => {
      const k = (Math.floor(e.hauteur - ym * px) * e.largeur + Math.floor(xm * px)) * 4;
      return e.donnees[k]! + e.donnees[k + 1]! + e.donnees[k + 2]!;
    };
    // Dans la vitre (sous les petits bois, au quart de la baie), c'est sombre ; a 2 cm du dormant, dehors, c'est le mur.
    expect(lum(o.x + o.l * 0.3, o.y + o.h * 0.2)).toBeLessThan(300);
    expect(lum(o.x - 0.02, o.y + o.h / 2)).toBeGreaterThan(550);
  });

  it('projette le mur la ou la camera le voit', () => {
    const s = parNom('02-');
    const p = s.synthese.prise;
    if (p?.type !== 'camera') throw new Error('prise camera attendue');
    const st = stenope(p, s.verite.largeur);
    // Face au mur, a hauteur d'oeil et au milieu : le centre de l'image si le telephone est d'aplomb.
    const c = projeter({ ...st, avant: [0, 1, 0], droite: [1, 0, 0], bas: [0, 0, -1] }, [s.verite.largeur / 2, 0, p.oeil ?? 1.5]);
    expect(c.x).toBeCloseTo(p.largeurPx / 2, 6);
    expect(c.y).toBeCloseTo(p.hauteurPx / 2, 6);
  });
});

describe('mesures', () => {
  it('apparie au recouvrement de plus de 50 %', () => {
    const v = { x: 0, y: 0, l: 1, h: 1 };
    expect(recouvrement(v, v)).toBe(1);
    expect(recouvrement(v, { x: 0.5, y: 0, l: 1, h: 1 })).toBeCloseTo(1 / 3, 9);
    expect(apparier([v], [{ x: 0.5, y: 0, l: 1, h: 1 }])).toEqual([]);
    expect(apparier([v], [{ x: 0.1, y: 0, l: 1, h: 1 }])).toEqual([[0, 0]]);
  });

  it('compte precision, rappel, cotes et gestes', () => {
    const vraies = [
      { type: 'fenetre' as const, x: 1, y: 1, l: 1, h: 1.2 },
      { type: 'porte' as const, x: 4, y: 0, l: 0.9, h: 2.1 },
    ];
    const m = mesurerDetection(vraies, [
      { type: 'fenetre', x: 1.02, y: 1, l: 1, h: 1.2 },
      { type: 'fenetre', x: 7, y: 1, l: 1, h: 1 },
    ]);
    expect([m.vp, m.fp, m.fn]).toEqual([1, 1, 1]);
    expect(m.precision).toBe(0.5);
    expect(m.rappel).toBe(0.5);
    expect(m.cotes).toEqual([2, 0, 0, 0]);
    // Une fausse a retirer, une manquee a ajouter ; la bonne est a 2 cm, sans geste.
    expect(m.corrections).toBe(2);
  });

  it('ramene l erreur des coins en centimetres sur le mur', () => {
    const vrais = [
      { x: 100, y: 100 },
      { x: 900, y: 100 },
      { x: 900, y: 500 },
      { x: 100, y: 500 },
    ];
    // 800 px pour 8 m : 1 px = 1 cm.
    const e = erreurCoinsCm([{ x: 110, y: 100 }, ...vrais.slice(1)], vrais, 8, 4);
    expect(e).toEqual([10, 0, 0, 0]);
  });
});

describe('banc', () => {
  it('rejoue les images de synthese d origine, justes a 1 ou 2 cm', () => {
    for (const s of corpus.filter((c) => c.difficultes.includes('existante'))) {
      const r = rejouerScene(s);
      for (const m of [r.elevation, r.photo]) {
        expect(m, s.nom).not.toBeNull();
        if (!m) continue;
        expect(m.precision, s.nom).toBe(1);
        expect(m.rappel, s.nom).toBe(1);
        expect(m.typesJustes, s.nom).toBe(m.vraies);
        expect(Math.max(...m.cotes), s.nom).toBeLessThanOrEqual(2);
      }
      expect(r.hauteurCm, s.nom).toBe(0);
    }
  }, LONG);

  it('tourne sur une scene difficile et ecrit le tableau', () => {
    const scenes = [parNom('00-'), parNom('03-')];
    const b = rejouerCorpus(scenes);
    expect(b.scenes).toHaveLength(2);
    expect(b.elevation.vraies).toBe(scenes.reduce((n, s) => n + s.verite.ouvertures.length, 0));
    // La brique a une prise camera : les coins proposes sont mesures.
    expect(b.scenes[1]!.coinsCm).toHaveLength(4);
    const t = tableau(b);
    for (const s of scenes) expect(t).toContain(s.nom);
    expect(t).toContain('Objectifs de la première version');
  }, LONG);

  it('mesure les coins proposes tels que analyse.ts les propose', () => {
    const s = parNom('02-');
    const p = s.synthese.prise;
    if (p?.type !== 'camera') throw new Error('prise camera attendue');
    const r = rejouerScene(s);
    const f = stenope(p, s.verite.largeur).f;
    expect(r.detail.coinsProposes).toEqual(coinsProposes(p.largeurPx, p.hauteurPx, f, p.distance, s.verite.largeur, s.verite.hauteur));
  }, LONG);
});
