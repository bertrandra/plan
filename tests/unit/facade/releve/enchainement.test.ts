import { describe, it, expect } from 'vitest';
import { assemblageDuRejeu, casAvecLeMur, casCaleALaMain, derouler, murAjusteSurLesPhotos, entreesDuCas, etapeDe, originesDuCas, preparerPourLaMesure, type Enchainement } from '../../../../src/facade/releve/enchainement.js';
import { imagesEtapes } from '../../../../src/facade/releve/imagesEtapes.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { analyserLeMur } from '../../../../src/facade/analyseMur.js';
import { GABARIT_RECTANGLE, gabaritSurLaPhoto } from '../../../../src/facade/gabaritMur.js';
import { VERSION_CHAINE_FACADES } from '../../../../src/facade/releve/chaine.js';
import { EMPREINTE_OBJECTIFS } from '../../../../src/facade/regles/facades/enchainement.js';
import { ETAPES_FACADE, type IdEtape } from '../../../../src/model/etapeFacade.js';
import { FORMAT_CAS_REEL, type CasStocke } from '../../../../src/facade/corpusReel.js';
import type { Image, P2 } from '../../../../src/facade/vision/homographie.js';
import { readFileSync } from 'node:fs';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { lireEtalon } from '../../../banc/facades/reel.js';
import { sceneAe101 } from '../../../banc/facades/ae101.js';
import { photographier, coinsVrais, type PriseCamera } from '../../../banc/facades/synthese.js';
import { casIaDeScene, sortieSynthetique } from '../../../banc/facades/runIa.js';
import type { RunEnregistre } from '../../../../src/regles/facades/observations.js';
import { veriteDuCas } from '../../../../src/facade/releve/enchainement.js';
import { lireRunEnregistre } from '../../../../src/regles/facades/observations.js';
import { facadesDuContour } from '../../../../src/geometry/cotesVusDeDehors.js';
import { reconstruireCorps, type Grille } from '../../../../src/facade/toits/toitCorps.js';
import { toitMesureDepuisGrille } from '../../../../src/model/toitMesure.js';
import type { PtBrut } from '../../../../src/model/types.js';

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
    // L'E9 (lot F5) : le bilan de la facade, la Facade que la validation V4 ecrirait ; la calibration le montre sans rien ecrire.
    const f = r.sorties.facade;
    expect(f?.dimensions).toMatchObject({ largeurM: Math.round(L * 100) / 100, egoutM: Math.round(H * 100) / 100 });
    expect(f?.forme.gabarit).toEqual(GABARIT_RECTANGLE);
    expect(f?.textureCalee?.pxParM).toBeGreaterThan(0);
    expect(f?.ouvertures.map((o) => o.id)).toEqual(r.sorties.analyse?.ouvertures.map((_, i) => 'o' + (i + 1)));
    expect(etapeDe(r, 'validation').resume).toMatch(/^Bilan : Mur de .* La calibration n’écrit pas de façade : elle se valide dans l’audit \(V4\)\.$/);
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

  it('donne a l E4 l etat de l arbitre du calage : a confirmer quand une autre pose explique mieux la photo, echec quand aucune (AE 101 en synthese)', async () => {
    const etalon = lireEtalon(JSON.parse(readFileSync('tests/fixtures/facades-reel/etalons/ae101-sud.json', 'utf8')));
    const leurre = [{ x: 451, y: 220 }, { x: 752, y: 220 }, { x: 752, y: 301 }, { x: 451, y: 301 }];
    const rejeu = async (angle: 'buisson' | 'arbre') => {
      const sc = sceneAe101(etalon, angle);
      return derouler({ largeurM: etalon.largeurM, hauteurM: etalon.hauteurM, gabarit: etalon.gabarit, photos: [{ image: sc.image, coins: leurre, reperes: null, focalePx: null, murALaMain: false }] },
        { coins: 'garder', image: 'assemblage', verite: { calage: etalon.calageVrai } });
    };
    const b = etapeDe(await rejeu('buisson'), 'calage');
    expect(b.etat).toBe('a-confirmer');
    expect(b.resume).toMatch(/retenue : celle qui l’explique, x de 1\d\d à 7\d\d/);
    // Les coins gardes du cas (le bloc du pignon) n'expliquent pas la photo : c'est dit, et la verite les dit faux.
    expect(b.resume).toMatch(/Mur retenu : x de 45\d à 75\d .* il n’explique pas la photo/);
    expect(b.verite?.juste).toBe(false);
    const a = etapeDe(await rejeu('arbre'), 'calage');
    expect(a.etat).toBe('echec');
    expect(a.resume).toMatch(/Aucune pose n’explique la photo sans le toit.*Posez les deux angles/);
  }, 120_000);

  it('E5 bis et E8 (lot F4) : sur AE 101 sud, le pignon est que le LiDAR du soir a perdu, propose sur le corps principal, a confirmer', async () => {
    const etalon = lireEtalon(JSON.parse(readFileSync('tests/fixtures/facades-reel/etalons/ae101-sud.json', 'utf8')));
    const soir = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101-lidar-soir.json', 'utf8')) as { contour: PtBrut[]; grille: Grille };
    const corps = reconstruireCorps(toitMesureDepuisGrille(soir.grille as never, soir.contour)!, soir.contour, { grille: soir.grille })!;
    const f = facadesDuContour(soir.contour, 0).find((x) => x.cote === etalon.source.cote)!;
    const sc = sceneAe101(etalon, 'buisson');
    const coins = [{ x: sc.vrai.x0, y: sc.vrai.y0 }, { x: sc.vrai.x1, y: sc.vrai.y0 }, { x: sc.vrai.x1, y: sc.vrai.y1 }, { x: sc.vrai.x0, y: sc.vrai.y1 }];
    const ia = lireRunEnregistre(JSON.parse(readFileSync('tests/fixtures/facades-ia/ae101-sud-synthetique.json', 'utf8')));
    const e = { largeurM: etalon.largeurM, hauteurM: etalon.hauteurM, gabarit: etalon.gabarit, photos: [{ image: sc.image, coins, reperes: null, focalePx: null, murALaMain: true }] };
    const r = await derouler({ ...e, toit: { mur: { gauche: f.gauche, droite: f.droite }, corps } }, { coins: 'garder', image: 'assemblage', ia, verite: { toit: etalon.toitVrai } });
    const d = etapeDe(r, 'diagnostic');
    expect(d.etat).toBe('a-confirmer');
    expect(d.resume).toMatch(/Tronçons : corps 1, long pan de u 0 à 1\./);
    expect(d.resume).toMatch(/Proposition \(à confirmer\) : corps 1, long pan : un pignon de plus .* d’après Claude seul/);
    expect(d.verite).toMatchObject({ juste: true });
    expect(r.sorties.forme?.diagnostic?.propositions).toHaveLength(1);
    expect(etapeDe(r, 'toit')).toMatchObject({ etat: 'a-confirmer' });
    expect(etapeDe(r, 'toit').resume).toMatch(/^1 proposition de toit à confirmer dans l’avant\/après de l’audit \(corps 1, long pan\), décochée/);
    // Sans les corps du toit, rien ne se compare : les deux etapes sont sautees, et le reste ne change pas.
    const sans = await derouler(e, { coins: 'garder', image: 'assemblage', ia });
    expect([etapeDe(sans, 'diagnostic').etat, etapeDe(sans, 'toit').etat]).toEqual(['saute', 'saute']);
    expect(sans.etapes.filter((x) => x.id !== 'diagnostic' && x.id !== 'toit')).toEqual(r.etapes.filter((x) => x.id !== 'diagnostic' && x.id !== 'toit'));
  }, 120_000);

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

