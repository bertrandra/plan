import { describe, it, expect, vi } from 'vitest';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { redresserEtFusionner, VERSION_CHAINE_FACADES } from '../../../../src/facade/releve/chaine.js';
import { releverFacade, type MesureFacade, type RejeuFacade } from '../../../../src/app/audit/parcelle/mesures.js';
import { murAConfirmer, relecture, type CorrectionRedressement } from '../../../../src/model/auditParcelle.js';
import type { RunEnregistre } from '../../../../src/regles/facades/observations.js';
import type { IdEtape } from '../../../../src/model/etapeFacade.js';
import { casIaDeScene, sortieSynthetique } from '../../../banc/facades/runIa.js';
import type { PriseCamera, SceneFacade } from '../../../../src/facade/banc/synthese.js';
import { facadeDeLaScene, jpeg, scene, sorties } from './outilsOrchestration.js';

// L'audit ne rejoue plus toute la chaine a chaque geste : quand seuls le mur confirme (V1), les ouvertures relues (V3) ou la lecture de
// Claude changent, il repart de l'etape touchee avec les sorties de son rejeu precedent (`derouler`, `depuis` et `precedent`), comme la
// calibration. Ce fichier prouve que ce rejeu partiel rend exactement ce que rend un rejeu complet (sorties, etats, resumes, actions,
// mesure), et qu'il ne relance ni le calage fin (le worker) ni le groupe Image (redresserEtFusionner).

// redresserEtFusionner, enveloppee pour compter ses appels ; elle calcule comme avant.
vi.mock('../../../../src/facade/releve/chaine.js', async (charger) => {
  const m = await charger<typeof import('../../../../src/facade/releve/chaine.js')>();
  return { ...m, redresserEtFusionner: vi.fn(m.redresserEtFusionner) };
});
const appelsChaine = () => vi.mocked(redresserEtFusionner).mock.calls.length;

type Releve = { mesure: MesureFacade; rejeu: RejeuFacade };
type GestesFacade = RejeuFacade['gestes'];

/** Une facade d'une scene par l'entree reelle de l'audit, le calage fin compte (le worker a l'ecran) ; les etapes commencees notees. */
function auditDe(s: SceneFacade) {
  const { f, contour, corps, images, photos } = facadeDeLaScene(s, [s.synthese.prise as PriseCamera]);
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
}

/**
 * Le rejeu partiel depuis `precedent`, sans worker ni groupe Image, et le complet des memes gestes ; ils rendent la meme chose. Rend le
 * partiel (pour enchainer un autre geste).
 */
async function partielEtComplet(x: ReturnType<typeof auditDe>, gestes: GestesFacade, precedent: Releve, depart: IdEtape): Promise<Releve> {
  const [w, c] = [x.worker(), appelsChaine()];
  const partiel = await x.relever(gestes, precedent.rejeu);
  // Ni le calage fin (le worker) ni redresserEtFusionner : le groupe Image (E3 a E6) est repris tel quel.
  expect(x.worker()).toBe(w);
  expect(appelsChaine()).toBe(c);
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
