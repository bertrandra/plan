import { describe, it, expect } from 'vitest';
import { redresserParFuites, redresserParReperes, fuitesDesReperes, inverser, focaleDeLaPhotoParFuites } from '../../../../src/facade/vision/redressementFuites.js';
import { mosaiqueDesVues } from '../../../../src/facade/vision/mosaiqueFuites.js';
import { detecterSegments } from '../../../../src/facade/vision/segments.js';
import { appliquer, homographie, type P2 } from '../../../../src/facade/vision/homographie.js';
import { appliquerSimilitude } from '../../../../src/facade/vision/ransac.js';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { photographier, coinsVrais, type PriseCamera, type SceneFacade } from '../../../banc/facades/synthese.js';

// Le redressement par les points de fuite (sans les coins du mur) et l'assemblage des vues redressees, sur les scenes du banc :
// les photos reelles de la calibration (Hardencourt, octobre 2026) ne montrent pas le mur entier, et le calage par les coins y
// prenait une fenetre pour le mur.

const scene = (debut: string): SceneFacade => {
  const s = chargerCorpus().find((c) => c.nom.startsWith(debut));
  if (!s) throw new Error('scene absente');
  return s;
};

/** La vue redressee d'une prise, et les coins vrais du mur sur cette vue. */
function redressee(s: SceneFacade, p: PriseCamera, focaleConnue: boolean) {
  const ph = photographier(s, 100, p), coins = coinsVrais(s, p);
  if (!ph || !coins) throw new Error('prise impossible');
  const r = redresserParFuites(ph.image, detecterSegments(ph.image), focaleConnue ? ph.focalePx : null);
  if (!r) throw new Error('pas de redressement');
  const versVue = inverser(r.versPhoto);
  if (!versVue) throw new Error('homographie singuliere');
  return { r, coins: coins.map((c) => appliquer(versVue, c)) };
}

describe('le redressement par les points de fuite', () => {
  it('rend le mur pris de biais rectangle, a ses proportions quand la focale est connue', () => {
    const s = scene('08-');
    const { r, coins } = redressee(s, s.synthese.prise as PriseCamera, true);
    expect(r.horizontale).toBe(true);
    const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
    const largeur = hd.x - hg.x;
    // Les cotes du mur verticaux, l'egout et le pied horizontaux, a 1 % de la largeur pres.
    expect(Math.abs(hg.x - bg.x) / largeur).toBeLessThan(0.01);
    expect(Math.abs(hd.x - bd.x) / largeur).toBeLessThan(0.01);
    expect(Math.abs(hg.y - hd.y) / largeur).toBeLessThan(0.01);
    expect(Math.abs(bg.y - bd.y) / largeur).toBeLessThan(0.01);
    // Les proportions du mur, a 3 % pres.
    expect(((bg.y - hg.y) / largeur) / (s.verite.hauteur / s.verite.largeur)).toBeCloseTo(1, 1);
  });

  it('garde verticales et horizontales droites avec la focale d un telephone suppose', () => {
    const s = scene('08-');
    const { coins } = redressee(s, s.synthese.prise as PriseCamera, false);
    const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
    const largeur = hd.x - hg.x;
    expect(Math.abs(hg.x - bg.x) / largeur).toBeLessThan(0.015);
    expect(Math.abs(hg.y - hd.y) / largeur).toBeLessThan(0.015);
    expect(Math.abs(bg.y - bd.y) / largeur).toBeLessThan(0.015);
  });
});

describe('l assemblage des vues redressees', () => {
  it('recale trois vues du meme mur, de face et de biais, au meme endroit', () => {
    const s = scene('16-');
    const prises = [s.synthese.prise as PriseCamera, ...(s.synthese.vues ?? [])];
    const vues = prises.map((p) => redressee(s, p, false));
    const m = mosaiqueDesVues(vues.map((v) => v.r));
    expect(m?.groupes.assemblees).toEqual([0, 1, 2]);
    // Chaque coin vrai du mur, porte de chaque vue dans la mosaique, tombe au meme endroit a 2 % de la largeur pres.
    const places = vues.map((v, i) => v.coins.map((c) => appliquerSimilitude(m?.places[i] as never, c)));
    const largeur = (places[0]?.[1]?.x ?? 0) - (places[0]?.[0]?.x ?? 0);
    for (let i = 1; i < places.length; i++) {
      for (let k = 0; k < 4; k++) {
        const a = places[0]?.[k] as P2, b = places[i]?.[k] as P2;
        expect(Math.hypot(a.x - b.x, a.y - b.y) / largeur).toBeLessThan(0.02);
      }
    }
  });
});

