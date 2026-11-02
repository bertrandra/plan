import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { facadePeinte, gabaritVrai, peindreElevation, photographier, type PriseCamera, type SceneFacade } from '../../banc/facades/synthese.js';
import { mesurerDetection } from '../../banc/facades/mesure.js';
import { detecterDansLaSilhouette, silhouetteDansLeCadre } from '../../../src/facade/analyse.js';
import { analyserLeMur } from '../../../src/facade/analyseMur.js';
import { gabaritSurLaPhoto } from '../../../src/facade/gabaritMur.js';

// Le mur de la detection est la facade complete redressee, pignons compris (demande du proprietaire, 2 novembre 2026) : la detection
// cherche dans la silhouette du gabarit, au-dessus de l'egout aussi, et jamais dans le ciel a cote des rampants.
const corpus = chargerCorpus();
const scene = (debut: string): SceneFacade => corpus.find((s) => s.nom.startsWith(debut))!;
const s24 = scene('24-');
const baieDuPignon = s24.verite.ouvertures.find((o) => o.y > s24.verite.hauteur)!;
const px = s24.synthese.pxParM ?? 100;

describe('silhouetteDansLeCadre', () => {
  it('sans silhouette, le rectangle du mur : tout ce qui est sous l egout, rien au-dessus', () => {
    const d = silhouetteDansLeCadre(10, 8, 3, null);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) expect(d[y * 10 + x]).toBe(y >= 3 ? 1 : 0);
  });
  it('sous un pignon, monte au-dessus de l egout au milieu et reste a l egout aux bouts', () => {
    // Un mur de 4 rangees sous l'egout (rangee 4), un pignon d'une demi-hauteur de mur au milieu.
    const d = silhouetteDansLeCadre(20, 8, 4, [{ u: 0, v: 1 }, { u: 0.5, v: 1.5 }, { u: 1, v: 1 }]);
    const haut = (x: number) => { for (let y = 0; y < 8; y++) if (d[y * 20 + x]) return y; return 8; };
    expect(haut(10)).toBe(2);
    expect(haut(0)).toBe(4);
    expect(haut(19)).toBe(4);
  });
});

describe('detecterDansLaSilhouette', () => {
  it('trouve la baie du pignon au-dessus de l egout et la garde a sa place dans le repere du mur', () => {
    const f = facadePeinte(s24, peindreElevation(s24, px, false), px);
    const d = detecterDansLaSilhouette(f.image, null, f.dedans, px);
    const m = mesurerDetection(s24.verite.ouvertures, d.ouvertures);
    expect(m.rappel).toBe(1);
    expect(m.precision).toBe(1);
    const trouvee = d.ouvertures.find((o) => o.y > s24.verite.hauteur);
    expect(trouvee).toBeTruthy();
    expect(Math.abs(trouvee!.x - baieDuPignon.x)).toBeLessThan(0.05);
    expect(Math.abs(trouvee!.y - baieDuPignon.y)).toBeLessThan(0.05);
  });
  it('sous le rectangle du mur (coupe a l egout, comme avant), la baie du pignon est manquee', () => {
    const f = facadePeinte(s24, peindreElevation(s24, px, false), px);
    const egout = f.image.hauteur - Math.round(s24.verite.hauteur * px);
    const d = detecterDansLaSilhouette(f.image, null, silhouetteDansLeCadre(f.image.largeur, f.image.hauteur, egout, null), px);
    expect(d.ouvertures.some((o) => o.y > s24.verite.hauteur)).toBe(false);
    expect(mesurerDetection(s24.verite.ouvertures, d.ouvertures).rappel).toBeCloseTo(5 / 6, 9);
  });
  it('ne trouve rien hors de la silhouette : une fenetre du voisin vue dans le ciel, a cote du rampant, reste ignoree', () => {
    const f = facadePeinte(s24, peindreElevation(s24, px, false), px);
    const { largeur: L, hauteur: H, donnees } = f.image;
    const img = { largeur: L, hauteur: H, donnees: donnees.slice() };
    // Le ciel en bleu clair, et une baie sombre peinte dedans, dans le coin haut gauche, au-dessus du rampant.
    for (let i = 0; i < L * H; i++) if (!f.dedans[i]) { img.donnees[i * 4] = 170; img.donnees[i * 4 + 1] = 200; img.donnees[i * 4 + 2] = 235; img.donnees[i * 4 + 3] = 255; }
    const x0 = Math.round(0.3 * px), x1 = Math.round(1.3 * px), y0 = Math.round(0.4 * px), y1 = Math.round(1.6 * px);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { expect(f.dedans[y * L + x]).toBe(0); const o = (y * L + x) * 4; img.donnees[o] = 40; img.donnees[o + 1] = 45; img.donnees[o + 2] = 55; }
    const dansLeCiel = (o: { x: number; l: number; y: number; h: number }) => o.x < 1.5 && o.y + o.h > s24.verite.hauteur + 1;
    // Sans silhouette (tout le cadre), la fausse baie est prise : le test la verrait.
    expect(detecterDansLaSilhouette(img, null, new Uint8Array(L * H).fill(1), px).ouvertures.some(dansLeCiel)).toBe(true);
    // Dans la silhouette : ni elle, ni aucune baie dont le centre sort de la silhouette.
    const d = detecterDansLaSilhouette(img, null, f.dedans, px);
    expect([...d.ouvertures, ...d.devinees].some(dansLeCiel)).toBe(false);
    for (const o of [...d.ouvertures, ...d.devinees]) {
      const cx = Math.floor((o.x + o.l / 2) * px), cy = Math.floor(H - (o.y + o.h / 2) * px);
      expect(f.dedans[cy * L + cx]).toBe(1);
    }
    expect(mesurerDetection(s24.verite.ouvertures, d.ouvertures).rappel).toBe(1);
  });
});

