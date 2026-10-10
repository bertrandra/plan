import { describe, it, expect } from 'vitest';
import { pointDansImage, pointsDuMur, vueCachee, obstacle, mursVisibles, couleursMursDepuisPhotos, texteBilanCouleursMurs, hauteurAuxLimites, HAUTEUR_CAMERA_M, type VueRue, type Pixels } from '../../../src/render/couleurMurPhoto.js';
import { repliSelonMateriau } from '../../../src/render/couleurToitOrtho.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { PhotoRue } from '../../../src/geo/panoramax.js';
import type { CouleurMurs, PtBrut } from '../../../src/model/types.js';

// La couleur des murs lue sur les photos de rue (MD/spec-toit-ign.md §6.5) : ou tombe un point du mur
// dans l'image, quels murs une photo montre, et la lecture d'un quartier sur des photos simulees.

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const photo = (plus: Partial<PhotoRue> = {}): PhotoRue => ({ id: 'ph1', lat: 0, lon: 0, azimut: 0, champ: 360, panoramique: true, largeurPx: null, hauteurPx: null, hd: 'https://panoramax.ign.fr/hd.jpg', sd: 'https://panoramax.ign.fr/sd.jpg', vignette: null, date: '2018-03-21T12:00:00Z', auteur: 'IGN', licence: 'etalab-2.0', ...plus });
const vue = (x: number, y: number, plus: Partial<PhotoRue> = {}): VueRue => ({ photo: photo(plus), x, y });

describe('pointDansImage', () => {
  it('panoramique : le cap de la photo au centre, l horizon a mi-hauteur', () => {
    const v = vue(0, 0);
    expect(pointDansImage(v, { x: 0, y: 10, z: HAUTEUR_CAMERA_M }, 2000, 1000)).toEqual({ u: 1000, v: 500 });
    const est = pointDansImage(v, { x: 10, y: 0, z: HAUTEUR_CAMERA_M }, 2000, 1000)!;
    expect(est.u).toBeCloseTo(1500, 6);
    // Plus haut que l'objectif : au-dessus de l'horizon.
    expect(pointDansImage(v, { x: 0, y: 10, z: 12.2 }, 2000, 1000)!.v).toBeCloseTo(250, 6);
  });
  it('photo plate : au centre dans l axe, rien hors du champ', () => {
    const v = vue(0, 0, { panoramique: false, champ: 60, azimut: 90 });
    const c = pointDansImage(v, { x: 10, y: 0, z: HAUTEUR_CAMERA_M }, 1200, 900)!;
    expect(c.u).toBeCloseTo(600, 6);
    expect(c.v).toBeCloseTo(450, 6);
    expect(pointDansImage(v, { x: 0, y: 10, z: 3 }, 1200, 900)).toBeNull();
  });
});

describe('les murs a lire', () => {
  it('des points loin des angles, entre le haut d une cloture et l egout', () => {
    const pts = pointsDuMur(p(0, 0), p(10, 0), 6);
    expect(pts).toHaveLength(128);
    expect(Math.min(...pts.map((q) => q.x))).toBeGreaterThan(1.4);
    expect(Math.min(...pts.map((q) => q.z))).toBeGreaterThan(2.4);
    expect(Math.max(...pts.map((q) => q.z))).toBeLessThan(5.7);
  });

  it('une photo devant le mur le montre ; derriere un autre batiment, ou dans son dos, non', () => {
    const maison = { key: 'm', pts: rect(0, 0, 10, 8), egout: 6 };
    const devant = vue(5, -15);
    const murs = mursVisibles([maison], [devant], [obstacle(maison.pts)]);
    expect(murs).toHaveLength(1);
    expect(murs[0]!.a).toEqual(p(0, 0));
    // Un garage entre la photo et la facade sud.
    const garage = rect(2, -8, 6, 4);
    expect(mursVisibles([maison], [devant], [obstacle(maison.pts), obstacle(garage)])).toHaveLength(0);
    expect(vueCachee(p(5, -15), p(5, -0.2), [obstacle(garage)])).toBe(true);
    // Trop loin.
    expect(mursVisibles([maison], [vue(5, -60)], [obstacle(maison.pts)])).toHaveLength(0);
  });
});