describe('« Ajuster l’égout et le sol » depuis les reperes de la calibration : sur l assemblage, comme a l E4', () => {
  it('avec deux vues : l assemblage du rejeu, son mur, et le meme chemin vers les photos que le calage a la main', async () => {
    const s = chargerCorpus().find((c) => c.nom.startsWith('18-'));
    if (!s) throw new Error('scene absente');
    const prises = [s.synthese.prise, ...(s.synthese.vues ?? [])].slice(0, 2) as PriseCamera[];
    const phs = prises.map((p) => photographier(s, 100, p)), vrais = prises.map((p) => coinsVrais(s, p));
    if (phs.some((p) => !p) || vrais.some((v) => !v)) throw new Error('prise impossible');
    const c = casDe(s.verite.largeur, s.verite.hauteur, vrais[0] as P2[], null, { images: ['x', 'y'], photos: vrais.map((v, k) => ({ fichier: 'photo-' + (k + 1), coins: v as P2[] })) });
    const r = await derouler(entreesDuCas(c, phs.map((p) => (p as NonNullable<typeof p>).image)), { coins: 'garder', image: 'assemblage' });
    const pose = r.sorties.calage?.pose;
    const a = assemblageDuRejeu(r, (img) => 'adresse-' + img.largeur);
    if (!a || !pose) throw new Error('pas d assemblage');
    // L'image montree est celle du calage (l'assemblage), avec le mur qui y est pose.
    expect(a.url).toBe('adresse-' + pose.image.largeur);
    expect(a.coins).toEqual(pose.coins);
    expect(a.retours.map((x) => x.rang)).toEqual([0, 1]);
    // Le mur tire, ramene sur chaque photo : le meme que celui de « Appliquer le calage et rejouer » (casCaleALaMain).
    const tire = a.coins.map((q, k) => ({ x: q.x, y: q.y - (k < 2 ? 10 : 0) }));
    const parPhoto = murAjusteSurLesPhotos(a, tire);
    const cale = casCaleALaMain(c, r, tire), avec = casAvecLeMur(c, parPhoto);
    expect(avec.photos.map((p) => p.coins)).toEqual(cale.photos.map((p) => p.coins));
    expect(avec.photos.every((p) => p.murALaMain)).toBe(true);
    // Sans y toucher, le mur revient sur la photo d'ou il venait.
    murAjusteSurLesPhotos(a, a.coins).get(0)?.forEach((q, k) => { expect(Math.abs(q.x - ((vrais[0] as P2[])[k] as P2).x)).toBeLessThan(0.2); expect(Math.abs(q.y - ((vrais[0] as P2[])[k] as P2).y)).toBeLessThan(0.2); });
  }, 120_000);

  it('avec une photo seule : pas d assemblage a montrer, la photo redressee comme avant', async () => {
    const { s, ph, vrais } = scene('02-');
    const r = await derouler(entreesDuCas(casDe(s.verite.largeur, s.verite.hauteur, vrais, ph.focalePx), [ph.image]), { coins: 'garder', image: 'assemblage' });
    expect(r.sorties.calage?.pose).not.toBeNull();
    expect(assemblageDuRejeu(r, () => 'u')).toBeNull();
  }, 60_000);
});

