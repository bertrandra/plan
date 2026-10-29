import { describe, it, expect } from 'vitest';
import { casCaleALaMain, derouler, entreesDuCas, etapeDe, originesDuCas, preparerPourLaMesure, type Enchainement } from '../../../../src/facade/releve/enchainement.js';
import { imagesEtapes } from '../../../../src/facade/releve/imagesEtapes.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { analyserLeMur } from '../../../../src/facade/analyseMur.js';
import { GABARIT_RECTANGLE, gabaritSurLaPhoto } from '../../../../src/facade/gabaritMur.js';
import { VERSION_CHAINE_FACADES } from '../../../../src/facade/releve/chaine.js';
import { EMPREINTE_OBJECTIFS } from '../../../../src/facade/regles/facades/enchainement.js';
import { ETAPES_FACADE, type IdEtape } from '../../../../src/model/etapeFacade.js';
import { FORMAT_CAS_REEL, type CasStocke } from '../../../../src/facade/corpusReel.js';
import type { Image, P2 } from '../../../../src/facade/vision/homographie.js';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { photographier, coinsVrais, type PriseCamera } from '../../../banc/facades/synthese.js';

// L'orchestrateur de l'enchainement d'une facade (facade/releve/enchainement.ts, MD/spec-facade-calage-audit.md §4 ter.4) : l'etat de
// chaque etape est calcule, la chaine est appelee telle quelle (le rejeu d'un cas du banc rend ce qu'elle rend), et l'on peut
// reprendre depuis une etape ou s'arreter en route.

const scene = (prefixe: string) => {
  const s = chargerCorpus().find((c) => c.nom.startsWith(prefixe));
  if (!s) throw new Error('scene absente');
  const prise = s.synthese.prise as PriseCamera;
  const ph = photographier(s, 100, prise), vrais = coinsVrais(s, prise);
  if (!ph || !vrais) throw new Error('scene impossible');
  return { s, ph, vrais };
};
const casDe = (L: number, H: number, coins: P2[], focalePx: number | null, plus: Partial<CasStocke> = {}): CasStocke => ({
  format: FORMAT_CAS_REEL, version: 1, nom: 'essai', statut: 'brouillon', largeurM: L, hauteurM: H, ouvertures: [], images: ['x'],
  photos: [{ fichier: 'photo-1', coins, ...(focalePx !== null ? { focalePx } : {}) }], ...plus,
});
type OptionsEnchainement = Parameters<typeof derouler>[1];
/** Le mur pose (haut gauche, haut droit, bas droit, bas gauche) ramene a ses bouts. */
const rectDeLaPose = (c: readonly P2[]) => ({ x0: ((c[0] as P2).x + (c[3] as P2).x) / 2, x1: ((c[1] as P2).x + (c[2] as P2).x) / 2 });
const CHERCHER: OptionsEnchainement = { coins: 'chercher', image: 'assemblage', chercherCoins: async (e) => rechercher(e) };
const etats = (r: Enchainement) => Object.fromEntries(r.etapes.map((e) => [e.id, e.etat]));

