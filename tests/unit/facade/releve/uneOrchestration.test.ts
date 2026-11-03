import { describe, it, expect } from 'vitest';
import { derouler, entreesDuCas, veriteDuCas, type Enchainement } from '../../../../src/facade/releve/enchainement.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { mesurerFacade, type MesureFacade } from '../../../../src/app/audit/parcelle/mesures.js';
import { casDepuisFacade, type FacadeACalibrer } from '../../../../src/app/audit/parcelle/casDeCalibration.js';
import { lireCasReel } from '../../../../src/facade/corpusReel.js';
import { accordDeLaLecture } from '../../../../src/app/audit/parcelle/accordLecture.js';
import { VERSION_CHAINE_FACADES } from '../../../../src/facade/releve/chaine.js';
import { casIaDeScene, sortieSynthetique } from '../../../banc/facades/runIa.js';
import type { RunEnregistre } from '../../../../src/regles/facades/observations.js';
import { gabaritDesCorps, relief } from '../../../../src/facade/gabaritMur.js';
import { facadesDuContour } from '../../../../src/geometry/cotesVusDeDehors.js';
import { ETAPES_FACADE } from '../../../../src/model/etapeFacade.js';
import type { Image } from '../../../../src/facade/vision/homographie.js';
import type { PhotoCas, PrisePhoto } from '../../../../src/model/audit.js';
import { murAConfirmer, relecture, type CorrectionRedressement, type MurConfirme, type OuverturesRelues } from '../../../../src/model/auditParcelle.js';
import type { CorpsToit, PtBrut } from '../../../../src/model/types.js';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { photographier, coinsVrais, type PriseCamera, type SceneFacade } from '../../../banc/facades/synthese.js';

// Calibration et audit : le meme code et la meme orchestration, l'audit n'en cache qu'une part (CLAUDE.md, decision du proprietaire du
// 2 novembre 2026). Une facade passe par l'entree reelle de l'audit (mesurerFacade), devient un cas de calibration comme l'admin le
// cree (casDepuisFacade, enregistre puis relu), et se rejoue avec la vue de la calibration et avec celle de l'audit : chaque etape, de
// l'E1 a l'E10, rend la meme chose (coins, assemblage, gabarit, haut lu, analyse, ouvertures, texture), a la verite pres ; l'E11 ne
// differe que par sa fin (V4 dans l'audit, rien d'ecrit en calibration).

/** Une empreinte d'image (FNV-1a sur tous ses octets) : comparer des images entieres couterait des secondes a l'outil de test. */
function empreinte(img: Image | null | undefined): string {
  if (!img) return '-';
  let h = 2166136261;
  for (let i = 0; i < img.donnees.length; i++) { h ^= img.donnees[i] ?? 0; h = Math.imul(h, 16777619); }
  return img.largeur + 'x' + img.hauteur + ':' + (h >>> 0).toString(16);
}
const jpeg = (img: Image) => 'jpeg:' + empreinte(img);

/** Ce que chaque etape a rendu, les images en empreintes ; sans la date du releve (l'horloge) ni ce qui ne sert qu'a la verite. */
function sorties(r: Enchainement) {
  const s = r.sorties, a = s.analyse, m = s.audit?.mesure;
  return {
    preparation: s.preparation,
    vues: s.vues?.map((v) => (v ? [empreinte(v.image), v.versPhoto] : null)),
    calage: s.calage && { photos: s.calage.photos, pose: s.calage.pose && { image: empreinte(s.calage.pose.image), coins: s.calage.pose.coins, vues: s.calage.pose.vues }, explication: s.calage.explication },
    silhouette: s.silhouette, forme: s.forme,
    analyse: a && { elevation: empreinte(a.elevation), facade: empreinte(a.facade.image), texture: empreinte(a.texture), pxParM: a.pxParM, hauteurTexture: a.hauteurTexture, ouvertures: a.ouvertures, devinees: a.devinees, toitEstime: a.toitEstime, fusion: a.fusion && { statut: a.fusion.statut, masque: a.fusion.masque, vues: a.fusion.vues } },
    audit: s.audit && { ...s.audit, mesure: m && { ...m, releve: { ...m.releve, releveLe: '' } } },
    ia: s.ia && { pose: s.ia.pose, ecart: s.ia.ecart, accord: s.ia.accord, descentes: s.ia.descentes },
    facade: s.facade,
  };
}
/** L'etat et le resume de chaque etape de l'E1 a l'E10. */
const etapes = (r: Enchainement | Pick<MesureFacade, 'etapes'>) => (r.etapes ?? []).filter((e) => e.id !== 'validation').map(({ id, etat, resume }) => ({ id, etat, resume }));

