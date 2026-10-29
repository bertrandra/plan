// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranCalibration, type DepsCalibration } from '../../../src/zones/EcranCalibration.js';
import { FORMAT_CAS_REEL, type CasStocke, type DocumentCalibration } from '../../../src/facade/corpusReel.js';
import type { Image } from '../../../src/facade/vision/homographie.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import type { IdEtape } from '../../../src/model/etapeFacade.js';
import { lireObservationsFacade, type ObservationsFacade, type RunEnregistre } from '../../../src/regles/facades/observations.js';

// L'ecran Admin › Calibrer la detection, branche sur de fausses dependances : la liste des cas, un nouveau cas avec ses photos,
// la mesure et la calibration sur un cas fabrique d'une scene du banc, et l'application des reglages.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
const ImageOrigine = window.Image;
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  (SVGElement.prototype as unknown as { getScreenCTM: () => null }).getScreenCTM = () => null;
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); (window as unknown as { Image: unknown }).Image = ImageOrigine; });

/**
 * Un mur de 9 x 5 m a 100 px/m, trois fenetres sombres, pris de face avec un peu de ciel autour et le gazon au pied : ses angles se
 * voient (un mur coupe au bord de la photo ne dit pas ou il finit, le calage par les ancres ne l'explique pas). Les coins sont ceux du mur.
 */
const scene = (() => {
  const M = 100, L = 900, H = 500, LI = L + 2 * M, HI = H + 2 * M, donnees = new Uint8ClampedArray(LI * HI * 4);
  const baies = [1, 4, 7].map((x) => ({ type: 'fenetre' as const, x, y: 2, l: 1, h: 1.4 }));
  for (let j = 0; j < HI; j++) for (let i = 0; i < LI; i++) {
    const x = i - M, y = j - M;
    const dedans = baies.some((b) => x >= b.x * 100 && x < (b.x + b.l) * 100 && y >= H - (b.y + b.h) * 100 && y < H - b.y * 100);
    const c = x < 0 || x >= L || y < 0 ? (y >= H ? [92, 112, 72] : [176, 196, 222]) : y >= H ? [92, 112, 72] : dedans ? [38, 44, 54] : [205, 186, 152];
    const k = (j * LI + i) * 4;
    donnees[k] = c[0] as number; donnees[k + 1] = c[1] as number; donnees[k + 2] = c[2] as number; donnees[k + 3] = 255;
  }
  const coins = [{ x: M, y: M }, { x: M + L, y: M }, { x: M + L, y: M + H }, { x: M, y: M + H }];
  const cas: CasStocke = { format: FORMAT_CAS_REEL, version: 1, nom: 'Synthèse 02', statut: 'valide', largeurM: 9, hauteurM: 5, photos: [{ fichier: 'p', coins }], images: ['data:image/jpeg;base64,SCENE'], ouvertures: baies };
  return { cas, image: { largeur: LI, hauteur: HI, donnees } as Image };
})();

/** Le registre de l'ecran, comme app/administration/ecranCalibration.ts le monte : ouvrir une etape, escalader la reponse rejouee. */
function registre(): Pick<DepsCalibration, 'commandes' | 'ecouterEtape' | 'ecouterEscalade'> {
  const commandes = creerRegistre();
  let ouvrir: ((id: IdEtape) => void) | null = null;
  let escalader: (() => void) | null = null;
  commandes.declarer({ id: 'facade.etape', libelle: 'Ouvrir une étape', groupe: 'facade', executer: (s) => { if (s?.dataset.etape) ouvrir?.(s.dataset.etape as IdEtape); } });
  commandes.declarer({ id: 'facade.escalader', libelle: 'Escalader', groupe: 'facade', executer: () => { escalader?.(); } });
  return { commandes, ecouterEtape: (f) => { ouvrir = f; return () => { ouvrir = null; }; }, ecouterEscalade: (f) => { escalader = f; return () => { escalader = null; }; } };
}

