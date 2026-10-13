import { describe, it, expect, vi } from 'vitest';
import { creerCouleursPhotos, type DependancesCouleur } from '../../../../src/app/audit/couleurFacade.js';
import { creerPromenade } from '../../../../src/app/audit/promenade.js';
import { facadesDuContour } from '../../../../src/facade/geometrie.js';
import { fichierPromenade, lireFichierPromenade, type PhotoCas, type PrisePhoto } from '../../../../src/model/audit.js';
import { pointDansPhoto } from '../../../../src/render/couleurPhotoAudit.js';
import type { Pixels } from '../../../../src/render/couleurMurPhoto.js';
import { photoDeSynthese, enduit, ecartHex, type Rgb } from '../../render/photoSynthese.js';

// La couleur de la facade sur les photos d'un cas (MD/spec-audit.md §6.2) : lue d'elle-meme quand la
// boussole donne la direction, demandee au doigt sinon, rangee dans le cas (`lectures.facades`).

const W = 320, H = 240;
const BEIGE: Rgb = [201, 180, 154];
/** Une maison de 10 x 8 m ; sa facade sud (y = 0) regarde la rue. */
const CONTOUR = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
const FACADES = facadesDuContour(CONTOUR, 6);
const SUD = FACADES.find((f) => f.orientation === 'Sud')!;
const PRISE: PrisePhoto = {
  t: '2026-10-13T09:00:00Z', x: 5, y: -12, lat: null, lon: null, precisionM: 4, azimutDeg: 0, sourceAzimut: 'boussole',
  inclinaisonDeg: 5, roulisDeg: 2, focale35: 26, champDeg: 69, sourceFocale: 'exif', modeleAppareil: 'iPhone',
};
const mur = photoDeSynthese(PRISE, [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, z0: 0, z1: 6, couleur: enduit(BEIGE) }], W, H);
/** Une photo ou rien n'est d'une meme teinte : la lecture ne conclut pas. */
const fouillis: Pixels = (() => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i % 4 === 3) ? 255 : (i * 2654435761) % 251;
  return { data, largeur: W, hauteur: H };
})();

function monter(img: Pixels, plus: Partial<DependancesCouleur> = {}) {
  const promenade = creerPromenade({ figer: () => ({ identite: { cleBdtopo: 'X', idu: null, adresse: null }, entrees: { pts: CONTOUR, bdtopo: null, grille: null, voisins: [] }, sorties: {} as never }) });
  promenade.marquer('b1', { x: 5, y: -12 }, 4);
  const pixels = vi.fn(async () => img);
  const devant = vi.fn((_cle: string, _p: unknown, cap: number | null) => (cap === null || Math.abs(cap) < 50 ? SUD : null));
  const couleurs = creerCouleursPhotos({ promenade, facades: () => FACADES, devant, limites: () => [], pixels, ...plus });
  const photo = (prise: Partial<PrisePhoto> | null = {}): PhotoCas => {
    const ph: PhotoCas = { type: 'image/jpeg', base64: 'P', ...(prise ? { prise: { ...PRISE, ...prise } } : {}) };
    promenade.completer('b1', { ajouterPhoto: ph });
    return ph;
  };
  return { promenade, couleurs, photo, pixels, devant };
}

