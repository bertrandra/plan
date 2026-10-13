import { describe, it, expect } from 'vitest';
import { analyserVues, centreOptique, transfert, recalage2D, recalageLineaire, type VuePhoto } from '../../../src/facade/fusion.js';
import { analyserReleve } from '../../../src/facade/analyse.js';
import { homographie, type Image } from '../../../src/facade/homographie.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { photographier, coinsVrais, stenope, cacheDepuis, type PriseCamera, type SceneFacade } from '../../banc/facades/synthese.js';
import { mesurerDetection } from '../../banc/facades/mesure.js';

// La fusion de plusieurs vues d'une facade (spec-facades-calage-detection §8, lot L13) : le centre
// optique tire de l'homographie, le transfert d'un point devant le mur d'une vue a l'autre, le
// recalage fin, et la fusion d'une scene du banc ou une haie cache une fenetre sur deux vues sur trois.

const LONG = 60_000;
const corpus = chargerCorpus();
const scene = (debut: string): SceneFacade => {
  const s = corpus.find((c) => c.nom.startsWith(debut));
  if (!s) throw new Error('scene absente : ' + debut);
  return s;
};
const contour = (L: number) => [
  { x: 0, y: 0 },
  { x: L, y: 0 },
  { x: L, y: 6 },
  { x: 0, y: 6 },
];

/** Les vues d'une scene du banc : la principale, puis les autres, coins vrais decales comme le dit la scene. */
function vuesDe(s: SceneFacade): VuePhoto[] {
  const prises = [s.synthese.prise as PriseCamera, ...(s.synthese.vues ?? [])];
  return prises.map((p) => {
    const ph = photographier(s, 100, p);
    const c = coinsVrais(s, p);
    if (!ph || !c) throw new Error('vue impossible');
    const [dx, dy] = p.decalageCoins ?? [0, 0];
    return { photo: ph.image, coins: c.map((q) => ({ x: q.x + dx, y: q.y + dy })), focalePx: ph.focalePx };
  });
}

describe('fusion : la geometrie des vues', () => {
  it('retrouve le centre optique d une prise dans le repere du mur', () => {
    const s = scene('17-');
    const p = s.synthese.vues?.[1] as PriseCamera;
    const c = coinsVrais(s, p);
    const ph = photographier(s, 20, p);
    if (!c || !ph?.focalePx) throw new Error('vue impossible');
    const { largeur: L, hauteur: H } = s.verite;
    const Hm = homographie(
      [
        { x: 0, y: 0 },
        { x: L, y: 0 },
        { x: L, y: H },
        { x: 0, y: H },
      ],
      c,
    );
    if (!Hm) throw new Error('homographie');
    const C = centreOptique(Hm, ph.focalePx, p.largeurPx / 2, p.hauteurPx / 2);
    const st = stenope(p, L);
    expect(C).not.toBeNull();
    // x le long du mur, y depuis l'egout vers le bas, z hors du plan (a la distance de l'objectif au mur).
    expect(C?.[0]).toBeCloseTo(st.C[0], 2);
    expect(C?.[1]).toBeCloseTo(H - st.C[2], 2);
    expect(Math.abs(C?.[2] ?? 0)).toBeCloseTo(-st.C[1], 2);
  });

  it('transfere un point devant le mur d une vue a l autre, et revient au point de depart', () => {
    const A: [number, number, number] = [5, 4, -10],
      B: [number, number, number] = [11, 4.2, -9];
    // Dans le plan du mur, rien ne bouge.
    const q0 = transfert(A, B, 3, 4.5, 0);
    expect(q0?.x).toBeCloseTo(3, 9);
    expect(q0?.y).toBeCloseTo(4.5, 9);
    // A 1,5 m devant le mur, le point vu en x = 3 depuis A est vu plus a gauche depuis B (a droite de A).
    const q = transfert(A, B, 3, 4.5, 1.5);
    if (!q) throw new Error('transfert');
    expect(q.x).toBeLessThan(3 - 0.5);
    const retour = transfert(B, A, q.x, q.y, 1.5);
    expect(retour?.x).toBeCloseTo(3, 9);
    expect(retour?.y).toBeCloseTo(4.5, 9);
    // Deux vues de part et d'autre du mur ne se comparent pas.
    expect(transfert(A, [5, 4, 10], 3, 4.5, 1)).toBeNull();
  });

  it('recale une elevation decalee de quelques centimetres, en x et en y', () => {
    const L = 400,
      H = 240;
    const motif = (x: number, y: number) => 120 + 60 * Math.sin(x / 9) * Math.cos(y / 13) + ((x * 7 + y * 13) % 11);
    const image = (dx: number, dy: number): { image: Image; vu: Uint8Array } => {
      const d = new Uint8ClampedArray(L * H * 4);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < L; x++) {
          const v = motif(x + dx, y + dy);
          d.set([v, v * 0.9, v * 0.8, 255], (y * L + x) * 4);
        }
      return { image: { largeur: L, hauteur: H, donnees: d }, vu: new Uint8Array(L * H).fill(1) };
    };
    // B est A lue 7 px plus a gauche et 4 px plus haut : B(x) = A(x - 7, y + 4).
    const A = image(0, 0),
      B = image(-7, 4);
    const r = recalage2D(A, B, 0, 100);
    expect(r.sx).toBe(7);
    expect(r.sy).toBe(-4);
    expect(r.score).toBeGreaterThan(0.95);
    const lin = recalageLineaire(A, B, 0, 100, r);
    expect(lin.sx + lin.bx * 200).toBeCloseTo(7, 0);
    expect(Math.abs(lin.bx)).toBeLessThan(0.01);
  });
});

