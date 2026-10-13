import { describe, it, expect } from 'vitest';
import { coinsDePrise, consigneCoins, type Morceau, type Resultat } from '../../../src/zones/releve/serie.js';
import { etirerEnHauteur, releveDuMur, calageDeSerie, pxParMDuCalage, textePrecision } from '../../../src/zones/releve/analyse.js';
import { coinsProposes } from '../../../src/facade/analyse.js';
import type { Prise } from '../../../src/zones/releve/capteurs.js';
import type { Facade } from '../../../src/facade/geometrie.js';
import type { OuvertureFacade, Toit } from '../../../src/model/types.js';

// Le releve de facade, decoupe en etapes (zones/releve/) : ses calculs se testent sans React ni camera.

const prise = (plus: Partial<Prise> = {}): Prise => ({
  photo: { image: { largeur: 4000, hauteur: 3000 } as Prise['photo']['image'], url: '', champ: null, focalePx: 3000 },
  mesure: null, reperes: null, champ: 70, photosPrevues: null, ...plus
});
const resultat: Resultat = { partieBasse: null, texture: 'data:', hauteurTexture: 5, hauteurMesuree: true, couverture: 1, toitPropose: null, avis: null };

describe('releve : la serie de photos', () => {
  it('propose quatre coins, ramenes dans la marge que le doigt peut saisir', () => {
    const c = coinsDePrise(prise({ mesure: { distance: 1, source: 'cadrage' } as Prise['mesure'] }), 12, 6, false);
    expect(c).toHaveLength(4);
    const m = 4000 * 0.2;
    for (const q of c) {
      expect(q.x).toBeGreaterThanOrEqual(-m); expect(q.x).toBeLessThanOrEqual(4000 + m);
      expect(q.y).toBeGreaterThanOrEqual(-m); expect(q.y).toBeLessThanOrEqual(3000 + m);
    }
  });

  it('fait l emporter les reperes poses sur la video pour les bords du mur', () => {
    const c = coinsDePrise(prise({ reperes: { a: 0.8, b: 0.2 } as Prise['reperes'] }), 8, 6, false);
    expect(c[0]?.x).toBe(800); expect(c[3]?.x).toBe(800);
    expect(c[1]?.x).toBe(3200); expect(c[2]?.x).toBe(3200);
  });

  it('sans attitude ni cap, propose les coins centres d avant ; l inclinaison et le cap les deplacent', () => {
    const mesure = { distance: 9, source: 'cadrage' } as Prise['mesure'];
    const centres = coinsDePrise(prise({ mesure }), 8, 5, false);
    coinsProposes(4000, 3000, 3000, 9, 8, 5).forEach((q, i) => {
      expect(centres[i]!.x).toBeCloseTo(q.x, 6);
      expect(centres[i]!.y).toBeCloseTo(q.y, 6);
    });
    // Telephone leve de 6 degres : le mur descend dans l'image.
    const leve = coinsDePrise(prise({ mesure, attitude: { inclinaisonDeg: 6, roulisDeg: 0 } }), 8, 5, false);
    expect(leve[0]!.y).toBeGreaterThan(centres[0]!.y + 200);
    // Le cap dit le biais : la facade regarde au sud, on vise le nord-nord-ouest, on est a droite.
    const biais = coinsDePrise(prise({ mesure, cap: 340 }), 8, 5, false, 180);
    expect(biais[3]!.y - biais[0]!.y).toBeLessThan(biais[2]!.y - biais[1]!.y);
    // Sans l'azimut de la facade, le cap ne sert pas.
    expect(coinsDePrise(prise({ mesure, cap: 340 }), 8, 5, false)).toEqual(centres);
  });

  it('dit la consigne selon la place de la photo dans la serie', () => {
    expect(consigneCoins(0, 1)).toMatch(/^Placez chaque rond/);
    expect(consigneCoins(0, 3)).toMatch(/^Photo 1 sur 3.*coin gauche du mur/);
    expect(consigneCoins(2, 3)).toMatch(/^Photo 3 sur 3.*coin droit du mur/);
    expect(consigneCoins(1, 3)).toMatch(/près du bord de la photo/);
  });
});