describe('analyserLeMur, la facade entiere', () => {
  it('une photo : la detection lit la facade redressee entiere (le pignon compris, rien n est coupe a l egout) et y trouve la baie du pignon', () => {
    const p = s24.synthese.prise as PriseCamera;
    const ph = photographier(s24, px, p)!;
    const coins = s24.verite.coins!;
    const mur = { largeur: s24.verite.largeur, hauteur: s24.verite.hauteur, contour: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }], cote: 0, distance: p.distance };
    const a = analyserLeMur(mur, [{ photo: ph.image, coins, focalePx: ph.focalePx, silhouette: gabaritSurLaPhoto(gabaritVrai(s24), coins) }], 'vues')!;
    const f = a.r.facade;
    // Le cadre de la texture, entier : plus haut que le mur seul, et le mur seul en est le bas, pixel pour pixel.
    expect(f.image.largeur).toBe(a.r.texture.largeur);
    expect(f.image.hauteur).toBe(a.r.texture.hauteur);
    expect(f.image.hauteur).toBeGreaterThan(a.r.elevation.hauteur);
    const decalage = (f.image.hauteur - a.r.elevation.hauteur) * f.image.largeur * 4;
    expect(f.image.donnees.subarray(decalage)).toEqual(a.r.elevation.donnees);
    // La silhouette monte au-dessus de l'egout au milieu du pignon.
    const egout = f.image.hauteur - a.r.elevation.hauteur, milieu = Math.floor(f.image.largeur / 2);
    expect(f.dedans[(egout - Math.round(1.5 * a.r.pxParM)) * f.image.largeur + milieu]).toBe(1);
    expect(f.dedans[(egout - Math.round(1.5 * a.r.pxParM)) * f.image.largeur + 2]).toBe(0);
    expect(mesurerDetection(s24.verite.ouvertures, a.r.ouvertures).rappel).toBe(1);
    expect(a.r.ouvertures.some((o) => o.y > s24.verite.hauteur)).toBe(true);
    // Sans gabarit (un rectangle), le pignon n'est pas cherche.
    const sans = analyserLeMur(mur, [{ photo: ph.image, coins, focalePx: ph.focalePx }], 'vues')!;
    expect(sans.r.ouvertures.some((o) => o.y > s24.verite.hauteur)).toBe(false);
  }, 60000);
});
