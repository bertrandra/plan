import { describe, it, expect } from 'vitest';
import { analyserSansRien, morceauRedresse, priseSansCapteurs, redresserEtFusionner } from '../../../../src/facade/releve/chaine.js';
import { analyserSerie } from '../../../../src/facade/releve/analyseSerie.js';
import { rechercher, type Morceau } from '../../../../src/facade/releve/serie.js';
import { derouler, entreesDuCas, preparerPourLaMesure } from '../../../../src/facade/releve/enchainement.js';
import { FORMAT_CAS_REEL, type CasStocke } from '../../../../src/facade/corpusReel.js';
import type { Facade } from '../../../../src/geometry/cotesVusDeDehors.js';
import type { Image, P2 } from '../../../../src/facade/vision/homographie.js';
import type { ObjetPolygone } from '../../../../src/model/types.js';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { photographier, coinsVrais, type PriseCamera } from '../../../banc/facades/synthese.js';

// Une seule chaine pour l'audit, le releve et la calibration (facade/releve/chaine.ts) : les memes photos y donnent les memes
// coins, le meme mur redresse et les memes ouvertures, et rien ne s'y perd.

const scene = (prefixe: string) => {
  const s = chargerCorpus().find((c) => c.nom.startsWith(prefixe));
  if (!s) throw new Error('scene absente');
  const prise = s.synthese.prise as PriseCamera;
  const ph = photographier(s, 100, prise), vrais = coinsVrais(s, prise);
  if (!ph || !vrais) throw new Error('scene impossible');
  return { s, ph, vrais };
};
const mur = (L: number, H: number): Facade => ({ cote: 0, gauche: { x: 0, y: 0 }, droite: { x: L, y: 0 }, largeur: L, hauteur: H, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' });
const bat = (L: number) => ({ pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 6 }, { x: 0, y: 6 }] }) as ObjetPolygone;
const cas = (L: number, H: number, image: string, coins: P2[], focalePx: number | null): CasStocke => ({ format: FORMAT_CAS_REEL, version: 1, nom: 'essai', statut: 'brouillon', largeurM: L, hauteurM: H, photos: [{ fichier: 'photo-1', coins, ...(focalePx !== null ? { focalePx } : {}) }], ouvertures: [], images: [image] });
const morceauDe = (image: Image, coins: P2[], focalePx: number | null, doigt: boolean): Morceau => ({ prise: priseSansCapteurs(image, focalePx)(null), coins, ...(doigt ? { sources: ['doigt', 'doigt', 'doigt', 'doigt'] } : {}) });

describe('les coins d une photo, par la chaine de tous', () => {
  it('trouve les quatre angles du mur d une scene de face (calibration)', async () => {
    const { s, ph, vrais } = scene('02-');
    const c = cas(s.verite.largeur, s.verite.hauteur, 'x', [], ph.focalePx);
    const r = await derouler(entreesDuCas(c, [ph.image]), { coins: 'chercher', image: 'assemblage', chercherCoins: async (e) => rechercher(e) });
    const coins = r.sorties.calage?.photos[0]?.coins ?? [];
    expect(coins).toHaveLength(4);
    const px = ph.image.largeur / 40;
    coins.forEach((c, k) => expect(Math.hypot(c.x - (vrais[k] as P2).x, c.y - (vrais[k] as P2).y)).toBeLessThan(px));
  }, 60000);

  it('garde des coins devines, sans rejeter, quand la photo ne montre pas de mur', async () => {
    const L = 640, H = 480;
    const image = { largeur: L, hauteur: H, donnees: new Uint8ClampedArray(L * H * 4).fill(128) };
    const c = await redresserEtFusionner([{ rang: 0, image, prise: priseSansCapteurs(image), champConnu: false }], mur(9, 5), bat(9), { chercherCoins: async (e) => rechercher(e) });
    expect(c.redressement.photos).toHaveLength(1);
    expect(c.redressement.photos[0]?.coins).not.toBe('trouve');
  }, 60000);
});

describe('le meme mur partout', () => {
  it('le releve, l audit et la calibration redressent et cotent une photo calee de meme', async () => {
    const { s, ph, vrais } = scene('02-');
    const L = s.verite.largeur, H = s.verite.hauteur;
    const releve = analyserSerie([morceauDe(ph.image, vrais, ph.focalePx, true)], mur(L, H), H, bat(L));
    const calibration = (await preparerPourLaMesure(cas(L, H, 'x', vrais, ph.focalePx), [ph.image])).prepare;
    expect(releve && calibration).toBeTruthy();
    expect(calibration?.pxParM).toBe(releve?.r.pxParM);
    // La calibration lit l'assemblage des photos redressees entieres (un reechantillonnage de plus) : les memes ouvertures, au cm pres.
    const a = calibration?.ouvertures ?? [], b = releve?.r.ouvertures ?? [];
    expect(a).toHaveLength(b.length);
    a.forEach((o, k) => { const q = b[k]; for (const c of ['x', 'y', 'l', 'h'] as const) expect(Math.abs(o[c] - (q?.[c] ?? NaN))).toBeLessThanOrEqual(0.02); });
  }, 60000);
});

describe('la calibration lit l assemblage', () => {
  it('redresse la facade complete d un pignon decentre, et son gabarit dit le toit', async () => {
    const { s, ph, vrais } = scene('22-');
    const L = s.verite.largeur, H = s.verite.hauteur, pg = s.synthese.mur.pignon ?? 0;
    const { prepare: p } = await preparerPourLaMesure({ ...cas(L, H, 'x', vrais, null), gabarit: [{ u: 0, v: 1 }, { u: 0.4, v: 1 + pg / H }, { u: 1, v: 1 }] }, [ph.image]);
    expect(p?.assemblage?.vues).toEqual([{ assemblee: true, motif: null }]);
    expect(p?.fusion).toBeNull();
    expect(p?.toitEstime).toMatchObject({ forme: 'deux-pans', faitage: 'perpendiculaire' });
    expect(p?.toitEstime?.hauteur).toBeCloseTo(pg, 0);
    expect(p?.toitEstime?.sommet).toBeCloseTo(0.4, 1);
    // La texture couvre le pignon entier, au-dessus de l'egout.
    expect(p?.hauteurTexture).toBeGreaterThan(H + pg);
  }, 60000);
});

describe('plutot un resultat que rien', () => {
  it('des coins croises cedent la place a ceux de la prise de vue', () => {
    const { s, ph, vrais } = scene('02-');
    const L = s.verite.largeur, H = s.verite.hauteur;
    const croises = [vrais[1], vrais[0], vrais[2], vrais[3]] as P2[];
    const m = morceauDe(ph.image, croises, ph.focalePx, false);
    const { a, retenus } = analyserSansRien([m], mur(L, H), H, bat(L), 'morceaux');
    expect(a).not.toBeNull();
    expect(retenus[0]?.coins).not.toEqual(croises);
  }, 60000);

  it('ne touche jamais des coins poses au doigt', () => {
    const { s, ph, vrais } = scene('02-');
    const m = morceauDe(ph.image, vrais.map((c) => ({ x: c.x + 30, y: c.y })), ph.focalePx, true);
    expect(morceauRedresse(m, mur(s.verite.largeur, s.verite.hauteur), s.verite.hauteur)).toBe(m);
  });
});