function fausses(plus: Partial<DepsCalibration> = {}) {
  const docs: DocumentCalibration[] = [];
  const stock = new Map<string, CasStocke>([['cas-a', scene.cas]]);
  const deps: DepsCalibration = {
    lireCalibration: async () => null,
    enregistrerCalibration: vi.fn(async (d: DocumentCalibration) => { docs.push(d); return null; }),
    lister: async () => [...stock.entries()].map(([id, c]) => ({ id, nom: c.nom, statut: c.statut, photos: c.photos.length, ouvertures: c.ouvertures.length, updatedAt: '2026-10-17T10:00:00.000Z' })),
    lireCas: async (id) => stock.get(id),
    enregistrerCas: vi.fn(async (id: string, c: CasStocke) => { stock.set(id, c); return null; }),
    supprimerCas: vi.fn(async (id: string) => { stock.delete(id); return null; }),
    reduirePhoto: async () => 'data:image/jpeg;base64,NEUVE',
    decoder: async (): Promise<Image> => scene.image,
    elevationEnUrl: () => 'data:image/jpeg;base64,ELEV',
    maintenant: () => new Date('2026-10-17T10:00:00Z'),
    ...registre(),
    ...plus,
  };
  return { deps, docs, stock };
}

const bouton = (c: string) => hote.querySelector(`[data-controle="${c}"]`) as HTMLButtonElement | null;
async function monter(deps: DepsCalibration) {
  await act(async () => { racine.render(createElement(EcranCalibration, { deps })); await Promise.resolve(); await Promise.resolve(); });
}
const attendre = async (ms = 0) => { await act(async () => { await new Promise((ok) => setTimeout(ok, ms)); }); };
/** Attend qu'une condition tienne (le calcul automatique dure plus ou moins selon la machine), 10 s au plus. */
const attendreQue = async (ok: () => boolean) => { for (let t = 0; t < 100 && !ok(); t++) await attendre(100); };

