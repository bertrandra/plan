import { describe, it, expect, vi } from 'vitest';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { coinsDesPhotos, assemblerLesPhotos, VERSION_CHAINE_FACADES } from '../../../../src/facade/releve/chaine.js';
import { mosaiqueDesVues } from '../../../../src/facade/vision/mosaiqueFuites.js';
import { murAjusteSurLesPhotos } from '../../../../src/facade/releve/enchainement.js';
import { releverFacade, type MesureFacade, type RejeuFacade } from '../../../../src/app/audit/parcelle/mesures.js';
import { murAConfirmer, relecture, type CorrectionRedressement } from '../../../../src/model/auditParcelle.js';
import type { RunEnregistre } from '../../../../src/regles/facades/observations.js';
import type { IdEtape } from '../../../../src/model/etapeFacade.js';
import { casIaDeScene, sortieSynthetique } from '../../../banc/facades/runIa.js';
import type { PriseCamera, SceneFacade } from '../../../../src/facade/banc/synthese.js';
import type { P2 } from '../../../../src/facade/vision/homographie.js';
import { facadeDeLaScene, jpeg, scene, sorties } from './outilsOrchestration.js';

// L'audit ne rejoue plus toute la chaine a chaque geste : quand seuls le mur tire ou confirme (V1), les ouvertures relues (V3) ou la
// lecture de Claude changent, il repart de l'etape touchee avec les sorties de son rejeu precedent (`derouler`, `depuis` et `precedent`),
// comme la calibration. Ce fichier prouve que ce rejeu partiel rend exactement ce que rend un rejeu complet (sorties, etats, resumes,
// actions, mesure), et qu'il ne relance ni le calage fin (le worker) ni les coins de l'E4, ni l'assemblage de l'E6 (ni aucune mosaique).

// Les temps de la chaine, enveloppes pour compter leurs appels ; ils calculent comme avant.
vi.mock('../../../../src/facade/releve/chaine.js', async (charger) => {
  const m = await charger<typeof import('../../../../src/facade/releve/chaine.js')>();
  return { ...m, coinsDesPhotos: vi.fn(m.coinsDesPhotos), assemblerLesPhotos: vi.fn(m.assemblerLesPhotos) };
});
vi.mock('../../../../src/facade/vision/mosaiqueFuites.js', async (charger) => {
  const m = await charger<typeof import('../../../../src/facade/vision/mosaiqueFuites.js')>();
  return { ...m, mosaiqueDesVues: vi.fn(m.mosaiqueDesVues) };
});
const appelsChaine = () => vi.mocked(coinsDesPhotos).mock.calls.length;
const appelsAssemblage = () => vi.mocked(assemblerLesPhotos).mock.calls.length;
const appelsMosaique = () => vi.mocked(mosaiqueDesVues).mock.calls.length;

type Releve = { mesure: MesureFacade; rejeu: RejeuFacade };
type GestesFacade = RejeuFacade['gestes'];

/** Une facade d'une scene par l'entree reelle de l'audit, le calage fin compte (le worker a l'ecran) ; les etapes commencees notees. */
const auditDe = (s: SceneFacade) => auditDesPrises(s, [s.synthese.prise as PriseCamera]);

/** Une facade de plusieurs prises d'une scene, par l'entree reelle de l'audit (comme auditDe). */
function auditDesPrises(s: SceneFacade, prises: readonly PriseCamera[]) {
  const { f, contour, corps, images, photos } = facadeDeLaScene(s, prises);
  let worker = 0;
  let commencees: IdEtape[] = [];
  const d = {
    pixels: async (b64: string) => { const im = images[Number(b64.slice(6))]; return im ? { largeur: im.largeur, hauteur: im.hauteur, data: im.donnees } : null; },
    chercherCoins: async (e: Parameters<typeof rechercher>[0]) => { worker++; return rechercher(e); },
    jpeg, limites: () => [],
    surEtape: (id: IdEtape, etat: string) => { if (etat === 'en-cours') commencees.push(id); },
  };
  const relever = (gestes: GestesFacade, precedent: RejeuFacade | null = null, corrections: Record<string, CorrectionRedressement> = {}): Promise<Releve> => {
    commencees = [];
    return releverFacade('b1', f, { pts: contour, corpsToit: [corps] }, photos, d, corrections, gestes, precedent);
  };
  return { relever, worker: () => worker, commencees: () => commencees };
}