describe('fusion : une haie devant une fenetre (scene 17 du banc)', () => {
  it(
    'retrouve la fenetre cachee sur deux vues sur trois, et rend le mur derriere la haie',
    () => {
      const s = scene('17-');
      const vues = vuesDe(s);
      const commun = { largeur: s.verite.largeur, hauteur: s.verite.hauteur, contour: contour(s.verite.largeur), cote: 0, distance: 11 };
      const seule = analyserReleve({ ...commun, ...(vues[0] as VuePhoto) });
      const f = analyserVues({ ...commun, vues });
      if (!seule || !f) throw new Error('analyse impossible');
      const avant = mesurerDetection(s.verite.ouvertures, seule.ouvertures);
      const apres = mesurerDetection(s.verite.ouvertures, f.ouvertures);
      expect(avant.fn).toBeGreaterThan(0);
      expect(apres.rappel).toBe(1);
      expect(apres.precision).toBe(1);
      expect(Math.abs(f.hauteur - s.verite.hauteur)).toBeLessThan(0.05);
      // La haie est vue sur la vue principale : elle y est marquee, et ce qu'elle cache vient d'ailleurs.
      expect(au0(f.vues).occultee).toBeGreaterThan(0.01);
      expect(f.masque).toBeLessThan(0.02);
      // Le recalage absorbe les coins decales de quelques pixels : moins de 6 cm.
      for (const v of f.vues.slice(1)) expect(Math.hypot(v.dxM, v.dyM)).toBeLessThan(0.06);
      // Sous la haie, la composition prend une vue qui voit le mur.
      const p = s.synthese.prise as PriseCamera;
      const px = f.pxParM;
      let caches = 0,
        repris = 0;
      for (let y = 0; y < f.elevation.hauteur; y += 4)
        for (let x = 0; x < f.elevation.largeur; x += 4) {
          if (!cacheDepuis(s, p, (x + 0.5) / px, f.hauteur - (y + 0.5) / px)) continue;
          caches++;
          if ((f.source[y * f.elevation.largeur + x] ?? 0) !== 0) repris++;
        }
      expect(caches).toBeGreaterThan(100);
      expect(repris / caches).toBeGreaterThan(0.8);
    },
    LONG,
  );

  it(
    'se ramene a l analyse d une photo seule quand il n y a qu une vue',
    () => {
      const s = scene('17-');
      const v = vuesDe(s)[0] as VuePhoto;
      const commun = { largeur: s.verite.largeur, hauteur: s.verite.hauteur, contour: contour(s.verite.largeur), cote: 0, distance: 11 };
      const seule = analyserReleve({ ...commun, ...v });
      const f = analyserVues({ ...commun, vues: [v] });
      expect(f?.hauteur).toBe(seule?.hauteur);
      expect(f?.masque).toBe(0);
      expect(f?.ouvertures).toEqual(seule?.ouvertures);
    },
    LONG,
  );
});

function au0<T>(t: readonly T[]): T {
  const v = t[0];
  if (v === undefined) throw new Error('vide');
  return v;
}