/** Une prise de vue d'audit pour une camera du banc : le GPS a sa place (a 1 m pres), la boussole vers le mur, l'EXIF de sa focale. */
function priseDe(p: PriseCamera, L: number): PrisePhoto {
  const b = ((p.biais ?? 0) * Math.PI) / 180;
  return {
    t: '2026-11-02T10:00:00.000Z', x: L / 2 + p.distance * Math.sin(b), y: -p.distance * Math.cos(b), lat: null, lon: null, precisionM: 1,
    azimutDeg: (360 - (p.biais ?? 0)) % 360, sourceAzimut: 'boussole', champDeg: (2 * Math.atan(18 / (p.focale35 ?? 26)) * 180) / Math.PI, sourceFocale: 'exif',
  };
}

/**
 * La facade d'une scene, comme l'audit l'a sous la main : le cote sud d'un batiment de L x 10 m, un deux-pans dont le faitage est
 * perpendiculaire a la facade (un pignon, a la hauteur de celui de la scene), les photos avec leur prise de vue.
 */
function facadeDeLaScene(s: SceneFacade, prises: readonly PriseCamera[]) {
  const L = s.verite.largeur, H = s.verite.hauteur, pg = s.synthese.mur.pignon ?? 0;
  const contour: PtBrut[] = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 10 }, { x: 0, y: 10 }];
  const corps: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: L, y: 10 }, { x: L, y: 0 }], posFaitage: L / 2, faitage: H + pg, egouts: [H, H], pignons: [], ecart: 0 };
  const f = facadesDuContour(contour, H).find((x) => x.normale.y < -0.9);
  if (!f) throw new Error('pas de facade sud');
  const images = prises.map((p) => { const ph = photographier(s, 100, p); if (!ph) throw new Error('prise impossible'); return ph.image; });
  const photos: PhotoCas[] = prises.map((p, k) => ({ type: 'image/jpeg', base64: 'photo-' + k, prise: priseDe(p, L) }));
  return { f, contour, corps, images, photos };
}

/** La facade passee par l'audit, le cas tire d'elle (enregistre, relu), et son rejeu avec chacune des deux vues. */
async function lesDeux(s: SceneFacade, prises: readonly PriseCamera[], corrections: Record<string, CorrectionRedressement>, murConfirme: MurConfirme | null = null, ouverturesRelues: OuverturesRelues | null = null, ia: RunEnregistre | null = null) {
  const { f, contour, corps, images, photos } = facadeDeLaScene(s, prises);
  const chercherCoins = async (e: Parameters<typeof rechercher>[0]) => rechercher(e);
  // L'entree reelle de l'audit (app/audit/parcelle/mesures.ts) : ce que la personne obtient sur place.
  const audit = await mesurerFacade('b1', f, { pts: contour, corpsToit: [corps] }, photos, {
    pixels: async (b64) => { const im = images[Number(b64.slice(6))]; return im ? { largeur: im.largeur, hauteur: im.hauteur, data: im.donnees } : null; },
    chercherCoins, jpeg, limites: () => [],
  }, corrections, { murConfirme, ouverturesRelues, ia });
  // Le cas, tel que l'admin le cree depuis la facade de l'audit, enregistre puis relu.
  const fc: FacadeACalibrer = {
    cle: 'b1', nom: 'Maison', cote: f.cote, orientation: f.orientation, largeurM: f.largeur, hauteurM: f.hauteur, sourceHauteur: 'lidar', photos, corrections,
    ...(murConfirme ? { murConfirme } : {}), ...(ouverturesRelues ? { ouverturesRelues } : {}), bilans: audit.redressement?.photos ?? [], gabarit: gabaritDesCorps(f, [corps], f.hauteur), toit: { mur: { gauche: f.gauche, droite: f.droite }, corps: [corps] }, parement: null, facade: f, contour,
  };
  const cas = lireCasReel(JSON.parse(JSON.stringify({ ...casDepuisFacade(fc), ouvertures: s.verite.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })) })));
  // La lecture de Claude, quand il y en a une : la meme dans les deux vues (decision 4 : elle entre dans l'enchainement de l'audit aussi).
  const avecIa = ia ? { ia } : {};
  const calibration = await derouler(entreesDuCas(cas, images, jpeg), { vue: 'calibration', chercherCoins, verite: veriteDuCas(cas), illustrer: true, ...avecIa });
  const vueAudit = await derouler(entreesDuCas(cas, images, jpeg), { vue: 'audit', chercherCoins, ...avecIa });
  return { audit, cas, calibration, vueAudit, gabarit: fc.gabarit };
}