describe('le mode « IA » du rejeu (lot F2) : une reponse enregistree, rejouee sans reseau, decidee par le moteur', () => {
  const { s, ph, vrais } = scene('02-');
  const L = s.verite.largeur, H = s.verite.hauteur;
  const c = casIaDeScene(s);
  if (!c) throw new Error('pas de cas');
  // Une reponse SYNTHETIQUE tiree de la verite de la scene (tests/banc/facades/runIa.ts), avec la fenetre qu'elle invente.
  const run = (sortie: object): RunEnregistre => ({ le: '2026-10-29T12:00:00.000Z', modele: 'synthetique', prompt: 1, schema: 1, passes: 1, sorties: [sortie], cout: 0.0011, tokens: { entree: 4000, sortie: 800 },
    image: { largeur: c.image.largeur, hauteur: c.image.hauteur }, chaine: VERSION_CHAINE_FACADES, synthetique: true });
  const sortie = sortieSynthetique(c, s.synthese.graine % 3, s.synthese.graine) as { calage: { angles: Record<string, { x: number }> } };
  const cas = casDe(L, H, vrais, ph.focalePx, { ouvertures: s.verite.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })) });

  it('pose candidate a l E4 (accord), boites accordees a l E7, version et cout dits', async () => {
    const r = await derouler(entreesDuCas(cas, [ph.image]), { coins: 'garder', image: 'assemblage', ia: run(sortie), verite: veriteDuCas(cas) });
    expect(etapeDe(r, 'calage').resume).toMatch(/IA \(réponse synthétique \(pas de Claude\), 2026-10-29, une passe, synthetique, prompt v1, schéma v1, 0,0011 \$\) : ses angles posent le mur .* accord/);
    expect(etapeDe(r, 'silhouette').resume).toMatch(/Claude lit : ligne droite/);
    expect(etapeDe(r, 'ouvertures').resume).toMatch(/ouvertures vues par Claude : \d+ retrouvées par la détection, 1 seule, proposée décochée/);
    expect(etapeDe(r, 'ouvertures').etat).toBe('a-confirmer');
    expect(etapeDe(r, 'ouvertures').verite?.texte).toMatch(/Boîtes de Claude : rappel/);
    expect(r.versions.ia).toMatch(/^[0-9a-f]{8}$/);
    const im = imagesEtapes(r, { largeurM: L, hauteurM: H, gabarit: GABARIT_RECTANGLE, photos: [{ coins: vrais }] });
    expect(im.ia?.pose).not.toBeNull();
    expect(im.ia?.boites.filter((b) => !b.cochee)).toHaveLength(1);
  }, 60_000);

  it('dit la divergence quand ses angles tombent loin du mur retenu : l E4 est a confirmer', async () => {
    const loin = JSON.parse(JSON.stringify(sortie)) as typeof sortie;
    for (const a of Object.values(loin.calage.angles)) a.x += 0.1;
    const r = await derouler(entreesDuCas(cas, [ph.image]), { coins: 'garder', image: 'assemblage', ia: run(loin) });
    expect(etapeDe(r, 'calage').resume).toMatch(/les deux chemins divergent, à confirmer/);
    expect(etapeDe(r, 'calage').etat).toBe('a-confirmer');
    // Sans Claude, aucune version des regles de l'IA, aucune phrase de Claude.
    const sans = await derouler(entreesDuCas(cas, [ph.image]), { coins: 'garder', image: 'assemblage' });
    expect(sans.versions.ia).toBeUndefined();
    expect(etapeDe(sans, 'calage').resume).not.toMatch(/IA \(/);
  }, 60_000);
});