describe('couleursMursDepuisPhotos', () => {
  const proj = projecteurLocal(48.9, 2.13);
  /** Un panoramique pose a 15 m au sud de la maison, entierement de la couleur donnee. */
  const quartier = (rgb: [number, number, number], source?: 'plan', parcelle = rect(-20, -20, 50, 50), egout = 6) => {
    const g = proj.versDegres(5, -15);
    const objets: { key: string; fonction: string; pts: PtBrut[]; elevation?: number; couleurMurs?: CouleurMurs | null }[] = [
      { key: 'parcelle', fonction: 'terrain', pts: parcelle },
      { key: 'm', fonction: 'batiment', pts: rect(0, 0, 10, 8), elevation: egout, ...(source ? { couleurMurs: { source } } : {}) },
    ];
    const image: Pixels = { largeur: 400, hauteur: 200, data: Array.from({ length: 400 * 200 }, () => [...rgb, 255]).flat() };
    const charges: string[] = [];
    const options = {
      chercher: async () => [photo({ lat: g.lat, lon: g.lon })],
      charger: async (url: string) => { charges.push(url); return image; },
    };
    return { objets, options, charges };
  };

  it('lit la teinte du mur sur la photo, en definition reduite, et la range sur le batiment', async () => {
    const { objets, options, charges } = quartier([217, 210, 196]);
    const b = await couleursMursDepuisPhotos(objets, proj, options);
    expect(b).toEqual({ photos: 1, ambigus: 0 });
    expect(charges).toEqual(['https://panoramax.ign.fr/sd.jpg']);
    expect(objets[1]!.couleurMurs).toEqual({ photo: { couleur: '#D9D2C4', id: 'ph1', date: '2018-03-21T12:00:00Z', auteur: 'IGN', licence: 'etalab-2.0' } });
  });

  it('une photo ou le mur n est pas lisible (une haie devant) : la lecture est effacee, la source choisie reste', async () => {
    const { objets, options } = quartier([60, 110, 50], 'plan');
    const b = await couleursMursDepuisPhotos(objets, proj, options);
    expect(b).toEqual({ photos: 0, ambigus: 1 });
    expect(objets[1]!.couleurMurs).toEqual({ source: 'plan', photo: null });
  });

  it('une facade basse en retrait derriere la limite de parcelle : la photo ne voit que la cloture', async () => {
    // La limite passe a 3 m de l'objectif, la maison de 3 m d'egout est 12 m plus loin.
    const { objets, options } = quartier([217, 210, 196], undefined, rect(-20, -12, 50, 40), 3);
    expect(await couleursMursDepuisPhotos(objets, proj, options)).toEqual({ photos: 0, ambigus: 1 });
    expect(hauteurAuxLimites(p(5, -15), { x: 5, y: 0, z: 3.2 }, [obstacle(rect(-20, -12, 50, 40))])).toBeCloseTo(2.4, 6);
    expect(hauteurAuxLimites(p(5, -15), { x: 5, y: 0, z: 3.2 }, [])).toBeNull();
  });

  it('sans photo ou sans service : rien ne change', async () => {
    const { objets } = quartier([217, 210, 196]);
    expect(await couleursMursDepuisPhotos(objets, proj, { chercher: async () => [] })).toEqual({ photos: 0, ambigus: 0 });
    expect(await couleursMursDepuisPhotos(objets, proj, { chercher: async () => { throw new Error('muet'); } })).toEqual({ photos: 0, ambigus: 0 });
    expect(objets[1]).not.toHaveProperty('couleurMurs');
  });

  it('le bilan', () => {
    expect(texteBilanCouleursMurs({ photos: 2, ambigus: 1 }, 30)).toBe('2 couleur(s) de murs lue(s) sur les photos de rue, 30 materiau(x) de murs connu(s) (fichiers fonciers)');
    expect(texteBilanCouleursMurs(null, 0)).toBeNull();
  });
});

describe('repliSelonMateriau (toits)', () => {
  it('une photo pas concluante : ardoise ou zinc gris, tuile vue grise brune ; une teinte lue ne change pas', () => {
    expect(repliSelonMateriau({ couleur: '#B0432F', origine: 'rouge' }, { materiauxToiture: '20' }).origine).toBe('gris');
    expect(repliSelonMateriau({ couleur: '#6F7275', origine: 'gris' }, { materiauxToiture: '10' }).origine).toBe('brun');
    expect(repliSelonMateriau({ couleur: '#6F7275', origine: 'gris' }, { materiauxToiture: '10' }, true).origine).toBe('gris');
    expect(repliSelonMateriau({ couleur: '#123456', origine: 'orthophoto' }, { materiauxToiture: '20' }).origine).toBe('orthophoto');
    expect(repliSelonMateriau({ couleur: '#B0432F', origine: 'rouge' }, null).origine).toBe('rouge');
  });
});
