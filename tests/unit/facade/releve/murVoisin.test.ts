import { describe, it, expect } from 'vitest';
import { partagerSousLesVoisins, texteDuPartage } from '../../../../src/facade/releve/murVoisin.js';
import { facadesDuContour, nomFacade } from '../../../../src/geometry/cotesVusDeDehors.js';
import type { OuvertureFacade, PtBrut } from '../../../../src/model/types.js';

// Les ouvertures lues sous le pignon d'un corps voisin (decision du proprietaire, 2 novembre 2026, Q2) : sur la facade du mur qui les
// porte quand il en a une (A1), sinon gardees sur la facade photographiee et dites (A2c) ; de meme quand aucun cote du contour ne porte
// ce mur (A3).

// Une maison en L vue du sud : le mur photographie (cote 0, de x = 0 a 5) et, dans son plan, le mur du corps voisin (cote 1, de 5 a 8).
const EN_L: PtBrut[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 10 }];
const f0 = () => {
  const f = facadesDuContour(EN_L, 5.2).find((x) => x.cote === 0);
  if (!f) throw new Error('pas de cote 0');
  return f;
};
const fen = (x: number, y = 0.9, plus: Partial<OuvertureFacade> = {}): OuvertureFacade => ({ type: 'fenetre', x, y, l: 1.1, h: 1.3, ...plus });

describe('les ouvertures sous le pignon d un corps voisin', () => {
  it('le contour donne deux cotes dans le meme plan, vus du sud, de gauche a droite', () => {
    const [a, b] = facadesDuContour(EN_L, 5.2);
    expect([a?.cote, a?.gauche, a?.droite, a?.orientation]).toEqual([0, { x: 0, y: 0 }, { x: 5, y: 0 }, 'Sud']);
    expect([b?.cote, b?.gauche, b?.droite, b?.orientation]).toEqual([1, { x: 5, y: 0 }, { x: 8, y: 0 }, 'Sud']);
  });

  it('A1 : le mur voisin a une facade, la baie s y ajoute dans son repere, detectee, sans identifiant ni verification', () => {
    const p = partagerSousLesVoisins(f0(), EN_L, [fen(1.1), fen(5.8, 0.9, { id: 'o3', verifieeLe: '2026-11-01', source: 'claude' })], [{ cote: 1, ouvertures: [] }]);
    expect(p.surLeMur.map((o) => o.x)).toEqual([1.1]);
    expect(p.ajouts).toEqual([{ cote: 1, ouvertures: [{ type: 'fenetre', x: 0.8, y: 0.9, l: 1.1, h: 1.3, source: 'detectee' }] }]);
    expect(p.sansFacade).toEqual([]);
    expect(texteDuPartage(p, (c) => nomFacade('Sud', c))).toBe('1 ouverture sur le pignon du corps voisin, posée sur la façade sud (côté 2) à la validation.');
  });

  it('A1 : une baie que la facade voisine a deja (recouvrement de plus de moitie) ne s ajoute pas, et quitte le mur', () => {
    const deja: OuvertureFacade = { type: 'fenetre', x: 0.85, y: 0.95, l: 1.1, h: 1.3, id: 'o1', verifieeLe: '2026-10-01' };
    const p = partagerSousLesVoisins(f0(), EN_L, [fen(5.8), fen(5.8, 3.4)], [{ cote: 1, ouvertures: [deja] }]);
    expect(p.surLeMur).toEqual([]);
    expect(p.dejaLa.map((d) => [d.cote, d.ouverture.y])).toEqual([[1, 0.9]]);
    expect(p.ajouts).toEqual([{ cote: 1, ouvertures: [{ type: 'fenetre', x: 0.8, y: 3.4, l: 1.1, h: 1.3, source: 'detectee' }] }]);
    expect(texteDuPartage(p, (c) => nomFacade('Sud', c))).toMatch(/1 ouverture sur le pignon du corps voisin, déjà sur la façade sud \(côté 2\)\.$/);
  });

  it('A2c : le mur voisin n a pas de facade, la baie reste sur ce mur, et l E9 le dit', () => {
    const p = partagerSousLesVoisins(f0(), EN_L, [fen(1.1), fen(5.8)], []);
    expect(p.surLeMur.map((o) => o.x)).toEqual([1.1, 5.8]);
    expect(p.sansFacade.map((s) => s.cote)).toEqual([1]);
    expect(texteDuPartage(p, (c) => nomFacade('Sud', c))).toBe('1 ouverture sur le pignon du corps voisin — pas de façade sur ce mur : relevez-le pour les y poser.');
  });

  it('A3 : aucun cote du contour ne porte ce mur (un corps qui deborde le contour), la baie reste sur ce mur', () => {
    const seul: PtBrut[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 10 }];
    const f = facadesDuContour(seul, 5.2).find((x) => x.cote === 0)!;
    const p = partagerSousLesVoisins(f, seul, [fen(5.8)], [{ cote: 1, ouvertures: [] }]);
    expect(p.surLeMur.map((o) => o.x)).toEqual([5.8]);
    expect(p.sansFacade).toEqual([{ cote: null, ouverture: fen(5.8) }]);
  });

  it('une baie a cheval sur l angle (son milieu dans le mur) reste sur ce mur ; un mur en retrait de plus d un metre n est pas dans son plan', () => {
    const p = partagerSousLesVoisins(f0(), EN_L, [fen(4.2)], [{ cote: 1, ouvertures: [] }]);
    expect(p.surLeMur.map((o) => o.x)).toEqual([4.2]);
    // Le corps voisin en retrait de 1,5 m : son mur n'est pas dans le plan de la facade.
    const retrait: PtBrut[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 1.5 }, { x: 8, y: 1.5 }, { x: 8, y: 10 }, { x: 0, y: 10 }];
    const f = facadesDuContour(retrait, 5.2).find((x) => x.cote === 0)!;
    expect(partagerSousLesVoisins(f, retrait, [fen(5.8)], [{ cote: 2, ouvertures: [] }]).sansFacade).toEqual([{ cote: null, ouverture: fen(5.8) }]);
  });

  it('une baie qui ne tient pas sur le mur voisin (elle depasse son autre bout) reste sur ce mur', () => {
    const p = partagerSousLesVoisins(f0(), EN_L, [{ type: 'porte', x: 7.4, y: 0, l: 1.2, h: 2.1 }], [{ cote: 1, ouvertures: [] }]);
    expect(p.ajouts).toEqual([]);
    expect(p.sansFacade.map((s) => s.cote)).toEqual([null]);
  });
});

