import { describe, it, expect } from 'vitest';
import { analyserVues, type VuePhoto } from '../../../src/facade/fusion.js';
import { recalerPaire, CRITERES_FUSION } from '../../../src/facade/recalageOrb.js';
import { analyserReleve } from '../../../src/facade/analyse.js';
import { detecterOrb } from '../../../src/facade/orb.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { photographier, coinsVrais, type PriseCamera, type SceneFacade } from '../../banc/facades/synthese.js';
import { mesurerDetection } from '../../banc/facades/mesure.js';

// La fusion de plusieurs photos d'une facade par points d'interet (spec-facades-calage-detection §8) : ORB sur chaque elevation
// redressee, RANSAC pour recaler, le plus grand groupe compose ; les autres photos restent independantes et ne disparaissent jamais.

const LONG = 90_000;
const corpus = chargerCorpus();
const scene = (debut: string): SceneFacade => {
  const s = corpus.find((c) => c.nom.startsWith(debut));
  if (!s) throw new Error('scene absente : ' + debut);
  return s;
};
const contour = (L: number) => [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 6 }, { x: 0, y: 6 }];

/** Les vues d'une scene du banc : la principale, puis les autres ; coins vrais decales comme le dit la scene. */
function vuesDe(s: SceneFacade, decale: [number, number] | null = null): VuePhoto[] {
  const prises = [s.synthese.prise as PriseCamera, ...(s.synthese.vues ?? [])];
  return prises.map((p, k) => {
    const ph = photographier(s, 100, p);
    const c = coinsVrais(s, p);
    if (!ph || !c) throw new Error('vue impossible');
    const [dx, dy] = p.decalageCoins ?? (decale && k === 1 ? decale : [0, 0]);
    return { photo: ph.image, coins: c.map((q) => ({ x: q.x + dx, y: q.y + dy })), focalePx: ph.focalePx };
  });
}
const commun = (s: SceneFacade) => ({ largeur: s.verite.largeur, hauteur: s.verite.hauteur, contour: contour(s.verite.largeur), cote: 0, distance: 11 });