function memesSorties(x: Awaited<ReturnType<typeof lesDeux>>): void {
  const { audit, calibration, vueAudit } = x;
  // La vue de la calibration et celle de l'audit : chaque etape, de l'E1 a l'E10, rend la meme chose ; la verite n'est qu'un ajout.
  expect(etapes(calibration)).toEqual(etapes(vueAudit));
  expect(calibration.etapes.map((e) => e.id)).toEqual(ETAPES_FACADE.map((e) => e.id));
  const { ...sc } = sorties(calibration), { ...sa } = sorties(vueAudit);
  expect(sc).toEqual(sa);
  // L'E11 : le meme bilan (la Facade que V4 ecrirait) ; seule la fin differe.
  expect(calibration.sorties.facade).toEqual(vueAudit.sorties.facade);
  expect(calibration.etapes.find((e) => e.id === 'validation')?.resume).toMatch(/La calibration n’écrit pas de façade/);
  expect(vueAudit.etapes.find((e) => e.id === 'validation')?.resume).toMatch(/Validez la façade pour l’écrire dans le projet \(V4\)\.$/);
  // L'entree reelle de l'audit rend ce que la calibration a rejoue, etape par etape.
  expect(etapes(audit)).toEqual(etapes(calibration));
  const m = calibration.sorties.audit?.mesure;
  expect(audit.releve && { ...audit.releve, releveLe: '' }).toEqual(m && { ...m.releve, releveLe: '' });
  expect([audit.rangReleve, audit.coinsTrouves, audit.confiance, audit.hauteurM, audit.silhouette, audit.hautLu, audit.devinees]).toEqual([m?.rangReleve, m?.coinsTrouves, m?.confiance, m?.hauteurM, m?.silhouette, m?.hautLu, m?.devinees]);
  expect(audit.redressement).toEqual(calibration.sorties.audit?.redressement);
  expect(audit.redressees).toEqual(calibration.sorties.audit?.redressees);
  expect(audit.imageRun).toEqual(calibration.sorties.audit?.imageRun);
  expect(audit.assemblage ?? null).toEqual(calibration.sorties.audit?.assemblage ?? null);
  expect(audit.facade).toEqual(calibration.sorties.facade);
  // Avec la lecture de Claude : l'accord que l'audit garde est celui de l'E9 de l'enchainement, pas un calcul a cote.
  expect(audit.accord ?? null).toEqual(accordDeLaLecture(calibration.sorties.ia));
}

const scene = (prefixe: string) => {
  const s = chargerCorpus().find((c) => c.nom.startsWith(prefixe));
  if (!s) throw new Error('scene absente');
  return s;
};

