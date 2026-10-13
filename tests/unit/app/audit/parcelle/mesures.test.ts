import { describe, it, expect } from 'vitest';
import { distanceAuMur, mesurerFacade, priseDeLaPhoto } from '../../../../../src/app/audit/parcelle/mesures.js';
import { rechercher } from '../../../../../src/zones/releve/serie.js';
import { facadesDuContour, type Facade } from '../../../../../src/facade/geometrie.js';
import type { PhotoCas, PrisePhoto } from '../../../../../src/model/audit.js';
import type { PtBrut } from '../../../../../src/model/types.js';

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

const prise: PrisePhoto = { t: '2026-10-13T09:00:00Z', x: 10, y: 2, lat: null, lon: null, precisionM: 4, azimutDeg: 0, sourceAzimut: 'boussole', inclinaisonDeg: 5, roulisDeg: 0, champDeg: 67 };
const PHOTO: PhotoCas = { type: 'image/jpeg', base64: 'AAAA', prise };

describe('la prise du releve d apres la photo de l audit', () => {
  it('tire la distance au mur de la position, le cap de la boussole, l attitude du telephone', () => {
    const f = sud();
    expect(distanceAuMur(f, { x: 10, y: 2 })).toBeCloseTo(8, 6);
    const p = priseDeLaPhoto(PHOTO, { largeur: 640, hauteur: 480, donnees: new Uint8ClampedArray(4) }, f);
    expect(p.mesure).toEqual({ distance: 8, source: 'gps' });
    expect(p.cap).toBe(0);
    expect(p.attitude).toEqual({ inclinaisonDeg: 5, roulisDeg: 0 });
    expect(p.champ).toBe(67);
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