describe('fusion par ORB et RANSAC', () => {
  it('fond deux photos qui se recouvrent : toutes les ouvertures, un statut « fusionnee », des decalages minimes', () => {
    const s = scene('19-');
    const f = analyserVues({ ...commun(s), vues: vuesDe(s) });
    if (!f) throw new Error('fusion impossible');
    expect(f.statut).toBe('fusionnee');
    expect(f.groupe.slice().sort()).toEqual([0, 1]);
    expect(f.independantes).toEqual([]);
    const m = mesurerDetection(s.verite.ouvertures, f.ouvertures);
    expect(m.rappel).toBe(1);
    expect(m.precision).toBe(1);
    expect(Math.abs(f.hauteur - s.verite.hauteur)).toBeLessThan(0.05);
    // La haie haute cache une part du mur sur les deux photos : ce qui est cache partout reste dans le masque.
    expect(f.masque).toBeGreaterThan(0);
    const p = f.paires[0];
    expect(p).toMatchObject({ a: 0, b: 1, accepte: true, motif: null });
    expect(p?.inliers).toBeGreaterThanOrEqual(CRITERES_FUSION.POINTS_COMMUNS_MIN);
    expect(p?.erreurPx).toBeLessThanOrEqual(CRITERES_FUSION.ERREUR_MAX_PX);
    for (const v of f.vues) { expect(v.fusionnee).toBe(true); expect(v.motif).toBeNull(); expect(Math.hypot(v.dxM, v.dyM)).toBeLessThan(0.06); }
  }, LONG);

  it('recale des coins poses a quelques pixels pres : le decalage est mesure, et la fusion tient', () => {
    const s = scene('19-');
    const f = analyserVues({ ...commun(s), vues: vuesDe(s, [6, 4]) });
    if (!f) throw new Error('fusion impossible');
    expect(f.statut).toBe('fusionnee');
    expect(f.paires[0]?.recalageNul).toBe(false);
    // Les coins de la deuxieme photo sont a 6 x 4 pixels de la vraie place : l'elevation se decale de quelques centimetres.
    const v = f.vues[1 - f.reference];
    expect(Math.hypot(v?.dxM ?? 0, v?.dyM ?? 0)).toBeGreaterThan(0.01);
    expect(Math.hypot(v?.dxM ?? 0, v?.dyM ?? 0)).toBeLessThan(0.2);
    expect(mesurerDetection(s.verite.ouvertures, f.ouvertures).rappel).toBe(1);
  }, LONG);

  it('trois photos : le plus grand groupe se compose, et chaque photo reste comptee', () => {
    const s = scene('17-');
    const f = analyserVues({ ...commun(s), vues: vuesDe(s) });
    if (!f) throw new Error('fusion impossible');
    expect(f.vues).toHaveLength(3);
    expect(f.groupe.length + f.independantes.length).toBe(3);
    expect(f.groupe.length).toBeGreaterThanOrEqual(2);
    expect(mesurerDetection(s.verite.ouvertures, f.ouvertures).rappel).toBe(1);
    // Chaque photo hors du groupe garde son motif ; chaque photo du groupe n'en a pas.
    f.vues.forEach((v, k) => expect(v.motif === null).toBe(f.groupe.includes(k)));
  }, LONG);

  it('deux photos de murs differents ne se fusionnent pas : le motif est dit, aucune photo n est perdue', () => {
    const a = scene('17-'), b = scene('03-');
    const [va] = vuesDe(a), [vb] = vuesDe(b);
    const f = analyserVues({ ...commun(a), vues: [va as VuePhoto, vb as VuePhoto] });
    if (!f) throw new Error('analyse impossible');
    expect(['independantes', 'partielle']).toContain(f.statut);
    expect(f.statut).toBe('independantes');
    expect(f.groupe).toHaveLength(1);
    expect(f.independantes).toHaveLength(1);
    expect(f.vues).toHaveLength(2);
    expect(f.vues[f.independantes[0] as number]?.motif).toMatch(/points|recalage|échelle|erreur/);
    expect(f.paires[0]?.accepte).toBe(false);
    // Le releve se fait quand meme, sur la meilleure photo seule.
    expect(f.ouvertures.length).toBeGreaterThan(0);
  }, LONG);

  it('une seule photo : pas de fusion, le releve de la chaine ordinaire', () => {
    const s = scene('17-');
    const v = vuesDe(s)[0] as VuePhoto;
    const seule = analyserReleve({ ...commun(s), ...v });
    const f = analyserVues({ ...commun(s), vues: [v] });
    expect(f?.statut).toBe('seule');
    expect(f?.paires).toEqual([]);
    expect(f?.hauteur).toBe(seule?.hauteur);
    expect(f?.masque).toBe(0);
    expect(f?.ouvertures).toEqual(seule?.ouvertures);
  }, LONG);

  it('rejouer deux fois donne le meme resultat, au bit pres', () => {
    const s = scene('19-');
    const vues = vuesDe(s);
    const a = analyserVues({ ...commun(s), vues }), b = analyserVues({ ...commun(s), vues });
    expect(a?.paires).toEqual(b?.paires);
    expect(a?.modeles).toEqual(b?.modeles);
    expect(a?.groupe).toEqual(b?.groupe);
    expect(Buffer.from(a?.texture.donnees ?? []).equals(Buffer.from(b?.texture.donnees ?? []))).toBe(true);
  }, LONG);

  it('refuse une paire sans assez de points communs, et le dit', () => {
    const s = scene('19-');
    const [v] = vuesDe(s);
    const pts = detecterOrb((v as VuePhoto).photo);
    const r = recalerPaire(0, 1, pts.slice(0, 5), pts.slice(0, 5), 100);
    expect(r.bilan).toMatchObject({ accepte: false, motif: 'peu-de-points' });
    expect(r.modele).toBeNull();
  });
});