describe('calibration et audit : le meme processus, l audit n en cache qu une part', () => {
  it('une photo seule (le pignon et sa fenetre de comble) : les memes sorties a chaque etape', async () => {
    const s = scene('24-');
    const x = await lesDeux(s, [s.synthese.prise as PriseCamera], {});
    expect(relief(x.gabarit)).toBeGreaterThan(0.5);
    expect(x.cas.photos[0]?.prise?.sourceAzimut).toBe('boussole');
    expect(x.cas.facade?.cote).toBe(0);
    memesSorties(x);
    // La verite ne se mesure que dans la calibration, en plus : l'etat et le resume des etapes n'en dependent pas.
    expect(x.calibration.etapes.find((e) => e.id === 'ouvertures')?.verite?.texte).toMatch(/^Contre la vérité \(6 ouvertures\)/);
    expect(x.vueAudit.etapes.every((e) => e.verite === null)).toBe(true);
  }, 240_000);

  it('le mur confirme au point V1 (« Confirmer le mur ») : la meme entree, les memes sorties, l E5 confirmee des deux cotes', async () => {
    const s = scene('24-');
    const avant = await lesDeux(s, [s.synthese.prise as PriseCamera], {});
    const mur = murAConfirmer((avant.audit.redressement?.photos ?? []).map((p) => ({ rang: p.rang, coins: p.coinsPx ?? [] })), '2026-11-03T10:00:00.000Z');
    const x = await lesDeux(s, [s.synthese.prise as PriseCamera], {}, mur);
    expect(x.cas.murConfirme).toEqual(mur);
    memesSorties(x);
    expect(x.audit.etapes?.find((e) => e.id === 'calage')?.etat).toBe('confirme');
    expect(x.calibration.etapes.find((e) => e.id === 'calage')?.etat).toBe('confirme');
  }, 240_000);

  it('les ouvertures relues au point V3 : la meme entree, les memes sorties, l E9 faite des deux cotes et le bilan sur les gardees', async () => {
    const s = scene('24-');
    const avant = await lesDeux(s, [s.synthese.prise as PriseCamera], {});
    const detectees = avant.audit.releve?.ouvertures ?? [];
    const x = await lesDeux(s, [s.synthese.prise as PriseCamera], {}, null, relecture(detectees, detectees.slice(1), '2026-11-03T10:00:00.000Z'));
    memesSorties(x);
    expect(x.audit.facade?.ouvertures).toHaveLength(detectees.length - 1);
  }, 240_000);

  it('avec la lecture de Claude (decision 4) : les memes sorties a chaque etape, accord, diagnostic et bilan (ses pointes) compris', async () => {
    const s = scene('02-');
    const c = casIaDeScene(s);
    if (!c) throw new Error('pas de cas');
    // Une reponse SYNTHETIQUE tiree de la verite de la scene (tests/banc/facades/runIa.ts), pas Claude.
    const run: RunEnregistre = { le: '2026-10-29T12:00:00.000Z', modele: 'synthetique', prompt: 1, schema: 1, passes: 1, sorties: [sortieSynthetique(c, s.synthese.graine % 3, s.synthese.graine)], cout: 0.0011,
      tokens: { entree: 4000, sortie: 800 }, image: { largeur: c.image.largeur, hauteur: c.image.hauteur }, chaine: VERSION_CHAINE_FACADES, synthetique: true };
    const x = await lesDeux(s, [s.synthese.prise as PriseCamera], {}, null, null, run);
    memesSorties(x);
    expect(x.audit.accord?.bilan.boites).toBeGreaterThan(0);
    // La barre de l'audit dit la lecture de Claude a l'E5 et a l'E9, comme la calibration.
    expect(x.audit.etapes?.find((e) => e.id === 'calage')?.resume).toMatch(/IA \(réponse synthétique/);
    expect(x.audit.etapes?.find((e) => e.id === 'ouvertures')?.resume).toMatch(/vues? par Claude/);
    // Le bilan (ce que V4 ecrit) porte ses pointes quand il en voit.
    expect(x.audit.facade?.forme).toEqual(x.calibration.sorties.facade?.forme);
  }, 240_000);

  it('avec la lecture de Claude faite sur l image du run de l audit (le mur cadre) : ses angles reviennent sur l assemblage, accord', async () => {
    // Regression de la decision 4 (#551) : les angles d'un run de l'audit sont aux bords de son image (le mur redresse et cadre, du sol
    // au-dessus du haut) ; lus en parts de l'assemblage, ils posaient le mur sur toute sa largeur et l'E5 disait « les deux chemins
    // divergent ». Ils reviennent par le mur retenu et l'egout de l'image du run.
    const s = scene('02-');
    const c = casIaDeScene(s);
    if (!c) throw new Error('pas de cas');
    const sans = await lesDeux(s, [s.synthese.prise as PriseCamera], {});
    const img = sans.audit.imageRun;
    if (!img) throw new Error('pas d image du run');
    const run: RunEnregistre = { le: '2026-10-29T12:00:00.000Z', modele: 'synthetique', prompt: 1, schema: 1, passes: 1, sorties: [sortieSynthetique(c, s.synthese.graine % 3, s.synthese.graine, { egoutPart: img.egoutPart })], cout: 0.0011,
      tokens: { entree: 4000, sortie: 800 }, image: { largeur: img.largeur, hauteur: img.hauteur }, chaine: VERSION_CHAINE_FACADES, synthetique: true };
    const x = await lesDeux(s, [s.synthese.prise as PriseCamera], {}, null, null, run);
    memesSorties(x);
    const e5 = x.audit.etapes?.find((e) => e.id === 'calage')?.resume ?? '';
    expect(e5).toMatch(/IA \(réponse synthétique.*: accord\./);
    expect(e5).not.toMatch(/divergent/);
    expect(x.calibration.sorties.ia?.ecart ?? 1).toBeLessThan(0.03);
    // Les boites sont dans le repere du mur, quelle que soit l'image : le meme accord a l'E9 que sur l'assemblage.
    expect(x.audit.accord?.bilan.retrouvees).toBeGreaterThan(0);
  }, 360_000);

  it('trois vues d un pignon, la premiere posee a la main : les memes sorties a chaque etape', async () => {
    const s = scene('24-');
    const p0 = s.synthese.prise as PriseCamera;
    const prises: PriseCamera[] = [p0, { ...p0, biais: -22, distance: 12, tangage: 10 }, { ...p0, biais: 25, distance: 12, tangage: 8 }];
    const vrais = coinsVrais(s, p0);
    if (!vrais) throw new Error('coins impossibles');
    const x = await lesDeux(s, prises, { 0: { coins: vrais } });
    memesSorties(x);
    expect(x.calibration.sorties.audit?.redressement.photos).toHaveLength(3);
    expect(x.calibration.sorties.calage?.photos[0]?.origine).toBe('main');
  }, 240_000);
});