describe('l enchainement d une facade', () => {
  const { s, ph, vrais } = scene('02-');
  const L = s.verite.largeur, H = s.verite.hauteur;

  it('calcule l etat de chaque etape, dans l ordre du tableau, et dit ses versions', async () => {
    const vus: string[] = [];
    const r = await derouler(entreesDuCas(casDe(L, H, vrais, ph.focalePx), [ph.image]), { ...CHERCHER, surEtape: (id, e) => vus.push(id + ':' + e) });
    expect(r.etapes.map((e) => e.id)).toEqual(ETAPES_FACADE.map((e) => e.id));
    expect(etats(r)).toMatchObject({ preparation: 'ok', prises: 'ok', redressement: 'ok', assemblage: 'ok', silhouette: 'ok', texture: 'ok', diagnostic: 'saute', toit: 'saute', validation: 'saute' });
    expect(['ok', 'a-confirmer']).toContain(etapeDe(r, 'calage').etat);
    expect(r.etapes.every((e) => e.resume.length > 10)).toBe(true);
    // La barre avance au fil des etapes : chacune commence, puis finit.
    expect(vus.slice(0, 4)).toEqual(['preparation:en-cours', 'preparation:ok', 'prises:en-cours', 'prises:ok']);
    expect(vus.filter((v) => v.endsWith(':en-cours'))).toHaveLength(ETAPES_FACADE.length);
    expect(r.versions).toEqual({ chaine: VERSION_CHAINE_FACADES, objectifs: EMPREINTE_OBJECTIFS });
    // Les images de chaque etape : la vue redressee, l'assemblage et le mur, le mur retenu, la texture.
    const im = imagesEtapes(r, { largeurM: L, hauteurM: H, gabarit: GABARIT_RECTANGLE, photos: [{ coins: vrais }] });
    expect(!!im.vues[0]?.image).toBe(true);
    expect(im.assemblage?.mur.x1).toBeGreaterThan(im.assemblage?.mur.x0 ?? Infinity);
    expect(im.pose?.proposees.length).toBe(r.sorties.analyse?.ouvertures.length);
    expect(im.texture?.l).toBeCloseTo(L, 1);
  }, 60_000);

  it('mesure les coins gardes par la chaine du releve : les memes ouvertures qu analyserLeMur', async () => {
    const cas = casDe(L, H, vrais, ph.focalePx);
    const { r, prepare } = await preparerPourLaMesure(cas, [ph.image]);
    const direct = analyserLeMur({ largeur: L, hauteur: H, contour: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 6 }, { x: 0, y: 6 }], cote: 0, distance: null },
      [{ photo: ph.image, coins: vrais, focalePx: ph.focalePx, silhouette: gabaritSurLaPhoto(GABARIT_RECTANGLE, vrais), reperes: null }], 'vues');
    expect(prepare?.pxParM).toBe(direct?.r.pxParM);
    expect(prepare?.ouvertures).toEqual(direct?.r.ouvertures);
    expect(prepare?.cas === cas).toBe(true);
    expect(etapeDe(r, 'calage').resume).toMatch(/coins du cas/);
  }, 60_000);

  it('reprend depuis une etape avec les sorties des precedentes, et rend les memes cotes', async () => {
    const e = entreesDuCas(casDe(L, H, vrais, ph.focalePx), [ph.image]);
    const r = await derouler(e, { coins: 'garder', image: 'assemblage' });
    const suite = await derouler(e, { coins: 'garder', image: 'assemblage', depuis: 'texture', precedent: r });
    // Des identites, pas des egalites : comparer des images entieres coute des secondes a l'outil de test.
    expect(suite.sorties.mosaique === r.sorties.mosaique && suite.sorties.calage === r.sorties.calage).toBe(true);
    expect(suite.sorties.analyse === r.sorties.analyse).toBe(false);
    const cotes = (x: Enchainement) => x.sorties.analyse?.ouvertures.map((o) => [o.type, o.x, o.y, o.l, o.h]);
    expect(cotes(suite)).toEqual(cotes(r));
    expect(suite.etapes.find((x) => x.id === 'assemblage') === r.etapes.find((x) => x.id === 'assemblage')).toBe(true);
  }, 60_000);

  it('s arrete quand la personne le demande : les etapes restantes restent a venir', async () => {
    let n = 0;
    const r = await derouler(entreesDuCas(casDe(L, H, vrais, ph.focalePx), [ph.image]), { coins: 'garder', image: 'assemblage', arrete: () => ++n > 3 });
    expect(r.etapes.slice(0, 3).map((x) => x.etat)).toEqual(['ok', 'ok', 'ok']);
    expect(r.etapes.slice(3).every((x) => x.etat === 'a-venir')).toBe(true);
  }, 60_000);

  it('dit ce qui manque sans photo, sans rien rejeter', async () => {
    const r = await derouler({ largeurM: 9, hauteurM: 5, gabarit: GABARIT_RECTANGLE, photos: [] }, { coins: 'garder', image: 'assemblage' });
    expect(etapeDe(r, 'prises').etat).toBe('echec');
    for (const id of ['redressement', 'calage', 'silhouette', 'texture', 'ouvertures'] as IdEtape[]) expect(etapeDe(r, id).etat).toBe('a-venir');
  });

  it('mesure le calage contre la verite : un mur pose de travers est dit faux, en part de la largeur', async () => {
    const e = entreesDuCas(casDe(L, H, vrais, ph.focalePx), [ph.image]);
    const r = await derouler(e, { coins: 'garder', image: 'assemblage' });
    const m = rectDeLaPose(r.sorties.calage?.pose?.coins ?? []);
    const juste = await derouler(e, { coins: 'garder', image: 'assemblage', verite: { calage: { x0: m.x0, x1: m.x1, versionChaine: VERSION_CHAINE_FACADES } } });
    expect(etapeDe(juste, 'calage').verite).toMatchObject({ juste: true });
    // Un mur vrai deux fois plus large, a gauche : le bout gauche est loin (le defaut d'AE 101, un seul bloc retenu).
    const w = m.x1 - m.x0;
    const faux = await derouler(e, { coins: 'garder', image: 'assemblage', verite: { calage: { x0: m.x0 - w, x1: m.x1, versionChaine: VERSION_CHAINE_FACADES } } });
    expect(etapeDe(faux, 'calage').verite?.juste).toBe(false);
    expect(etapeDe(faux, 'calage').verite?.texte).toMatch(/bout gauche à 50 %.*faux/);
  }, 60_000);

  it('mesure les ouvertures contre la verite du cas', async () => {
    const cas = casDe(L, H, vrais, ph.focalePx, { ouvertures: s.verite.ouvertures as never });
    const { r } = await preparerPourLaMesure(cas, [ph.image]);
    expect(etapeDe(r, 'ouvertures').verite).toMatchObject({ juste: true });
    expect(etapeDe(r, 'ouvertures').verite?.texte).toMatch(/rappel 100 %, précision 100 %/);
  }, 60_000);
});

