import { describe, it, expect } from 'vitest';
import { murSurLAssemblage, reporterCoins, vuesDeFace } from '../../../../src/facade/releve/coinsAuto.js';
import { appliquer, homographie, type Image, type P2 } from '../../../../src/facade/vision/homographie.js';
import { inverser } from '../../../../src/facade/vision/redressementFuites.js';
import { mosaiqueDesVues } from '../../../../src/facade/vision/mosaiqueFuites.js';
import { appliquerSimilitude } from '../../../../src/facade/vision/ransac.js';
import { gabaritSurLaVue } from '../../../../src/facade/gabaritMur.js';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { photographier, coinsVrais } from '../../../banc/facades/synthese.js';

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
  // Un pignon decentre (22) et la rampe d'un appentis (23) : l'egout est aux angles, la silhouette monte au-dessus.
  it.each(['02-', '03-', '07-', '18-', '22-', '23-'])('trouve l egout, le sol et les bouts de la scene %s a 2 %% de la largeur du mur', (debut) => {
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

  it('lit la silhouette d un pignon decentre : son sommet a 2 % de la largeur du mur', () => {
    const s = chargerCorpus().find((c) => c.nom.startsWith('22-'));
    if (!s) throw new Error('scene absente');
    const p = s.synthese.prise;
    const image = photographier(s, 100, p)?.image, vrais = coinsVrais(s, p);
    if (!image || !vrais) throw new Error('prise impossible');
    const vues = vuesDeFace([image]);
    const m = mosaiqueDesVues(vues.filter((v): v is NonNullable<typeof v> => !!v));
    const versVue = vues[0] ? inverser(vues[0].versPhoto) : null;
    const place = m?.places[0];
    const { largeur: L, hauteur: H } = s.verite;
    const murVersPhoto = homographie([{ x: 0, y: H }, { x: L, y: H }, { x: L, y: 0 }, { x: 0, y: 0 }], vrais);
    if (!m || !versVue || !place || !murVersPhoto) throw new Error('pas d assemblage');
    const versAssemblage = (q: P2) => appliquerSimilitude(place, appliquer(versVue, appliquer(murVersPhoto, q)));
    const sommet = versAssemblage({ x: 0.4 * L, y: H + (s.synthese.mur.pignon ?? 0) });
    const w = versAssemblage({ x: L, y: H }).x - versAssemblage({ x: 0, y: H }).x;
    const r = murSurLAssemblage(m, H / L);
    expect(r.silhouette).toBeDefined();
    const haut = [...(r.silhouette ?? [])].sort((a, b) => a.y - b.y)[0] as P2;
    expect(Math.hypot(haut.x - sommet.x, haut.y - sommet.y) / w).toBeLessThan(0.02);
    // Le gabarit du plan et du LiDAR ne cale pas le mur : il se pose ensuite, tel quel, entre les bords trouves, son sommet a sa place.
    const pg = s.synthese.mur.pignon ?? 0;
    const posee = gabaritSurLaVue([{ u: 0, v: 1 }, { u: 0.4, v: 1 + pg / H }, { u: 1, v: 1 }], r);
    expect(posee).toHaveLength(3);
    const pose = posee[1] as P2;
    expect(pose.x).toBeCloseTo(r.x0 + 0.4 * (r.x1 - r.x0), 6);
    expect(Math.hypot(pose.x - sommet.x, pose.y - sommet.y) / w).toBeLessThan(0.03);
  }, 30000);
});
