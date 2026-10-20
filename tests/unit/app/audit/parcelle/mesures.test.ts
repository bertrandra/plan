import { describe, it, expect } from 'vitest';
import { distanceAuMur, mesurerFacade, priseDeLaPhoto } from '../../../../../src/app/audit/parcelle/mesures.js';
import { rechercher } from '../../../../../src/zones/releve/serie.js';
import { facadesDuContour, type Facade } from '../../../../../src/facade/geometrie.js';
import type { PhotoCas, PrisePhoto } from '../../../../../src/model/audit.js';
import type { PtBrut } from '../../../../../src/model/types.js';
import type { P2 } from '../../../../../src/facade/homographie.js';

// Les mesures d'une facade photographiee (MD/spec-audit.md §13.1), sans navigateur : une photo de
// synthese d'un mur enduit beige, prise a 8 m face a la facade sud, boussole a l'appui.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const PTS = rect(5, 10, 15, 18);
const sud = (): Facade => facadesDuContour(PTS, 6).find((f) => f.orientation === 'Sud') as Facade;

/** Une photo de 640 x 480 : ciel en haut, mur enduit beige au milieu, deux fenetres sombres, gazon en bas. */
function image() {
  const L = 640, H = 480, data = new Uint8ClampedArray(L * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < L; i++) {
    let c = [205, 186, 152];
    if (j < 60) c = [150, 190, 235];
    else if (j > 420) c = [96, 140, 70];
    else if ((i > 150 && i < 210 || i > 430 && i < 490) && j > 160 && j < 260) c = [40, 46, 54];
    const k = (j * L + i) * 4;
    data[k] = c[0] as number; data[k + 1] = c[1] as number; data[k + 2] = c[2] as number; data[k + 3] = 255;
  }
  return { data, largeur: L, hauteur: H };
}

const prise: PrisePhoto = { t: '2026-10-13T09:00:00Z', x: 10, y: 2, lat: null, lon: null, precisionM: 3, azimutDeg: 0, sourceAzimut: 'boussole', inclinaisonDeg: 5, roulisDeg: 0, champDeg: 67 };
const PHOTO: PhotoCas = { type: 'image/jpeg', base64: 'AAAA', prise };

describe('la prise du releve d apres la photo de l audit', () => {
  it('tire la distance au mur de la position et le cap de la boussole, sans l attitude du telephone', () => {
    const f = sud();
    expect(distanceAuMur(f, { x: 10, y: 2 })).toBeCloseTo(8, 6);
    const p = priseDeLaPhoto(PHOTO, { largeur: 640, hauteur: 480, donnees: new Uint8ClampedArray(4) }, f);
    expect(p.mesure).toEqual({ distance: 8, source: 'gps' });
    expect(p.cap).toBe(0);
    // L'attitude est lue au retour de l'appareil photo, pas au declenchement : elle se lit sur la photo.
    expect(p.attitude).toBeNull();
    expect(p.champ).toBe(67);
  });

  it('ne garde pas une distance plus courte que deux fois la precision du GPS (AE 101 : 2,7 m a 5 m pres)', () => {
    const img = { largeur: 640, hauteur: 480, donnees: new Uint8ClampedArray(4) };
    expect(priseDeLaPhoto({ ...PHOTO, prise: { ...prise, precisionM: 5 } }, img, sud()).mesure).toBeNull();
    expect(priseDeLaPhoto({ ...PHOTO, prise: { ...prise, precisionM: null } }, img, sud()).mesure).toBeNull();
  });

  it('prend le champ lu sur les points de fuite quand la photo n a pas d EXIF, jamais a la place de l EXIF (AE 101 : ultra grand-angle)', () => {
    const img = { largeur: 640, hauteur: 480, donnees: new Uint8ClampedArray(4) };
    expect(priseDeLaPhoto({ ...PHOTO, prise: { ...prise, champDeg: 67, sourceFocale: 'defaut' } }, img, sud(), 104).photo.champ).toBe(104);
    expect(priseDeLaPhoto({ ...PHOTO, prise: { ...prise, champDeg: 67, sourceFocale: 'exif' } }, img, sud(), 104).photo.champ).toBe(67);
    expect(priseDeLaPhoto({ ...PHOTO, prise: { ...prise, champDeg: 67, sourceFocale: 'defaut' } }, img, sud(), null).photo.champ).toBe(67);
  });

  it('ne reprend pas le cap du sens de la marche', () => {
    const p = priseDeLaPhoto({ ...PHOTO, prise: { ...prise, sourceAzimut: 'deplacement' } }, { largeur: 640, hauteur: 480, donnees: new Uint8ClampedArray(4) }, sud());
    expect(p.cap).toBeNull();
  });
});

describe('les mesures d une facade', () => {
  it('rend un releve a la hauteur estimee, sa texture, et la couleur du mur', async () => {
    const m = await mesurerFacade('maison', sud(), { pts: PTS }, [PHOTO], {
      pixels: async () => image(), chercherCoins: async (e) => rechercher(e), jpeg: () => 'data:image/jpeg;base64,TEXTURE', limites: () => [],
    });
    expect(m.releve).not.toBeNull();
    expect(m.releve).toMatchObject({ cote: sud().cote, largeur: 10, texture: 'data:image/jpeg;base64,TEXTURE', sourceDistance: 'gps', distance: 8 });
    expect(m.rangReleve).toBe(0);
    // Les baies devinees en pointille sont gardees : le renfort de Claude peut les confirmer.
    expect(Array.isArray(m.devinees)).toBe(true);
    // Sans coins trouves, la hauteur n'est pas une mesure : elle n'est pas rendue.
    if (!m.coinsTrouves) expect(m.hauteurM).toBeNull();
    expect(m.couleur?.couleur).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.couleur?.rang).toBe(0);
  }, 30000);

  it('ne rend rien d une photo illisible, sans rejeter', async () => {
    const m = await mesurerFacade('maison', sud(), { pts: PTS }, [PHOTO], {
      pixels: async () => null, chercherCoins: async (e) => rechercher(e), jpeg: () => '', limites: () => [],
    });
    expect(m).toMatchObject({ releve: null, couleur: null, hauteurM: null, coinsTrouves: false });
  });
});

