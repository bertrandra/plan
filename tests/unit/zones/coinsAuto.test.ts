import { describe, it, expect } from 'vitest';
import { murSurLAssemblage, reporterCoins, vuesDeFace } from '../../../src/zones/releve/coinsAuto.js';
import { appliquer, type Image, type P2 } from '../../../src/facade/homographie.js';
import { inverser } from '../../../src/facade/redressementFuites.js';
import { mosaiqueDesVues } from '../../../src/facade/mosaiqueFuites.js';
import { appliquerSimilitude } from '../../../src/facade/ransac.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { photographier, coinsVrais } from '../../banc/facades/synthese.js';

// Le report des coins poses sur une photo vers les autres photos du meme mur (les coins d'une photo seule : tests/unit/zones/chaine.test.ts).

describe('le report des coins poses sur une photo', () => {
  it('porte le mur d une vue sur les deux autres photos du meme mur, a 2 % de sa largeur pres', () => {
    const s = chargerCorpus().find((c) => c.nom.startsWith('16-'));
    if (!s) throw new Error('scene absente');
    const prises = [s.synthese.prise, ...(s.synthese.vues ?? [])];
    const images = prises.map((p) => photographier(s, 100, p)?.image);
    const vrais = prises.map((p) => coinsVrais(s, p));
    if (images.some((i) => !i) || vrais.some((c) => !c)) throw new Error('prise impossible');
    const portes = reporterCoins(images as Image[], 0, vrais[0] as P2[]);
    for (let i = 1; i < prises.length; i++) {
      const v = vrais[i] as P2[], q = portes[i];
      expect(q).not.toBeNull();
      const largeur = Math.hypot((v[1] as P2).x - (v[0] as P2).x, (v[1] as P2).y - (v[0] as P2).y);
      for (let k = 0; k < 4; k++) expect(Math.hypot((q?.[k] as P2).x - (v[k] as P2).x, (q?.[k] as P2).y - (v[k] as P2).y) / largeur).toBeLessThan(0.02);
    }
  });
});

describe('le mur cherche sur l assemblage des photos redressees', () => {
  // L'egout d'une bande de tuiles (02 : enduit sous des tuiles ; 03 : brique a volets, dont les baies prennent presque tout le milieu),
  // et le sol cache en partie par une voiture et une haie (07, 18) : les aretes seules prenaient le haut du toit et un bandeau d'etage.
  it.each(['02-', '03-', '07-', '18-'])('trouve l egout, le sol et les bouts de la scene %s a 2 %% de la largeur du mur', (debut) => {
    const s = chargerCorpus().find((c) => c.nom.startsWith(debut));
    if (!s) throw new Error('scene absente');
    const prises = [s.synthese.prise, ...(s.synthese.vues ?? [])];
    const images = prises.map((p) => photographier(s, 100, p)?.image);
    const vrais = coinsVrais(s, prises[0]);
    if (images.some((i) => !i) || !vrais) throw new Error('prise impossible');
    const vues = vuesDeFace(images as Image[]);
    const m = mosaiqueDesVues(vues.filter((v): v is NonNullable<typeof v> => !!v));
    const versVue = vues[0] ? inverser(vues[0].versPhoto) : null;
    const place = m?.places[0];
    if (!m || !versVue || !place) throw new Error('pas d assemblage');
    const v = vrais.map((c) => appliquerSimilitude(place, appliquer(versVue, c)));
    const w = ((v[1] as P2).x + (v[2] as P2).x - (v[0] as P2).x - (v[3] as P2).x) / 2;
    const r = murSurLAssemblage(m, s.verite.hauteur / s.verite.largeur);
    expect(Math.abs(r.y0 - ((v[0] as P2).y + (v[1] as P2).y) / 2) / w).toBeLessThan(0.02);
    expect(Math.abs(r.y1 - ((v[2] as P2).y + (v[3] as P2).y) / 2) / w).toBeLessThan(0.02);
    expect(Math.abs(r.x0 - ((v[0] as P2).x + (v[3] as P2).x) / 2) / w).toBeLessThan(0.02);
    expect(Math.abs(r.x1 - ((v[1] as P2).x + (v[2] as P2).x) / 2) / w).toBeLessThan(0.02);
  }, 30000);
});
