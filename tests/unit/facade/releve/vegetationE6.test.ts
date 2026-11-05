import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { casDeLEtalon, photosDeLEtalon } from '../../../../src/facade/banc/etalons.js';
import { batimentDeLEtalon } from '../../../../src/facade/banc/projetEtalon.js';
import { derouler, entreesDuCas } from '../../../../src/facade/releve/enchainement.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { diagnostiquerForme } from '../../../../src/facade/regles/facades/diagnosticForme.js';
import { facadesDuContour } from '../../../../src/geometry/cotesVusDeDehors.js';
import { silhouetteLue } from '../../../../src/facade/vision/mosaiqueFuites.js';

// L'E6 ne monte plus dans un arbre (demande du proprietaire, 4 novembre 2026, d'apres la facade sud d'AE 101) : une colonne dont le haut
// lu est sous du feuillage n'est pas lue, l'E6 dit la part de ces colonnes, l'E7 garde le gabarit la. Une peinture verte (bandeaux,
// volets) n'est pas du feuillage : un aplat, pas une texture.

const o = { vue: 'calibration' as const, chercherCoins: async (e: Parameters<typeof rechercher>[0]) => rechercher(e) };
const scene = (n: string) => chargerCorpus().find((x) => x.nom.startsWith(n))!;
async function rejouer(n: string) {
  const s = scene(n), ph = photosDeLEtalon(s);
  return derouler(entreesDuCas(casDeLEtalon(s, ph, ph.map((_, k) => 'p' + k)), ph.map((p) => p.image)), o);
}

describe('le haut du mur sous un arbre (E6)', () => {
  it('etalon 27 : les colonnes sous la couronne ne sont pas lues, et l E6 le dit ; la peinture verte n en est pas', async () => {
    const r = await rejouer('27');
    const masque = r.sorties.forme?.masque;
    expect(masque?.part ?? 0).toBeGreaterThan(0.05);
    // L'arbre est a gauche : le pignon de droite, ses volets et ses bandeaux verts restent lus.
    expect(masque!.troncons.every((t) => t.u1 <= 0.55)).toBe(true);
    expect(r.etapes.find((e) => e.id === 'silhouette')!.resume).toMatch(/Haut masqué par la végétation sur \d+ % des colonnes/);
  }, 120000);

  it('sans arbre devant le haut (un pignon nu, une ombre d arbre, une haie au pied), rien n est masque', async () => {
    for (const n of ['24', '11', '17']) {
      const r = await rejouer(n);
      expect(r.sorties.forme?.masque ?? null).toBeNull();
      expect(r.etapes.find((e) => e.id === 'silhouette')!.resume).not.toMatch(/végétation/);
    }
  }, 120000);

  it('l E7 garde le gabarit la ou le haut est masque : un haut lu entierement masque ne sert pas au diagnostic', () => {
    const b = batimentDeLEtalon(scene('22'));
    const facade = facadesDuContour(b.contour, b.hauteur).find((f) => f.cote === 0)!;
    const lue = [{ u: 0, v: 1 }, { u: 0.4, v: 1.8 }, { u: 1, v: 1 }];
    expect(diagnostiquerForme({ facade, corps: b.corps, hauteurMur: b.hauteur, lue }).lue).toBe(true);
    expect(diagnostiquerForme({ facade, corps: b.corps, hauteurMur: b.hauteur, lue, masques: [{ u0: 0, u1: 1 }] }).lue).toBe(false);
  });
});

describe('les suites de l E6 (5 novembre 2026)', () => {
  it('un poteau peint en haut du mur ne fait pas plonger le haut lu (AE 101, le colombage du pignon gauche)', () => {
    // Un pignon enduit de 300 px de large sous un ciel (l'egout a la rangee 140, la pointe a la rangee 40), un poteau vert de 14 px au
    // milieu, du haut du pignon jusque loin dans le mur.
    const L = 300, H = 300, egout = 140, donnees = new Uint8ClampedArray(L * H * 4), vu = new Uint8Array(L * H).fill(1);
    const haut = (x: number) => egout - (egout - 40) * (1 - Math.abs(x - L / 2) / (L / 2));
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
      const c = y < haut(x) ? [140, 185, 235] : x >= 143 && x < 157 && y < 260 ? [34, 92, 62] : [222, 208, 184];
      donnees.set([c[0]!, c[1]!, c[2]!, 255], (y * L + x) * 4);
    }
    const m = { image: { largeur: L, hauteur: H, donnees }, vu }, r = { x0: 0, x1: L, y0: egout, y1: H };
    // Le plus bas du haut lu au milieu du pignon (entre 40 % et 60 % de la largeur) : la pointe, a la rangee 40, sans le creux.
    const auMilieu = (s: ReturnType<typeof silhouetteLue>) => Math.max(...(s?.silhouette ?? []).filter((p) => p.x > 0.4 * L && p.x < 0.6 * L).map((p) => p.y));
    // Sans la regle (l'affinage de l'egout et du sol), le creux reste ; le haut lu de l'E6 ne l'a plus.
    expect(auMilieu(silhouetteLue(m, r, false))).toBeGreaterThan(100);
    expect(auMilieu(silhouetteLue(m, r, true))).toBeLessThan(70);
  });

  it('etalon 27 : la couronne de l arbre ne se lit pas comme un toit (la bande au-dessus de l egout)', async () => {
    const r = await rejouer('27');
    expect(r.sorties.audit?.mesure?.silhouette).not.toBe('rampe');
    expect(r.etapes.find((e) => e.id === 'silhouette')!.resume).not.toMatch(/une seule rampe/);
  }, 120000);
});
