import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { casDeLEtalon, photosDeLEtalon } from '../../../../src/facade/banc/etalons.js';
import { batimentDeLEtalon } from '../../../../src/facade/banc/projetEtalon.js';
import { derouler, entreesDuCas } from '../../../../src/facade/releve/enchainement.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { diagnostiquerForme } from '../../../../src/facade/regles/facades/diagnosticForme.js';
import { facadesDuContour } from '../../../../src/geometry/cotesVusDeDehors.js';

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