describe('releve : la precision des cotes', () => {
  const coins = [{ x: 1000, y: 500 }, { x: 3000, y: 500 }, { x: 3000, y: 1500 }, { x: 1000, y: 1500 }];
  it('lit les pixels par metre au mur par la focale et la distance, sinon par les coins', () => {
    const avecDistance = calageDeSerie([{ prise: prise({ mesure: { distance: 10, source: 'cadrage' } as Prise['mesure'] }), coins }], 8, 4);
    expect(avecDistance.photos[0]!.pxParMSource).toBe(300);
    expect(avecDistance.photos[0]!.coins).toEqual(coins);
    // 2 000 px pour 8 m, 1 000 px pour 4 m : 250 px/m.
    const parCoins = calageDeSerie([{ prise: prise(), coins }], 8, 4);
    expect(parCoins.photos[0]!.pxParMSource).toBe(250);
    // Plusieurs photos sans distance : chacune ne montre qu'un morceau, on ne sait pas.
    expect(calageDeSerie([{ prise: prise(), coins }, { prise: prise(), coins }], 8, 4).photos.map((p) => p.pxParMSource)).toEqual([null, null]);
    expect(pxParMDuCalage({ photos: [{ coins, pxParMSource: 80 }, { coins, pxParMSource: 40 }, { coins, pxParMSource: null }] })).toBe(40);
    expect(pxParMDuCalage(null)).toBeNull();
  });

  it('annonce la precision d un pixel de la source au mur', () => {
    expect(textePrecision(40)).toBe("Cotes précises à environ 2,5 cm : la photo ne voyait le mur qu'à 40 pixels par mètre.");
    expect(textePrecision(150)).toBe('Cotes précises au centimètre : la photo voyait le mur à 150 pixels par mètre.');
    expect(textePrecision(null)).toBeNull();
  });
});

describe('releve : corriger et ecrire', () => {
  it('etire en hauteur seulement : ouvertures, partie basse et toit du meme facteur, au centimetre', () => {
    const ouvertures = [{ type: 'fenetre', x: 1, y: 1, l: 1.2, h: 1.25 }] as OuvertureFacade[];
    const toit = { forme: 'deuxPans', hauteur: 3 } as unknown as Toit;
    const e = etirerEnHauteur({ ...resultat, partieBasse: { debut: 0, fin: 2, hauteur: 2.5 } as unknown as Resultat['partieBasse'] }, ouvertures, toit, 1.2);
    expect(e.resultat.hauteurTexture).toBeCloseTo(6);
    expect(e.resultat.partieBasse?.hauteur).toBe(3);
    expect(e.ouvertures[0]).toMatchObject({ x: 1, l: 1.2, y: 1.2, h: 1.5 });
    expect(e.toit?.hauteur).toBe(3.6);
    expect(etirerEnHauteur(resultat, [], null, 2).toit).toBeNull();
  });

  it('ecrit le releve d un mur, distance et source comprises', () => {
    const facade = { cote: 2, largeur: 8.004 } as Facade;
    const r = releveDuMur(facade, resultat, [], 6.1, { distance: 4.567, source: 'cadrage' } as Prise['mesure'] & object);
    expect(r).toMatchObject({ cote: 2, largeur: 8, hauteur: 6.1, distance: 4.57, sourceDistance: 'cadrage', hauteurTexture: 5, ouvertures: [] });
    expect(releveDuMur(facade, resultat, [], 6, null)).toMatchObject({ distance: null, sourceDistance: null });
    // Le calage ne s'ecrit que s'il y en a un : un releve sans lui garde exactement sa forme d'avant.
    expect(releveDuMur(facade, resultat, [], 6, null)).not.toHaveProperty('calage');
    const calage = { photos: [{ coins: [{ x: 1, y: 2 }], pxParMSource: 55 }] };
    expect(releveDuMur(facade, { ...resultat, calage }, [], 6, null).calage).toEqual(calage);
  });
});

// Le type Morceau reste importable par les etapes : la serie s'ecrit d'une seule facon.
const _morceau: Morceau = { prise: prise(), coins: [] };
void _morceau;