describe('les coins poses au doigt sur une photo', () => {
  it('se reportent sur les autres photos du mur, qui se croisent alors a la fusion', async () => {
    const { chargerCorpus } = await import('../../../../banc/facades/banc.js');
    const { photographier, coinsVrais } = await import('../../../../banc/facades/synthese.js');
    const s = chargerCorpus().find((c) => c.nom.startsWith('18-'));
    if (!s) throw new Error('scene absente');
    const prises = [s.synthese.prise, ...(s.synthese.vues ?? [])];
    const images = prises.map((p) => photographier(s, 100, p)?.image);
    const vrais = coinsVrais(s, prises[0]);
    if (images.some((i) => !i) || !vrais) throw new Error('prise impossible');
    const pts = rect(0, 0, s.verite.largeur, 8);
    const f = { ...(facadesDuContour(pts, s.verite.hauteur).find((x) => x.orientation === 'Sud') as Facade), hauteur: s.verite.hauteur };
    const photos: PhotoCas[] = ['A', 'B'].map((b) => ({ type: 'image/jpeg', base64: b }));
    const m = await mesurerFacade('maison', f, { pts }, photos, {
      pixels: async (b) => { const img = images[b === 'A' ? 0 : 1]; return img ? { data: img.donnees, largeur: img.largeur, hauteur: img.hauteur } : null; },
      chercherCoins: async (e) => rechercher(e), jpeg: () => 'data:image/jpeg;base64,TEXTURE', limites: () => [],
    }, { '0': { coins: vrais.map((c) => ({ x: c.x, y: c.y })) } });
    expect(m.redressement?.photos.map((p) => p.coins)).toEqual(['main', 'trouve']);
    expect(m.redressement?.fusion).toBe('fusionnee');
  }, 60000);
});

describe('quatre reperes poses au doigt sur une photo', () => {
  it('redressent les photos entieres, sans coupe, puis le mur se cherche sur leur assemblage', async () => {
    const { chargerCorpus } = await import('../../../../banc/facades/banc.js');
    const { photographier, coinsVrais } = await import('../../../../banc/facades/synthese.js');
    const { homographie, appliquer } = await import('../../../../../src/facade/homographie.js');
    const s = chargerCorpus().find((c) => c.nom.startsWith('18-'));
    if (!s) throw new Error('scene absente');
    const prises = [s.synthese.prise, ...(s.synthese.vues ?? [])];
    const images = prises.map((p) => photographier(s, 100, p)?.image);
    const vrais = coinsVrais(s, prises[0]);
    if (images.some((i) => !i) || !vrais) throw new Error('prise impossible');
    // Les reperes : les coins d'une fenetre, pas ceux du mur.
    const { largeur: L, hauteur: H } = s.verite;
    const murVersPhoto = homographie([{ x: 0, y: H }, { x: L, y: H }, { x: L, y: 0 }, { x: 0, y: 0 }], vrais);
    const o = s.verite.ouvertures[0] as { x: number; y: number; l: number; h: number };
    if (!murVersPhoto) throw new Error('homographie');
    const reperes = [{ x: o.x, y: o.y + o.h }, { x: o.x + o.l, y: o.y + o.h }, { x: o.x + o.l, y: o.y }, { x: o.x, y: o.y }].map((q) => appliquer(murVersPhoto, q));
    const pts = rect(0, 0, L, 8);
    const f = { ...(facadesDuContour(pts, H).find((x) => x.orientation === 'Sud') as Facade), hauteur: H };
    const photos: PhotoCas[] = ['A', 'B'].map((b) => ({ type: 'image/jpeg', base64: b }));
    const tailles: number[] = [];
    const m = await mesurerFacade('maison', f, { pts }, photos, {
      pixels: async (b) => { const img = images[b === 'A' ? 0 : 1]; return img ? { data: img.donnees, largeur: img.largeur, hauteur: img.hauteur } : null; },
      chercherCoins: async (e) => rechercher(e), jpeg: (img) => { tailles.push(img.largeur * img.hauteur); return 'data:image/jpeg;base64,X'; }, limites: () => [],
    }, { '0': { reperes } });
    const p0 = m.redressement?.photos.find((p) => p.rang === 0);
    expect(p0?.statut).toBe('manuelle');
    // Le mur cherche apres coup sur l'assemblage : ses bouts (les verticales) a 5 % de la largeur du mur pres de la verite. L'egout et
    // le sol lus sur l'assemblage restent moins surs (une horizontale voisine peut l'emporter) : ce test ne les tient pas.
    const largeurPx = Math.hypot((vrais[1] as P2).x - (vrais[0] as P2).x, (vrais[1] as P2).y - (vrais[0] as P2).y);
    expect(p0?.coinsPx).toHaveLength(4);
    (p0?.coinsPx ?? []).forEach((c, i) => expect(Math.abs(c.x - (vrais[i] as P2).x) / largeurPx).toBeLessThan(0.05));
    // Les photos redressees gardent la surface de la photo : rien n'est coupe au mur.
    const photo0 = (images[0] as NonNullable<(typeof images)[0]>);
    expect(m.redressees?.length).toBe(2);
    expect(Math.min(...tailles.slice(-2))).toBeGreaterThan(0.6 * photo0.largeur * photo0.hauteur);
  }, 90000);
});