describe('la focale lue sur les points de fuite', () => {
  it('se lit sur une photo prise vers le haut et de biais, a 10 % pres', () => {
    // Grand-angle (19 mm), une focale que l'appareil ne donne pas : celle d'un telephone (67 degres) se tromperait de 60 %.
    const s = scene('14-');
    const ph = photographier(s, 100, s.synthese.prise as PriseCamera);
    if (!ph?.focalePx) throw new Error('prise impossible');
    const f = focaleDeLaPhotoParFuites(detecterSegments(ph.image), ph.image.largeur, ph.image.hauteur);
    expect(f).not.toBeNull();
    expect(Math.abs((f as number) / ph.focalePx - 1)).toBeLessThan(0.1);
  });

  it('ne se dit pas sur une photo d aplomb et de face : les points de fuite sont a l infini', () => {
    const s = scene('02-');
    const ph = photographier(s, 100, s.synthese.prise as PriseCamera);
    if (!ph) throw new Error('prise impossible');
    expect(focaleDeLaPhotoParFuites(detecterSegments(ph.image), ph.image.largeur, ph.image.hauteur)).toBeNull();
    expect(redresserParFuites(ph.image, detecterSegments(ph.image))?.sourceFocale).toBe('defaut');
  });
});

describe('le redressement par quatre reperes poses a la main', () => {
  // Les reperes ne sont pas les coins du mur : les coins d'une fenetre (un rectangle du mur, n'importe lequel).
  const prise = () => {
    const s = scene('08-'), p = s.synthese.prise as PriseCamera;
    const ph = photographier(s, 100, p), coins = coinsVrais(s, p);
    if (!ph || !coins) throw new Error('prise impossible');
    const { largeur: L, hauteur: H } = s.verite;
    // Le mur (x depuis la gauche, y depuis le sol) -> la photo, par ses coins vrais.
    const murVersPhoto = homographie([{ x: 0, y: H }, { x: L, y: H }, { x: L, y: 0 }, { x: 0, y: 0 }], coins);
    if (!murVersPhoto) throw new Error('homographie');
    const f = s.verite.ouvertures[0] as { x: number; y: number; l: number; h: number };
    const fenetre = [{ x: f.x, y: f.y + f.h }, { x: f.x + f.l, y: f.y + f.h }, { x: f.x + f.l, y: f.y }, { x: f.x, y: f.y }].map((q) => appliquer(murVersPhoto, q));
    return { ph, coins, fenetre };
  };

  it('rend droites les verticales et les horizontales du mur entier, sans couper la photo', () => {
    const { ph, coins, fenetre } = prise();
    const r = redresserParReperes(ph.image, fenetre);
    expect(r).not.toBeNull();
    const versVue = inverser((r as NonNullable<typeof r>).versPhoto) as NonNullable<ReturnType<typeof inverser>>;
    const [hg, hd, bd, bg] = coins.map((c) => appliquer(versVue, c)) as [P2, P2, P2, P2];
    const largeur = hd.x - hg.x;
    // Les bouts du mur verticaux, l'egout et le pied horizontaux, alors que seuls les coins d'une fenetre ont ete poses.
    expect(Math.abs(hg.x - bg.x) / largeur).toBeLessThan(0.01);
    expect(Math.abs(hd.x - bd.x) / largeur).toBeLessThan(0.01);
    expect(Math.abs(hg.y - hd.y) / largeur).toBeLessThan(0.01);
    expect(Math.abs(bg.y - bd.y) / largeur).toBeLessThan(0.01);
    // Rien n'est coupe au mur : l'image garde la surface de la photo, et le mur entier y tient.
    const img = (r as NonNullable<typeof r>).image;
    expect(img.largeur * img.hauteur).toBeGreaterThan(0.8 * ph.image.largeur * ph.image.hauteur);
    for (const q of [hg, hd, bd, bg]) { expect(q.x).toBeGreaterThan(0); expect(q.x).toBeLessThan(img.largeur); expect(q.y).toBeGreaterThan(0); expect(q.y).toBeLessThan(img.hauteur); }
  });

  it('refuse des reperes degeneres', () => {
    const { ph } = prise();
    expect(redresserParReperes(ph.image, [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }])).toBeNull();
    expect(fuitesDesReperes([{ x: 0, y: 0 }])).toBeNull();
  });
});
