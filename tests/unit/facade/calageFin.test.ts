import { describe, it, expect } from 'vitest';
import { calageFin, calageFinDuReleve, intersection, ligneParPoints, SEUIL_NOTE } from '../../../src/facade/calageFin.js';
import { biaisDepuisCap, incertitudeDuReleve, INCERTITUDE_BOUSSOLE_DEG, ECART_FOCALE_DEFAUT, type PriseReleve } from '../../../src/facade/calage.js';
import type { Image, P2 } from '../../../src/facade/homographie.js';
import { chargerCorpus, capteursSimules } from '../../banc/facades/banc.js';
import { photographier, stenope, type SceneFacade } from '../../banc/facades/synthese.js';

// Le calage fin (spec-facades-calage-detection §6, lot L7) : sur une photo de synthese prise avec les
// erreurs typiques d'un telephone, les coins se trouvent sur les aretes, au pixel pres ; un pied cache
// est predit et marque comme tel ; sans aretes, on revient aux coins predits ; une largeur du plan
// fausse de plus de 0,5 m se signale au lieu de tordre la facade.

const corpus = chargerCorpus();
const LONG = 30_000;
const parNom = (debut: string): SceneFacade => {
  const s = corpus.find((c) => c.nom.startsWith(debut));
  if (!s) throw new Error('scene absente : ' + debut);
  return s;
};

/** La photo d'une scene, et la prise du releve telle que le telephone la mesure (capteurs typiques). */
function releve(s: SceneFacade): { image: Image; prise: PriseReleve; coins: P2[] } {
  const p = s.synthese.prise;
  if (p?.type !== 'camera') throw new Error('prise camera attendue');
  const ph = photographier(s, 100);
  if (!ph || !s.verite.coins) throw new Error('photo attendue');
  const lu = capteursSimules(s, p, true);
  return {
    image: ph.image,
    prise: { largeurPx: p.largeurPx, hauteurPx: p.hauteurPx, focalePx: stenope(p, s.verite.largeur).f, distance: p.distance, biaisDeg: biaisDepuisCap(lu.capDeg, 180), inclinaisonDeg: lu.inclinaisonDeg, roulisDeg: lu.roulisDeg },
    coins: s.verite.coins,
  };
}

const ecartPx = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.y - b.y);

describe('droites', () => {
  it('coupe deux droites', () => {
    const l = ligneParPoints({ x: 0, y: 0 }, { x: 10, y: 10 });
    const m = ligneParPoints({ x: 0, y: 10 }, { x: 10, y: 0 });
    expect(l && m && intersection(l, m)).toEqual({ x: 5, y: 5 });
  });
});

describe('incertitudeDuReleve', () => {
  it('deplace l objectif le long du cercle de la distance, selon que le cap est lu ou non', () => {
    const r: PriseReleve = { largeurPx: 1000, hauteurPx: 750, focalePx: 900, distance: 12, biaisDeg: 5 };
    const avecCap = incertitudeDuReleve(r);
    expect(avecCap.azimutDeg).toBe(INCERTITUDE_BOUSSOLE_DEG);
    expect(avecCap.positionM).toBeCloseTo(2 * 12 * Math.sin((15 * Math.PI) / 360), 6);
    expect(incertitudeDuReleve({ ...r, biaisDeg: null }).positionM).toBeGreaterThan(avecCap.positionM);
    expect(incertitudeDuReleve({ ...r, focaleEstimee: true }).focale).toBe(ECART_FOCALE_DEFAUT);
  });
});

describe('calageFin', () => {
  it('trouve les quatre coins d une facade de face, au pixel pres, et corrige l attitude', () => {
    const s = parNom('02-');
    const { image, prise, coins } = releve(s);
    const r = calageFinDuReleve(image, s.verite.largeur, s.verite.hauteur, prise, { valeur: prise.distance, precisionM: 0.3 });
    expect(r.trouve).toBe(true);
    expect(r.note).toBeGreaterThanOrEqual(SEUIL_NOTE);
    expect(r.sources).toEqual(['trouve', 'trouve', 'trouve', 'trouve']);
    r.coins?.forEach((c, i) => expect(ecartPx(c, coins[i]!)).toBeLessThan(3));
    // Le tangage vrai est de 6 degres ; le telephone en annoncait un de plus ou de moins.
    expect(r.inclinaisonDeg).toBeCloseTo(6, 0);
    expect(r.hauteur).toBeCloseTo(s.verite.hauteur, 1);
    // La largeur du plan est la vraie : aucun decalage du contour.
    expect(r.contour?.decale).toBe(false);
  }, LONG);

  it('predit le pied cache par une haie, et le marque comme tel', () => {
    const s = parNom('12-');
    const { image, prise, coins } = releve(s);
    const r = calageFinDuReleve(image, s.verite.largeur, s.synthese.prise?.type === 'camera' ? (s.synthese.prise.hauteurEstimee ?? s.verite.hauteur) : s.verite.hauteur, prise);
    expect(r.trouve).toBe(true);
    expect(r.sources).toEqual(['trouve', 'trouve', 'predit', 'predit']);
    r.coins?.forEach((c, i) => expect(ecartPx(c, coins[i]!)).toBeLessThan(6));
  }, LONG);

  it('signale un contour decale quand la largeur vue s ecarte de plus de 0,5 m de celle du plan', () => {
    // Le plan dit 9,2 m pour un mur qui en fait 10 : la distance mesuree le trahit.
    const s = parNom('08-');
    const { image, prise } = releve(s);
    const r = calageFinDuReleve(image, 9.2, s.verite.hauteur, prise, { valeur: prise.distance, precisionM: 0.2 });
    expect(r.contour).not.toBeNull();
    expect(r.contour?.decale).toBe(true);
    expect(r.contour?.ecartM ?? 0).toBeGreaterThan(0.5);
  }, LONG);

  it('revient aux coins predits sur une photo sans aretes', () => {
    const l = 640,
      h = 480;
    const image: Image = { largeur: l, hauteur: h, donnees: new Uint8ClampedArray(l * h * 4).fill(180) };
    const mur = { gauche: { x: 0, y: 0 }, droite: { x: 10, y: 0 }, hauteur: 6 };
    const r = calageFin({
      image,
      mur,
      prise: { x: 5, y: -12, precisionM: 3, azimutDeg: 0, sourceAzimut: 'boussole', inclinaisonDeg: 5, roulisDeg: 0, focalePx: 600, largeurPx: l, hauteurPx: h, sourceFocale: 'exif' },
    });
    expect(r.trouve).toBe(false);
    expect(r.sources).toEqual(['predit', 'predit', 'predit', 'predit']);
    expect(r.coins).toHaveLength(4);
    expect(r.azimutCorrige).toBe(false);
  });
});
