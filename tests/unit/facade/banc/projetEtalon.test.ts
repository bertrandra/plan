import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { aUnProjet, batimentDeLEtalon, ETALONS_AVEC_PROJET, PENTE_DEG, PROFONDEUR_M, SOUS_EGOUT_M } from '../../../../src/facade/banc/projetEtalon.js';
import { gabaritVrai } from '../../../../src/facade/banc/synthese.js';
import { gabaritDesCorps } from '../../../../src/facade/gabaritMur.js';
import { facadesDuContour } from '../../../../src/geometry/cotesVusDeDehors.js';
import { partiesBassesDuGabarit } from '../../../../src/facade/profil.js';

// Le batiment autour du mur d'un etalon (decision du proprietaire, 4 novembre 2026) : deux pans a 40 degres, faitage parallele au mur,
// 9 m de profondeur ; un pignon garde son pignon ; les parties basses en corps a part. Le gabarit que la chaine en tire est celui de la
// scene : sinon le projet dirait autre chose que l'etalon.

const scenes = chargerCorpus().filter((s) => aUnProjet(s.nom));

describe('le batiment d un etalon', () => {
  it('huit etalons ont un projet : un par sorte de mur', () => {
    expect(scenes.map((s) => s.nom.slice(0, 2))).toEqual([...ETALONS_AVEC_PROJET]);
  });
  it('le mur photographie est le cote 0, vu du sud, a la largeur et a l egout de la scene', () => {
    for (const s of scenes) {
      const b = batimentDeLEtalon(s);
      const f = facadesDuContour(b.contour, b.hauteur).find((x) => x.cote === 0)!;
      expect(f.orientation).toBe('Sud');
      expect(f.largeur).toBeCloseTo(s.verite.largeur, 6);
      expect(b.hauteur).toBe(s.verite.hauteur);
    }
  });
  it('les corps donnent le gabarit de la scene : sa pointe, ses parties basses', () => {
    for (const s of scenes) {
      const b = batimentDeLEtalon(s), f = facadesDuContour(b.contour, b.hauteur).find((x) => x.cote === 0)!;
      const g = gabaritDesCorps(f, b.corps, b.hauteur), v = gabaritVrai(s);
      const L = s.verite.largeur, H = s.verite.hauteur;
      expect(partiesBassesDuGabarit(g, L, H).map((p) => [p.debut, p.fin, Math.round(p.hauteur * 10)])).toEqual(partiesBassesDuGabarit(v, L, H).map((p) => [p.debut, p.fin, Math.round(p.hauteur * 10)]));
      expect(Math.max(...g.map((p) => p.v))).toBeCloseTo(Math.max(...v.map((p) => p.v)), 2);
    }
  });
  it('un gouttereau a deux pans a 40 degres sur 9 m ; un pignon decentre garde son sommet ; une rampe est un appentis', () => {
    const b = (n: string) => batimentDeLEtalon(scenes.find((s) => s.nom.startsWith(n))!);
    const deux = b('02').corps[0]!;
    expect(deux.faitage - deux.egouts[0]).toBeCloseTo((PROFONDEUR_M / 2) * Math.tan((PENTE_DEG * Math.PI) / 180), 2);
    expect(b('22').corps[0]!.posFaitage).toBeCloseTo(3.2, 6);
    expect(b('23').toit.forme).toBe('appentis');
    expect(b('26').corps.map((c) => c.egouts[0])).toEqual([2.6, 5.6, 2.9]);
    // Une partie basse : un appentis adosse a la partie haute, sa rive basse sur le mur, sa rive haute au fond, sous l'egout haut.
    for (const n of ['25', '26']) {
      const e = batimentDeLEtalon(scenes.find((s) => s.nom.startsWith(n))!);
      const H = e.hauteur;
      for (const c of e.corps.filter((x) => x.egouts[0] < H)) {
        expect(c.posFaitage).toBe(PROFONDEUR_M);
        expect(c.faitage).toBeCloseTo(H - SOUS_EGOUT_M, 6);
        expect(c.faitage).toBeLessThan(H);
      }
    }
  });
});