// De bout en bout, par l'orchestrateur (calibration et audit, le meme) : la scene 24 du banc vue comme le mur de 5 m de cette maison en L,
// le pignon du corps voisin prolongeant la facade jusqu'a 8 m. Le mur est pose a la main (le chemin reel : coins cherches, ce mur sort a
// 8 m et l'E5 le dit « a confirmer », la personne le pose).
describe('la detection pose les baies du pignon voisin sur son mur', () => {
  const lancer = async (voisines: { cote: number; ouvertures: OuvertureFacade[] }[]) => {
    const { chargerCorpus } = await import('../../../banc/facades/banc.js');
    const { coinsVrais, photographier } = await import('../../../banc/facades/synthese.js');
    const { appliquer, homographie } = await import('../../../../src/facade/vision/homographie.js');
    const { prisesDeLaFacade } = await import('../../../../src/facade/releve/prisesFacade.js');
    const { derouler } = await import('../../../../src/facade/releve/enchainement.js');
    const { rechercher } = await import('../../../../src/facade/releve/serie.js');
    const s = chargerCorpus().find((c) => c.nom.startsWith('24-'))!;
    const p = s.synthese.prise as Parameters<typeof photographier>[2] & { distance: number; biais?: number; focale35?: number };
    const H = s.verite.hauteur;
    const ph = photographier(s, 100, p)!;
    const versPhoto = homographie([{ x: 0, y: H }, { x: 8, y: H }, { x: 8, y: 0 }, { x: 0, y: 0 }], coinsVrais(s, p)!)!;
    const coins = [{ x: 0, y: H }, { x: 5, y: H }, { x: 5, y: 0 }, { x: 0, y: 0 }].map((q) => appliquer(versPhoto, q));
    const b = ((p.biais ?? 0) * Math.PI) / 180;
    const prise = { t: '2026-11-02T10:00:00.000Z', x: 4 + p.distance * Math.sin(b), y: -p.distance * Math.cos(b), lat: null, lon: null, precisionM: 1, azimutDeg: (360 - (p.biais ?? 0)) % 360, sourceAzimut: 'boussole' as const, champDeg: (2 * Math.atan(18 / (p.focale35 ?? 26)) * 180) / Math.PI, sourceFocale: 'exif' as const };
    const prises = prisesDeLaFacade({ facade: { ...f0(), hauteur: H }, contour: EN_L, photos: [{ rang: 0, image: ph.image, prise }], corrections: { 0: { coins } }, jpeg: () => '' });
    const gabarit = [{ u: 0, v: 1 }, { u: 0.8, v: 1 + 3.6 / H }, { u: 1.6, v: 1 }];
    return derouler({ largeurM: 5, hauteurM: H, gabarit, prises, voisines }, { vue: 'audit', chercherCoins: async (e) => rechercher(e) });
  };

  it('le mur voisin a une facade : l E9 dit les deux baies posees sur elle, et le bilan de ce mur ne les porte plus', async () => {
    const r = await lancer([{ cote: 1, ouvertures: [] }]);
    const releve = r.sorties.audit?.mesure?.releve.ouvertures ?? [];
    // La detection les lit hors des cotes du mur, a 5,8 m de son bout gauche (sous le pignon voisin).
    expect(releve.filter((o) => o.x > 5).map((o) => Math.round(o.x * 10) / 10)).toEqual([5.8, 5.8]);
    expect(r.etapes.find((e) => e.id === 'ouvertures')?.resume).toMatch(/2 ouvertures sur le pignon du corps voisin, posées sur la façade sud \(côté 2\) à la validation\.$/);
    expect(r.sorties.facade?.ouvertures.every((o) => o.x + o.l / 2 <= 5)).toBe(true);
    expect(r.etapes.find((e) => e.id === 'validation')?.resume).toMatch(/ Et 2 ouvertures sur la façade sud \(côté 2\), dans le même pas\. Validez la façade/);
  }, 120_000);

  it('le mur voisin n a pas de facade : les baies restent sur ce mur, et l E9 dit de relever le mur voisin', async () => {
    const r = await lancer([]);
    expect(r.etapes.find((e) => e.id === 'ouvertures')?.resume).toMatch(/2 ouvertures sur le pignon du corps voisin — pas de façade sur ce mur : relevez-le pour les y poser\.$/);
    expect(r.sorties.facade?.ouvertures.filter((o) => o.x > 5)).toHaveLength(2);
  }, 120_000);
});
