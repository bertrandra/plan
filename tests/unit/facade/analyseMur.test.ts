import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { coinsVrais, photographier, type PriseCamera } from '../../../src/facade/banc/synthese.js';
import { mesurerDetection } from '../../banc/facades/mesure.js';
import { analyserLAssemblage, analyserLeMur, assemblerLeMur } from '../../../src/facade/analyseMur.js';

// Plusieurs vues du mur entier : l'assemblage pose le mur, la fusion des memes photos en compose l'image (vote, occultations).
// Scene 16 : une voiture devant le mur, trois vues ; la voiture cache des baies sur l'une, pas sur les autres.
const s = chargerCorpus().find((x) => x.nom.startsWith('16-'))!;
const p = s.synthese.prise as PriseCamera, px = s.synthese.pxParM ?? 100, v = s.verite;
const principale = photographier(s, px, p)!;
const photos = [{ photo: principale.image, coins: v.coins!, focalePx: principale.focalePx }, ...(s.synthese.vues ?? []).map((q) => {
  const a = photographier(s, px, q)!, [dx, dy] = q.decalageCoins ?? [0, 0];
  return { photo: a.image, coins: coinsVrais(s, q)!.map((k) => ({ x: k.x + dx, y: k.y + dy })), focalePx: a.focalePx };
})];
const mur = { largeur: v.largeur, hauteur: p.hauteurEstimee ?? v.hauteur, contour: [{ x: 0, y: 0 }, { x: v.largeur, y: 0 }, { x: v.largeur, y: 6 }, { x: 0, y: 6 }], cote: 0, distance: p.distance };

/** Le mur dans le cadre de la facade : ses colonnes (depuis `x0`, `l` de large) et ses rangees du bas (`h`), octet pour octet. */
const murDuCadre = (f: { image: { largeur: number; hauteur: number; donnees: Uint8ClampedArray }; x0Px: number }, l: number, h: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(l * h * 4), L = f.image.largeur, y0 = f.image.hauteur - h;
  for (let y = 0; y < h; y++) out.set(f.image.donnees.subarray(((y0 + y) * L + f.x0Px) * 4, ((y0 + y) * L + f.x0Px + l) * 4), y * l * 4);
  return out;
};

describe('analyserLeMur, plusieurs vues assemblees', () => {
  it('fond les vues : l assemblage garde le mur, la fusion masque la voiture et retrouve toutes les baies', () => {
    const a = analyserLeMur(mur, photos, 'vues')!;
    expect(a.assemblage?.vues.every((x) => x.assemblee)).toBe(true);
    expect(a.fusion?.statut).toBe('fusionnee');
    expect(a.r).toBe(a.fusion);
    expect(a.fusion!.masque).toBeGreaterThan(0);
    // La detection lit la composition de la fusion entiere, dans le cadre de la facade : la boite de la silhouette (ici le mur) et sa
    // marge de 3 % de chaque cote, la bande au-dessus de l'egout ; rien n'est coupe a l'egout. Le mur en est le milieu, pixel pour pixel.
    const f = a.r.facade, marge = Math.round(0.03 * mur.largeur * a.r.pxParM);
    expect([f.x0Px, f.image.largeur, f.image.hauteur]).toEqual([marge, a.r.texture.largeur + 2 * marge, a.r.texture.hauteur]);
    expect(f.image.hauteur).toBeGreaterThan(a.r.elevation.hauteur);
    expect(murDuCadre(f, a.r.elevation.largeur, a.r.elevation.hauteur)).toEqual(a.r.elevation.donnees);
    const m = mesurerDetection(v.ouvertures, a.r.ouvertures);
    expect(m.rappel).toBe(1);
    // L'assemblage seul (sans vote ni occultation) en manque.
    const seul = analyserLAssemblage(mur, assemblerLeMur(photos)!)!;
    expect(mesurerDetection(v.ouvertures, seul.ouvertures).rappel!).toBeLessThan(m.rappel!);
  }, 120000);
  it('une photo seule reste l assemblage, sans fusion', () => {
    const a = analyserLeMur(mur, photos.slice(0, 1), 'vues')!;
    expect(a.assemblage).toBeTruthy();
    expect(a.fusion).toBeUndefined();
  }, 60000);
});