/** La mesure sans la date du releve (l'horloge du rejeu qui l'a fait). */
const sansDate = (m: MesureFacade) => ({ ...m, releve: m.releve && { ...m.releve, releveLe: '' } });

/** Le rejeu partiel et le rejeu complet rendent la meme chose : chaque etape (etat, resume, actions), chaque sortie, la mesure. */
function memes(partiel: Releve, complet: Releve): void {
  const a = partiel.rejeu.enchainement, b = complet.rejeu.enchainement;
  expect(a.etapes).toEqual(b.etapes);
  expect(sorties(a)).toEqual(sorties(b));
  expect(a.versions).toEqual(b.versions);
  expect(sansDate(partiel.mesure)).toEqual(sansDate(complet.mesure));
  expect(partiel.rejeu.entrees).toBe(complet.rejeu.entrees);
  expect(partiel.rejeu.gestes).toEqual(complet.rejeu.gestes);
  expect(partiel.rejeu.mur).toBe(complet.rejeu.mur);
}

/**
 * Le mur tire sur l'image prise pour la suite (V1, « Ajuster l'égout et le sol »), comme l'ecran le fait : le mur retenu, l'egout descendu
 * de `part` de la hauteur du mur, ramene sur chaque photo de l'image (murAjusteSurLesPhotos), en coins poses a la main.
 */
function murTire(r: Releve, part: number): Record<string, CorrectionRedressement> {
  const s = r.rejeu.enchainement.sorties, coins = s.calage?.pose?.coins ?? [], retours = s.audit?.retours ?? [];
  if (coins.length !== 4 || !retours.length) throw new Error('pas de mur a tirer');
  const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
  const dy = (bg.y - hg.y) * part;
  const tire = [{ x: hg.x, y: hg.y + dy }, { x: hd.x, y: hd.y + dy }, bd, bg];
  return Object.fromEntries([...murAjusteSurLesPhotos({ retours }, tire)].map(([rang, c]) => [String(rang), { coins: c }]));
}

/**
 * Un geste qui touche le mur tire : le rejeu partiel depuis `precedent` et le complet rendent la meme chose. `depart` : l'etape d'ou le
 * partiel repart ; depuis l'E7, ni le calage fin, ni les coins de l'E4, ni l'assemblage de l'E6, ni aucune mosaique.
 */
async function murPartielEtComplet(x: ReturnType<typeof auditDe>, corrections: Record<string, CorrectionRedressement>, precedent: Releve, depart: IdEtape): Promise<Releve> {
  const [w, c, a, m] = [x.worker(), appelsChaine(), appelsAssemblage(), appelsMosaique()];
  const t0 = performance.now();
  const partiel = await x.relever({}, precedent.rejeu, corrections);
  const tPartiel = performance.now() - t0;
  expect(x.commencees()[0]).toBe(depart);
  if (depart === 'calage') {
    expect(x.worker()).toBe(w);
    expect([appelsChaine(), appelsAssemblage(), appelsMosaique()]).toEqual([c, a, m]);
  }
  const t1 = performance.now();
  const complet = await x.relever({}, null, corrections);
  const tComplet = performance.now() - t1;
  expect(x.commencees()[0]).toBe('preparation');
  memes(partiel, complet);
  // Le temps du geste, pour la PR (mesure, pas un seuil).
  console.info(`mur tire, depuis ${depart} : ${Math.round(tPartiel)} ms ; tout rejouer : ${Math.round(tComplet)} ms`);
  return partiel;
}

/**
 * Le rejeu partiel depuis `precedent`, sans worker ni groupe Image, et le complet des memes gestes ; ils rendent la meme chose. Rend le
 * partiel (pour enchainer un autre geste).
 */
async function partielEtComplet(x: ReturnType<typeof auditDe>, gestes: GestesFacade, precedent: Releve, depart: IdEtape): Promise<Releve> {
  const [w, c, m] = [x.worker(), appelsChaine(), appelsMosaique()];
  const partiel = await x.relever(gestes, precedent.rejeu);
  // Ni le calage fin (le worker), ni les coins de l'E4, ni aucune mosaique : le groupe Image (E3 a E6) est repris tel quel.
  expect(x.worker()).toBe(w);
  expect(appelsChaine()).toBe(c);
  expect(appelsMosaique()).toBe(m);
  expect(x.commencees()[0]).toBe(depart);
  expect(x.commencees()).not.toContain('objectif');
  const complet = await x.relever(gestes);
  expect(appelsChaine()).toBe(c + 1);
  expect(x.worker()).toBeGreaterThan(w);
  memes(partiel, complet);
  return partiel;
}