describe('la couleur de la facade, lue d elle-meme', () => {
  it('retrouve l enduit et le range dans le cas', async () => {
    const { promenade, couleurs, photo } = monter(mur);
    const ph = photo();
    const avis = vi.fn();
    couleurs.abonner(avis);
    await couleurs.lire('b1', ph);
    const l = promenade.cas('b1')!.lectures!.facades;
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ cote: SUD.cote, source: 'automatique', photo: 0 });
    expect(ecartHex(l[0]!.couleur, BEIGE)).toBeLessThan(8);
    expect(l[0]!.pixels).toBeGreaterThan(40);
    expect(couleurs.etat('b1', ph)).toMatchObject({ etat: 'lue', orientation: 'Sud' });
    expect(avis).toHaveBeenCalled();
  });

  it('va dans le fichier de la promenade, et en revient', async () => {
    const { promenade, couleurs, photo } = monter(mur);
    const ph = photo();
    await couleurs.lire('b1', ph);
    const f = lireFichierPromenade(JSON.parse(JSON.stringify(promenade.fichier({ commune: null, origine: { lat: 0, lon: 0 }, emprise: null, code: { version: 't', commit: null }, regles: { lectureToits: 1, lectureMurs: 1 } }))));
    expect(f.cas[0]!.lectures!.facades[0]).toMatchObject({ cote: SUD.cote, source: 'automatique', photo: 0 });
    // Une copie : le fichier ne bouge plus quand la promenade change.
    const copie = fichierPromenade(f.promenade, f.cas);
    copie.cas[0]!.lectures!.facades[0]!.couleur = '#000000';
    expect(f.cas[0]!.lectures!.facades[0]!.couleur).not.toBe('#000000');
  });

  it('sans direction, sans position ou sans mur devant : la photo reste une photo', async () => {
    const { couleurs, photo, pixels } = monter(mur);
    const sansCap = photo({ azimutDeg: null, sourceAzimut: null });
    await couleurs.lire('b1', sansCap);
    expect(couleurs.etat('b1', sansCap)).toEqual({ etat: 'sansMur', raison: 'direction' });
    const sansPrise = photo(null);
    await couleurs.lire('b1', sansPrise);
    expect(couleurs.etat('b1', sansPrise)).toEqual({ etat: 'sansMur', raison: 'position' });
    const dos = photo({ azimutDeg: 180 });
    await couleurs.lire('b1', dos);
    expect(couleurs.etat('b1', dos)).toEqual({ etat: 'sansMur', raison: 'mur' });
    expect(pixels).not.toHaveBeenCalled();
  });
});

describe('le toucher, quand la lecture ne conclut pas', () => {
  it('lecture ambigue : on demande de toucher, puis la teinte autour du doigt se range', async () => {
    const { promenade, couleurs, photo } = monter(fouillis);
    const ph = photo();
    await couleurs.lire('b1', ph);
    expect(couleurs.etat('b1', ph)).toEqual({ etat: 'toucher', cote: SUD.cote, orientation: 'Sud', raison: 'ambigu' });
    // Le fouillis n'a pas de teinte : le doigt ne conclut pas non plus.
    expect(await couleurs.toucher('b1', ph, 0.5, 0.5)).toBe(false);
    expect(couleurs.etat('b1', ph)).toMatchObject({ etat: 'toucher', raison: 'bord' });
    expect(promenade.cas('b1')!.lectures).toBeUndefined();
  });

  it('direction donnee par la marche : toucher d emblee, sur le mur le plus proche', async () => {
    const { promenade, couleurs, photo, devant, pixels } = monter(mur);
    const ph = photo({ sourceAzimut: 'deplacement', azimutDeg: 120 });
    await couleurs.lire('b1', ph);
    expect(devant).toHaveBeenLastCalledWith('b1', expect.anything(), null);
    expect(couleurs.etat('b1', ph)).toMatchObject({ etat: 'toucher', raison: 'marche', orientation: 'Sud' });
    expect(pixels).not.toHaveBeenCalled();
    const c = pointDansPhoto(PRISE, { x: 5, y: 0, z: 3.5 }, W, H)!;
    expect(await couleurs.toucher('b1', ph, c.u / W, c.v / H)).toBe(true);
    const l = promenade.cas('b1')!.lectures!.facades[0]!;
    expect(l).toMatchObject({ cote: SUD.cote, source: 'toucher', photo: 0 });
    expect(ecartHex(l.couleur, BEIGE)).toBeLessThan(8);
    expect(couleurs.etat('b1', ph)).toMatchObject({ etat: 'lue' });
  });

  it('une photo retiree pendant la lecture ne laisse rien ; les rangs suivent le retrait', async () => {
    const { promenade, couleurs, photo } = monter(mur);
    const a = photo(), b = photo();
    const lecture = couleurs.lire('b1', a);
    promenade.completer('b1', { retirerPhoto: 0 });
    await lecture;
    expect(promenade.cas('b1')!.lectures).toBeUndefined();
    await couleurs.lire('b1', b);
    expect(promenade.cas('b1')!.lectures!.facades.map((l) => l.photo)).toEqual([0]);
  });
});