describe('l ecran de calibration', () => {
  it('liste les cas du serveur et propose un nouveau cas', async () => {
    const { deps } = fausses();
    await monter(deps);
    expect(hote.textContent).toContain('Calibrer la détection');
    expect(hote.textContent).toContain('Synthèse 02');
    expect(hote.textContent).toContain('Valeurs livrées en usage');
    expect(bouton('calibration.nouveauCas')).not.toBeNull();
    expect(bouton('calibration.revenir')?.disabled).toBe(true);
  });

  it('depuis un audit : chaque facade montre ses photos en vignettes au bout de sa ligne', async () => {
    const cas = { ...scene.cas, images: ['data:image/jpeg;base64,UN', 'data:image/jpeg;base64,DEUX'] };
    const { deps } = fausses({ audits: async () => [{ id: 'a1', libelle: 'Audit du 21 octobre' }], facadesDAudit: async () => [{ libelle: 'Maison · façade sud', cas }] });
    await monter(deps);
    await act(async () => { bouton('calibration.depuisAudit')?.click(); await Promise.resolve(); });
    await act(async () => { bouton('calibration.choisirAudit')?.click(); await Promise.resolve(); });
    const ligne = hote.querySelector('.calFacadeAudit') as HTMLElement;
    const vignettes = [...ligne.querySelectorAll('.calVignettesFacade img')] as HTMLImageElement[];
    expect(vignettes.map((i) => i.getAttribute('src'))).toEqual(cas.images);
    expect(vignettes[1]?.getAttribute('alt')).toBe('Photo 2 : Maison · façade sud');
    // Les vignettes viennent apres le bouton de la facade, au bout de la ligne.
    expect(ligne.lastElementChild?.className).toBe('calVignettesFacade');
  });

  it('enregistre un nouveau cas : nom, photo, dimensions, relu sur la photo', async () => {
    const { deps, stock } = fausses();
    await monter(deps);
    await act(async () => { bouton('calibration.nouveauCas')?.click(); });
    // Sans nom, l'enregistrement est refuse avec un mot clair.
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); });
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/nom/);
    const nom = hote.querySelector('[data-controle="calibration.nomCas"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(nom, 'Maison nord'); nom.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); });
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/photo/);
    const champ = hote.querySelector('[data-controle="calibration.photo"]') as HTMLInputElement;
    Object.defineProperty(champ, 'files', { value: [new File(['x'], 'p.jpg')], configurable: true });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
    // Ajouter une photo cherche ses coins, redresse le mur et propose la detection, sans autre geste.
    await attendreQue(() => !!bouton('calibration.proposer'));
    expect(hote.querySelectorAll('[aria-label="Photos du cas"] li')).toHaveLength(1);
    expect(hote.querySelectorAll('.releveCoins [role="slider"]')).toHaveLength(4);
    expect(hote.querySelector('[data-controle="calibration.originePhoto"]')?.textContent).toMatch(/coins (trouvés|devinés|lus sur l’assemblage)/);
    expect(bouton('calibration.proposer')).not.toBeNull();
    expect(hote.textContent).toMatch(/\d+ ouvertures? annotée/);
    const valide = hote.querySelector('[data-controle="calibration.valide"]') as HTMLInputElement;
    await act(async () => { valide.click(); });
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    const ajoute = [...stock.entries()].find(([id]) => id.startsWith('cas-') && id !== 'cas-a');
    expect(ajoute?.[1]).toMatchObject({ nom: 'Maison nord', statut: 'valide', images: ['data:image/jpeg;base64,NEUVE'] });
    expect(ajoute?.[1].photos[0]?.coins).toHaveLength(4);
    // Le cas rejoint la liste et l'editeur se ferme.
    expect(hote.textContent).toContain('Maison nord');
    expect(bouton('calibration.enregistrerCas')).toBeNull();
  });

  it('ajoute une seconde photo : le rejeu seul, la photo qui ne se redresse pas est signalee et gardee', async () => {
    const grise: Image = { largeur: 640, hauteur: 480, donnees: new Uint8ClampedArray(640 * 480 * 4).fill(128) };
    let n = 0;
    const { deps } = fausses({ decoder: async () => (n++ < 2 ? scene.image : grise) });
    await monter(deps);
    await act(async () => { bouton('calibration.nouveauCas')?.click(); });
    const champ = hote.querySelector('[data-controle="calibration.photo"]') as HTMLInputElement;
    for (let k = 0; k < 2; k++) {
      Object.defineProperty(champ, 'files', { value: [new File(['x'], 'p' + k + '.jpg')], configurable: true });
      await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
      await attendre(1500);
    }
    // Le rejeu de la seconde photo peut finir apres l'attente fixe sur une machine chargee : on attend
    // ce qu'il ecrit plutot qu'une duree.
    await attendreQue(() => /coins devinés, à vérifier/.test(hote.textContent ?? '') && !!hote.querySelector('.barreFacadeSegment.echec'));
    expect(hote.querySelectorAll('[aria-label="Photos du cas"] li')).toHaveLength(2);
    expect(hote.textContent).toMatch(/coins devinés, à vérifier/);
    // La barre le dit sur son segment « Image », et l'etape du redressement, ouverte, dit pourquoi et quel geste faire.
    expect(hote.querySelector('.barreFacadeSegment.echec')?.textContent).toMatch(/Image/);
    await act(async () => { (hote.querySelector('.calFrise [data-etape="redressement"]') as HTMLButtonElement).click(); });
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/ne se redresse pas : posez quatre repères/);
    expect(hote.querySelectorAll('.barreFacadeLigne')[0]?.textContent).toBe('Image : redressement, en échec');
  }, 60_000);

  it('rejoue un cas, part de la detection pour annoter, et enregistre', async () => {
    const { deps, stock } = fausses();
    await monter(deps);
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    await act(async () => { bouton('calibration.rejouer')?.click(); });
    await attendreQue(() => !!bouton('calibration.proposer'));
    // Le rejeu montre la barre de progression et la frise des etapes, chacune avec son etat.
    expect(hote.querySelectorAll('.barreFacade ol > li')).toHaveLength(8);
    expect(hote.querySelectorAll('.calFrise > li')).toHaveLength(9);
    expect(hote.querySelector('.barreFacadeSegment.echec')).toBeNull();
    expect(bouton('calibration.proposer')).not.toBeNull();
    expect(hote.textContent).toMatch(/\d+ ouvertures? annotée/);
    await act(async () => { bouton('calibration.viderBaies')?.click(); });
    expect(hote.textContent).toContain('0 ouverture');
    await act(async () => { bouton('calibration.proposer')?.click(); });
    expect(hote.textContent).toContain('3 ouvertures annotées');
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    expect(stock.get('cas-a')?.ouvertures).toHaveLength(3);
  }, 60_000);

  it('rappelle Claude (le run d une facade), enregistre sa reponse avec son cout et ses versions, et la rejoue en mode IA', async () => {
    // Une reponse SYNTHETIQUE (pas Claude) : les angles du mur et ses trois fenetres, en parts de l'assemblage et du mur.
    const sortie = { calage: { angles: { gauche: { x: 0.091, egout: 0.143, sol: 0.857, confiance: 'forte' }, droite: { x: 0.909, egout: 0.143, sol: 0.857, confiance: 'forte' } }, pointes: [], appentis: [], corps: [], cache: [] },
      forme: { silhouette: 'ligne-droite', bout: 'sans-objet' }, elements: [], surface: { principale: 'enduit', zones: [], confiance: 'forte' }, confiance: 'forte',
      ouvertures: [1, 4, 7].map((x) => ({ type: 'fenetre', u0: x / 9, u1: (x + 1) / 9, v0: 0.4, v1: 0.68, niveau: 0, travee: 'indetermine', confiance: 'forte', details: { volets: 'aucun', allege: 'pleine', forme: 'rect' },
        carreaux: { vantaux: 2, colonnes: 1, rangees: 3, petitsBois: 'fins', imposte: 'aucune', vitrage: 'clair' } })) };
    const run = { le: '2026-10-29T12:00:00.000Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, passes: 3 as const, sorties: [sortie, sortie, sortie], cout: 0.0039, tokens: { entree: 12600, sortie: 2700 }, image: { largeur: 1100, hauteur: 700 }, chaine: 10 };
    const appelerClaude = vi.fn(async () => ({ run, reponse: lireObservationsFacade(sortie) as ObservationsFacade }));
    // L'escalade (SYNTHETIQUE) lit de la pierre la ou le vote lit de l'enduit : elle l'emporte sur le parement.
    const escalade = { le: '2026-10-29T12:05:00.000Z', modele: 'claude-sonnet-5-5', prompt: 2, schema: 2, sortie: { ...sortie, surface: { ...sortie.surface, principale: 'pierre' } }, cout: 0.0261, tokens: { entree: 4200, sortie: 900 } };
    const escaladerClaude = vi.fn(async (_d: unknown, r: RunEnregistre) => ({ run: { ...r, escalade } }));
    const { deps, stock } = fausses({ appelerClaude, escaladerClaude, prixEscalade: async () => ({ modele: 'claude-sonnet-5-5', prix: { entree: 3, sortie: 15 } }) });
    await monter(deps);
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    // Sans reponse enregistree, le mode IA n'est pas propose ; on rappelle Claude.
    expect(bouton('calibration.modeIa')?.disabled).toBe(true);
    await act(async () => { bouton('calibration.rejouer')?.click(); });
    await attendreQue(() => !!bouton('calibration.rappelerClaude') && !bouton('calibration.rappelerClaude')?.disabled);
    await act(async () => { bouton('calibration.rappelerClaude')?.click(); });
    await attendreQue(() => /Réponse enregistrée/.test(hote.textContent ?? '') && !bouton('calibration.rejouer')?.disabled);
    // Trois passes votees : la production (le reglage `facades.ia.passes`).
    expect(appelerClaude).toHaveBeenCalledWith(expect.objectContaining({ passes: 3, texte: expect.stringMatching(/^Façade : Synthèse 02\./) }));
    expect(hote.textContent).toContain('Réponse enregistrée : Claude, 2026-10-29, trois passes votées, claude-haiku-5-5, prompt v1, schéma v1, 0,0039 $');
    expect(bouton('calibration.modeIa')?.getAttribute('aria-pressed')).toBe('true');
    // L'E4 dit l'accord de Claude, l'E7 ses boites retrouvees par la detection.
    const ouvrir = async (id: string) => { await act(async () => { (hote.querySelector(`.calFrise [data-etape="${id}"]`) as HTMLButtonElement | null)?.click(); }); };
    await ouvrir('calage');
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/IA \(Claude, 2026-10-29.*accord/);
    expect(hote.querySelector('.calEtapeOuverte')?.textContent).toMatch(/IA : Claude, 2026-10-29.*règles [0-9a-f]{8}/);
    await ouvrir('ouvertures');
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/3 ouvertures vues par Claude : 3 retrouvées par la détection/);
    expect(hote.querySelectorAll('.calBoiteIa.cochee')).toHaveLength(3);
    await act(async () => { (hote.querySelector('.calBoiteIa') as SVGElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(hote.querySelectorAll('.calCarreau').length).toBeGreaterThan(0);
    expect(hote.querySelector('.calTexteIa')?.textContent).toBe('2 vantaux de 1 × 3 carreaux, petits bois fins, sans imposte, vitrage clair');

    // L'escalade, a la demande : le bouton de la commande `facade.escalader` annonce son modele et son cout (une passe du run).
    const esc = () => hote.querySelector('[data-commande="facade.escalader"]') as HTMLButtonElement | null;
    expect(esc()?.textContent).toBe('Escalader vers claude-sonnet-5-5 (≈ 0,0261 $)');
    await act(async () => { esc()?.click(); });
    await attendreQue(() => /Escalade enregistrée/.test(hote.textContent ?? '') && !bouton('calibration.rejouer')?.disabled);
    expect(escaladerClaude).toHaveBeenCalledTimes(1);
    expect(hote.textContent).toContain('Escalade enregistrée : Claude, 2026-10-29, trois passes votées, claude-haiku-5-5, prompt v1, schéma v1, 0,0039 $, escaladée (claude-sonnet-5-5, 0,0261 $)');
    await ouvrir('calage');
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/Escalade \(claude-sonnet-5-5\) : elle l’emporte sur le parement\. Parement : pierre/);
    // Une seule escalade par reponse : le bouton le dit et se grise.
    expect([esc()?.textContent, esc()?.disabled]).toEqual(['Escaladée (claude-sonnet-5-5)', true]);
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    // Le cas garde la reponse et son escalade, pour la rejouer sans reseau.
    expect(stock.get('cas-a')?.ia).toEqual([{ ...run, escalade }]);
  }, 60_000);

  it('mesure les cas valides, cherche de meilleurs reglages et les applique', async () => {
    const { deps, docs } = fausses();
    await monter(deps);
    await act(async () => { bouton('calibration.charger')?.click(); });
    await attendre(100);
    expect(hote.textContent).toContain('Valeurs livrées');
    expect(hote.textContent).toContain('Valeurs en usage (serveur)');
    expect(hote.textContent).toMatch(/Sous 20 cas validés/);
    await act(async () => { bouton('calibration.calibrer')?.click(); });
    await attendre(1500);
    const region = hote.querySelector('[aria-label="Proposition de calibration"]');
    expect(region).not.toBeNull();
    const appliquer = bouton('calibration.appliquer');
    if (appliquer && !appliquer.disabled) {
      await act(async () => { appliquer.click(); await Promise.resolve(); });
      await attendre(10);
      expect(docs).toHaveLength(1);
      expect(docs[0]?.format).toBe('plan-calibration');
      expect(docs[0]?.historique).toHaveLength(1);
      expect(Object.keys(docs[0]?.parametres ?? {}).every((n) => n.startsWith('facades.'))).toBe(true);
    } else {
      expect(region?.textContent).toMatch(/Aucun changement/);
    }
  }, 120_000);

  it('montre les reglages calibres en usage et revient aux valeurs livrees, historique garde', async () => {
    const doc: DocumentCalibration = { format: 'plan-calibration', version: 1, modifieLe: '2026-10-16T08:00:00.000Z', parametres: { 'facades.detection.areteNette': 0.7 },
      historique: [{ t: '2026-10-16T08:00:00.000Z', casValides: 3, modifications: [{ nom: 'facades.detection.areteNette', avant: 0.6, apres: 0.7, gain: 0.02 }], avant: { precision: 0.8, rappel: 0.7, f1: 0.75, brier: 0.1 }, apres: { precision: 0.9, rappel: 0.8, f1: 0.85, brier: 0.08 } }] };
    const { deps, docs } = fausses({ lireCalibration: async () => doc });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await monter(deps);
    expect(hote.textContent).toContain('1 réglage calibré en usage');
    expect(hote.textContent).toContain('F1 75 % → 85 %');
    await act(async () => { bouton('calibration.revenir')?.click(); await Promise.resolve(); });
    await attendre(10);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.parametres).toEqual({});
    expect(docs[0]?.historique).toHaveLength(1);
    expect(hote.textContent).toContain('Valeurs livrées en usage');
  });
});