describe('le cas de calibration dans l enchainement', () => {
  const carre = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const cas = {
    nom: 'Cas', largeurM: 8, hauteurM: 5, statut: 'brouillon', ouvertures: [], images: ['a', 'b', 'c'],
    photos: [{ fichier: 'photo-1', coins: carre, murALaMain: true }, { fichier: 'photo-2', coins: carre, reperes: carre }, { fichier: 'photo-3', coins: carre }],
  } as unknown as CasStocke;

  it('relit d ou viennent les coins : le mur pose a la main, puis les reperes', () => {
    expect(originesDuCas(cas)).toEqual({ 0: 'main', 1: 'reperes' });
    const e = entreesDuCas(cas, [{} as Image, {} as Image, {} as Image]);
    expect(e.photos.map((p) => [p.murALaMain, !!p.reperes])).toEqual([[true, false], [false, true], [false, false]]);
    expect(e.gabarit).toBe(GABARIT_RECTANGLE);
  });

  it('pose le mur cale a la main sur l assemblage sur chaque photo assemblee, comme un mur pose a la main', async () => {
    const { s, ph, vrais } = scene('02-');
    const c = casDe(s.verite.largeur, s.verite.hauteur, vrais, ph.focalePx);
    const r = await derouler(entreesDuCas(c, [ph.image]), { coins: 'garder', image: 'assemblage' });
    const pose = r.sorties.calage?.pose?.coins ?? [];
    const cale = casCaleALaMain(c, r, pose);
    expect(cale.photos[0]?.murALaMain).toBe(true);
    // Le mur retenu, ramene sur la photo, retombe sur les coins d'ou il venait (au dixieme de pixel pres de l'arrondi).
    cale.photos[0]?.coins.forEach((q, k) => { expect(Math.abs(q.x - (vrais[k] as P2).x)).toBeLessThan(0.2); expect(Math.abs(q.y - (vrais[k] as P2).y)).toBeLessThan(0.2); });
  }, 60_000);
});