/** Une reponse SYNTHETIQUE de Claude tiree de la verite de la scene (tests/banc/facades/runIa.ts), pas Claude. */
function reponseDe(s: SceneFacade, le: string, graine = 0): RunEnregistre {
  const c = casIaDeScene(s);
  if (!c) throw new Error('pas de cas');
  return { le, modele: 'synthetique', prompt: 1, schema: 1, passes: 1, sorties: [sortieSynthetique(c, (s.synthese.graine + graine) % 3, s.synthese.graine + graine)], cout: 0.0011,
    tokens: { entree: 4000, sortie: 800 }, image: { largeur: c.image.largeur, hauteur: c.image.hauteur }, chaine: VERSION_CHAINE_FACADES, synthetique: true };
}

describe('audit des facades : le rejeu partiel apres V1, V3 ou une reponse de Claude rend ce que rend un rejeu complet', () => {
  it('V1 puis V3 (le pignon et sa fenetre de comble) : depuis l E7, puis depuis l E12, les memes sorties que tout rejouer', async () => {
    const x = auditDe(scene('24-'));
    const depart = await x.relever({});
    expect(appelsChaine()).toBeGreaterThan(0);
    // V1 : « Confirmer le mur ».
    const mur = murAConfirmer((depart.mesure.redressement?.photos ?? []).map((p) => ({ rang: p.rang, coins: p.coinsPx ?? [] })), '2026-11-07T10:00:00.000Z');
    const v1 = await partielEtComplet(x, { murConfirme: mur }, depart, 'calage');
    expect(v1.mesure.etapes?.find((e) => e.id === 'calage')?.etat).toBe('confirme');
    // V3 : les ouvertures relues, une retiree ; le rejeu repart du rejeu partiel de V1.
    const detectees = v1.mesure.releve?.ouvertures ?? [];
    expect(detectees.length).toBeGreaterThan(1);
    const relues = relecture(detectees, detectees.slice(1), '2026-11-07T10:05:00.000Z');
    const v3 = await partielEtComplet(x, { murConfirme: mur, ouverturesRelues: relues }, v1, 'ouvertures');
    expect(v3.mesure.facade?.ouvertures).toHaveLength(detectees.length - 1);
    expect(v3.mesure.etapes?.find((e) => e.id === 'ouvertures')?.etat).toBe('ok');
    // Et V1 defait (Ctrl+Z) : depuis l'E7 encore, le mur redevient celui de la chaine.
    const defait = await partielEtComplet(x, { ouverturesRelues: relues }, v3, 'calage');
    expect(defait.mesure.etapes?.find((e) => e.id === 'calage')?.etat).not.toBe('confirme');
  }, 480_000);

  it('une reponse de Claude arrivee, puis une autre : depuis l E8, les memes sorties que tout rejouer', async () => {
    const s = scene('02-');
    const x = auditDe(s);
    const depart = await x.relever({});
    const run = reponseDe(s, '2026-11-07T11:00:00.000Z');
    const avecClaude = await partielEtComplet(x, { ia: run }, depart, 'lectureIa');
    expect(avecClaude.mesure.accord?.bilan.boites).toBeGreaterThan(0);
    expect(avecClaude.mesure.etapes?.find((e) => e.id === 'lectureIa')?.resume).toMatch(/^IA \(réponse synthétique/);
    // Une autre lecture (une escalade, un nouvel appel) : depuis l'E8 encore ; l'E7 relit ses angles sur le meme mur.
    await partielEtComplet(x, { ia: reponseDe(s, '2026-11-07T12:00:00.000Z', 1) }, avecClaude, 'lectureIa');
    // V1 et la reponse ensemble : depuis la plus tot des deux, l'E7.
    const mur = murAConfirmer((depart.mesure.redressement?.photos ?? []).map((p) => ({ rang: p.rang, coins: p.coinsPx ?? [] })), '2026-11-07T13:00:00.000Z');
    await partielEtComplet(x, { ia: run, murConfirme: mur }, depart, 'calage');
  }, 480_000);

  it('V1 : tirer le mur sur une photo seule repart de l E7, sans calage fin ni assemblage ; tire encore, puis retire (de l E4)', async () => {
    const x = auditDe(scene('02-'));
    const depart = await x.relever({});
    const tire = await murPartielEtComplet(x, murTire(depart, 0.02), depart, 'calage');
    expect(tire.mesure.redressement?.photos[0]?.coins).toBe('main');
    expect(tire.mesure.etapes?.find((e) => e.id === 'calage')?.resume).toMatch(/^Mur posé à la main\./);
    expect(tire.mesure.etapes?.find((e) => e.id === 'coins')?.resume).toMatch(/coins posés à la main/);
    // Tire une seconde fois, depuis le rejeu partiel : depuis l'E7 encore.
    const encore = await murPartielEtComplet(x, murTire(tire, -0.01), tire, 'calage');
    // Retire (« Revenir à l'automatique ») : les coins se cherchent de nouveau, le calage fin aussi ; depuis l'E4, pas l'E3.
    const w = x.worker();
    const retire = await murPartielEtComplet(x, {}, encore, 'coins');
    expect(x.worker()).toBeGreaterThan(w);
    expect(retire.mesure.redressement?.photos[0]?.coins).not.toBe('main');
  }, 480_000);

  it('V1 : tirer le mur sur l assemblage de trois vues repart de l E7, les memes sorties que tout rejouer', async () => {
    const s = scene('24-');
    const p0 = s.synthese.prise as PriseCamera;
    const x = auditDesPrises(s, [p0, { ...p0, biais: -22, distance: 12, tangage: 10 }, { ...p0, biais: 25, distance: 12, tangage: 8 }]);
    const depart = await x.relever({});
    expect(depart.rejeu.enchainement.sorties.audit?.assemblage?.retours.length).toBeGreaterThanOrEqual(2);
    const tire = await murPartielEtComplet(x, murTire(depart, 0.02), depart, 'calage');
    expect(tire.mesure.redressement?.photos.filter((p) => p.coins === 'main').length).toBeGreaterThanOrEqual(2);
    // Puis V1 « Confirmer le mur » sur ce mur : depuis l'E7, le mur tire garde.
    const mur = murAConfirmer((tire.mesure.redressement?.photos ?? []).map((p) => ({ rang: p.rang, coins: p.coinsPx ?? [] })), '2026-11-07T14:00:00.000Z');
    const corrections = murTire(depart, 0.02);
    const [w, c] = [x.worker(), appelsChaine()];
    const confirme = await x.relever({ murConfirme: mur }, tire.rejeu, corrections);
    expect([x.worker(), appelsChaine(), x.commencees()[0]]).toEqual([w, c, 'calage']);
    expect(confirme.mesure.etapes?.find((e) => e.id === 'calage')?.etat).toBe('confirme');
  }, 480_000);

  it('tout autre changement rejoue tout : une correction, une autre version de la chaine, rien de garde', async () => {
    const x = auditDe(scene('24-'));
    const depart = await x.relever({});
    const mur = murAConfirmer((depart.mesure.redressement?.photos ?? []).map((p) => ({ rang: p.rang, coins: p.coinsPx ?? [] })), '2026-11-07T10:00:00.000Z');
    // Rien de garde : tout.
    const tout = async (precedent: RejeuFacade | null, gestes: GestesFacade) => {
      const c = appelsChaine();
      await x.relever(gestes, precedent);
      expect(appelsChaine()).toBe(c + 1);
      expect(x.commencees()[0]).toBe('preparation');
    };
    await tout(null, { murConfirme: mur });
    // Rien de change (ce qui ne devrait pas arriver : la signature n'a pas bouge) : tout.
    await tout(depart.rejeu, {});
    // Une autre version de la chaine : tout.
    await tout({ ...depart.rejeu, enchainement: { ...depart.rejeu.enchainement, versions: { ...depart.rejeu.enchainement.versions, chaine: VERSION_CHAINE_FACADES - 1 } } }, { murConfirme: mur });
    // Une correction (la largeur du mur corrigee a la main) avec V1 : les entrees ont change, la chaine repart du debut.
    const c = appelsChaine();
    const corrige = await x.relever({ murConfirme: mur }, depart.rejeu, { 0: { echelleLargeurM: 9.2 } });
    expect(appelsChaine()).toBe(c + 1);
    expect(x.commencees()).toContain('objectif');
    expect(corrige.rejeu.entrees).not.toBe(depart.rejeu.entrees);
  }, 240_000);
});
