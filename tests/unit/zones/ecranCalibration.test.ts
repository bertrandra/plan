// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranCalibration, type DepsCalibration } from '../../../src/zones/EcranCalibration.js';
import { preparerLesPhotos, texteDesRefus } from '../../../src/zones/EditeurCasCalibration.js';
import { VERITE_SANS_ASSEMBLAGE } from '../../../src/facade/photosDuCas.js';
import { FORMAT_CAS_REEL, type CasStocke, type DocumentCalibration } from '../../../src/facade/corpusReel.js';
import type { Image } from '../../../src/facade/vision/homographie.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { ETAPES_FACADE, SEGMENTS_FACADE, etapeFacade, type IdEtape } from '../../../src/model/etapeFacade.js';
import { lireObservationsFacade, type ObservationsFacade, type RunEnregistre } from '../../../src/regles/facades/observations.js';

// L'ecran Admin › Calibrer la detection, branche sur de fausses dependances : la liste des cas, un cas tire d'une facade d'un audit
// (la calibration ne prend pas de photos, lot F6 ; elle en importe dans un cas ouvert quand l'ecran le lui permet, 9 novembre 2026), la mesure et la calibration sur un cas fabrique d'une scene du banc, et
// l'application des reglages.

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
function registre(): Pick<DepsCalibration, 'commandes' | 'ecouterEtape' | 'ecouterEscalade' | 'ecouterChoix' | 'ecouterForcage'> {
  const commandes = creerRegistre();
  let ouvrir: ((id: IdEtape) => void) | null = null;
  let escalader: (() => void) | null = null;
  commandes.declarer({ id: 'facade.etape', libelle: 'Ouvrir une étape', groupe: 'facade', executer: (s) => { if (s?.dataset.etape) ouvrir?.(s.dataset.etape as IdEtape); } });
  commandes.declarer({ id: 'facade.escalader', libelle: 'Escalader', groupe: 'facade', executer: () => { escalader?.(); } });
  // Les choix (lot C2), comme app/administration/ecranCalibration.ts les declare.
  let choisir: Parameters<NonNullable<DepsCalibration['ecouterChoix']>>[0] | null = null, forcer: Parameters<NonNullable<DepsCalibration['ecouterForcage']>>[0] | null = null;
  commandes.declarer({ id: 'facade.choisirSource', libelle: 'Choisir', groupe: 'facade', executer: (b) => { const c = b?.dataset.cle, x = b?.dataset.source; if (c && x) choisir?.(c, x === 'moteur' ? null : x as 'calcul'); } });
  commandes.declarer({ id: 'facade.forcerClaude', libelle: 'Forcer', groupe: 'facade', executer: (b) => { const oui = b?.getAttribute('aria-pressed') !== 'true'; if (b?.dataset.toutes) forcer?.({ toutes: true }, oui); else if (b?.dataset.etape) forcer?.({ etape: b.dataset.etape as IdEtape }, oui); } });
  return { commandes, ecouterEtape: (f) => { ouvrir = f; return () => { ouvrir = null; }; }, ecouterEscalade: (f) => { escalader = f; return () => { escalader = null; }; },
    ecouterChoix: (f) => { choisir = f; return () => { choisir = null; }; }, ecouterForcage: (f) => { forcer = f; return () => { forcer = null; }; } };
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
/** Ouvre une etape de la frise (l'ecran est « etape -> actions -> avant/apres » : les gestes sont dans leur etape). */
const ouvrirEtape = async (id: IdEtape) => { await act(async () => { (hote.querySelector(`.calFrise [data-etape="${id}"]`) as HTMLButtonElement | null)?.click(); }); };
/** Le rejeu est fini : le bouton « Rejouer » est revenu et la frise a des etats calcules. */
const rejeuFini = () => bouton('calibration.rejouer')?.textContent === 'Rejouer' && !!hote.querySelector('.calFrise [data-etape="prises"] .calFriseEtat:not(.a-venir)');
/** L'onglet des reglages, de la mesure et de l'historique, a part des cas. */
const onglet = async (c: 'calibration.ongletCas' | 'calibration.ongletReglages') => { await act(async () => { bouton(c)?.click(); }); };

describe('l ecran de calibration', () => {
  it('liste les cas du serveur ; un cas ne nait que d une facade de l audit, aucune photo ne se prend ici', async () => {
    const { deps } = fausses({ audits: async () => [], facadesDAudit: async () => [] });
    await monter(deps);
    expect(hote.textContent).toContain('Calibrer la détection');
    expect(hote.textContent).toContain('Synthèse 02');
    expect(bouton('calibration.depuisAudit')).not.toBeNull();
    expect(hote.querySelector('[data-controle="calibration.nouveauCas"], input[type="file"]')).toBeNull();
    // Les reglages, la mesure et l'historique sont dans un onglet a part.
    expect(hote.textContent).not.toContain('Valeurs livrées en usage');
    await onglet('calibration.ongletReglages');
    expect(hote.textContent).toContain('Valeurs livrées en usage');
    expect(bouton('calibration.revenir')?.disabled).toBe(true);
    expect(bouton('calibration.ouvrirCas')).toBeNull();
    await onglet('calibration.ongletCas');
    // Le cas ouvert non plus, sans import branche (`importerPhoto`) : on y retire et ordonne les photos, on n'en ajoute pas.
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    expect(bouton('calibration.enregistrerCas')).not.toBeNull();
    expect(hote.querySelector('input[type="file"]')).toBeNull();
  });

  it('montre les etalons de synthese a part ; un etalon s ouvre et se rejoue, sans rien enregistrer ni compter', async () => {
    const etalon = { id: 'etalon-02-x', nom: '02-x', description: 'Un mur d’essai.', difficultes: ['enduit'], prise: 'camera' as const, photos: 1, biaisDeg: 0, focaleConnue: true, distorsion: false,
      largeurM: 9, hauteurM: 5, parement: 'enduit' as const, soubassement: false, pignonM: 0, pignonSommet: 0.5, partiesBasses: 0, obstacles: [], ombres: [], balcons: 0,
      ouvertures: { fenetre: 3 }, details: [], etapes: ['redressement', 'calage', 'ouvertures'] as IdEtape[], nbOuvertures: 3, projet: false };
    const ouvrirEtalon = vi.fn(async () => ({ cas: { ...scene.cas, nom: '02-x', statut: 'brouillon' as const }, coinsVrais: [scene.cas.photos[0]!.coins] }));
    const { deps, stock } = fausses({ etalons: async () => [etalon], ouvrirEtalon });
    await monter(deps);
    const section = hote.querySelector('[aria-label="Étalons de synthèse"]') as HTMLElement;
    expect(section.textContent).toContain('Étalons de synthèse (1)');
    expect(section.textContent).toContain('É5 É7 É12');
    // Les cas reels et la mesure ne voient pas l'etalon : un seul cas, le cas du serveur.
    expect(hote.querySelector('[aria-label="Cas de calibration"]')?.textContent).not.toContain('02-x');
    await act(async () => { bouton('calibration.ouvrirEtalon')?.click(); await new Promise((ok) => setTimeout(ok, 60)); });
    expect(ouvrirEtalon).toHaveBeenCalledWith('etalon-02-x');
    expect(hote.querySelector('h2.calTitre2')?.textContent).toBe('Étalon de synthèse : 02-x');
    expect(hote.textContent).toContain('Rien ne s’enregistre.');
    expect(bouton('calibration.enregistrerCas')).toBeNull();
    expect(bouton('calibration.supprimerCas')).toBeNull();
    expect(hote.querySelector('[data-controle="calibration.valide"]')).toBeNull();
    // Il se rejoue des l'ouverture, comme un cas tire d'un audit.
    await attendreQue(rejeuFini);
    expect(hote.querySelector('.calFrise')).not.toBeNull();
    // Sa photo n'a pas d'EXIF : la vignette de l'E3 le dit, en alerte (un mot, et le texte entier pour le lecteur d'ecran).
    await ouvrirEtape('objectif');
    const mention = hote.querySelector('.calVignettes .calObjectif') as HTMLElement;
    expect(mention.classList.contains('alerte')).toBe(true);
    expect(mention.textContent).toMatch(/^Sans EXIF : (focale supposée|champ lu).*posez quatre repères\.$/);
    expect(deps.enregistrerCas).not.toHaveBeenCalled();
    expect([...stock.keys()]).toEqual(['cas-a']);
  });

  it('cree le projet de demonstration d un etalon qui en a un, et donne le lien vers la demo', async () => {
    const etalon = { id: 'etalon-25-l', nom: '25-l', description: 'Un mur en L.', difficultes: ['mur-en-l'], prise: 'camera' as const, photos: 1, biaisDeg: 14, focaleConnue: true, distorsion: false,
      largeurM: 10, hauteurM: 5.6, parement: 'enduit' as const, soubassement: false, pignonM: 0, pignonSommet: 0.5, partiesBasses: 1, obstacles: [], ombres: [], balcons: 0,
      ouvertures: { fenetre: 3 }, details: [], etapes: ['calage'] as IdEtape[], nbOuvertures: 3, projet: true };
    const creerProjetEtalon = vi.fn(async () => ({ id: '7', nom: 'Étalon 25-mur-en-l-garage' }));
    const { deps } = fausses({ etalons: async () => [etalon, { ...etalon, id: 'etalon-02-x', nom: '02-x', projet: false }], ouvrirEtalon: async () => ({ cas: scene.cas, coinsVrais: [] }), creerProjetEtalon });
    await monter(deps);
    expect(hote.querySelectorAll('[data-controle="calibration.creerProjetEtalon"]')).toHaveLength(1);
    await act(async () => { bouton('calibration.creerProjetEtalon')?.click(); await new Promise((ok) => setTimeout(ok, 60)); });
    expect(creerProjetEtalon).toHaveBeenCalledWith('etalon-25-l');
    const lien = hote.querySelector('[data-controle="calibration.ouvrirProjetEtalon"]') as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('?demofile=7');
    expect(lien.textContent).toContain('Étalon 25');
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

  it('enregistre un cas tire d un audit : rejoue a l ouverture, coins cherches, detection proposee, nom exige, relu sur la photo', async () => {
    const tire: CasStocke = { ...scene.cas, nom: 'Maison · façade nord (AE0101)', statut: 'brouillon', ouvertures: [], photos: [{ fichier: 'photo-1', coins: [{ x: 120, y: 160 }, { x: 880, y: 160 }, { x: 880, y: 1120 }, { x: 120, y: 1120 }] }] };
    const { deps, stock } = fausses({ audits: async () => [{ id: 'a1', libelle: 'Audit du 29 octobre' }], facadesDAudit: async () => [{ libelle: 'Maison · façade nord', cas: tire }] });
    await monter(deps);
    await act(async () => { bouton('calibration.depuisAudit')?.click(); await Promise.resolve(); });
    await act(async () => { bouton('calibration.choisirAudit')?.click(); await Promise.resolve(); });
    await act(async () => { bouton('calibration.choisirFacade')?.click(); await Promise.resolve(); });
    // Le cas se rejoue des l'ouverture, ses coins cherches ; la detection se propose (« Partir de la détection »), mais ne remplit plus
    // la verite d'elle-meme (decision du proprietaire, 3 novembre 2026) : l'E9 se comparerait a sa propre sortie.
    await attendreQue(rejeuFini);
    await ouvrirEtape('ouvertures');
    expect(bouton('calibration.proposer')).not.toBeNull();
    await ouvrirEtape('prises');
    expect(hote.querySelectorAll('[aria-label="Photos du cas"] li')).toHaveLength(1);
    expect(hote.querySelector('[data-controle="calibration.originePhoto"]')?.textContent).toMatch(/coins (trouvés|devinés|lus sur l’assemblage)/);
    expect(hote.textContent).not.toMatch(/[1-9]\d* ouvertures? annotée/);
    expect(hote.textContent).toContain('1 photo, dans l’ordre où la chaîne les prend');
    // Sans nom, l'enregistrement est refuse avec un mot clair.
    const nom = hote.querySelector('[data-controle="calibration.nomCas"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(nom, ' '); nom.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); });
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/nom/);
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(nom, 'Maison nord'); nom.dispatchEvent(new Event('input', { bubbles: true })); });
    const valide = hote.querySelector('[data-controle="calibration.valide"]') as HTMLInputElement;
    await act(async () => { valide.click(); });
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    const ajoute = [...stock.entries()].find(([id]) => id.startsWith('cas-') && id !== 'cas-a');
    expect(ajoute?.[1]).toMatchObject({ nom: 'Maison nord', statut: 'valide', images: scene.cas.images });
    expect(ajoute?.[1].ouvertures).toEqual([]);
    expect(ajoute?.[1].photos[0]?.coins).toHaveLength(4);
    // Le cas rejoint la liste et l'editeur se ferme.
    expect(hote.textContent).toContain('Maison nord');
    expect(bouton('calibration.enregistrerCas')).toBeNull();
  }, 60_000);

  it('un cas tire d un audit a deux photos : la photo qui ne se redresse pas est signalee et gardee', async () => {
    const grise: Image = { largeur: 640, hauteur: 480, donnees: new Uint8ClampedArray(640 * 480 * 4).fill(128) };
    const tire: CasStocke = { ...scene.cas, statut: 'brouillon', ouvertures: [], images: ['data:image/jpeg;base64,SCENE', 'data:image/jpeg;base64,GRISE'],
      photos: [{ fichier: 'photo-1', coins: scene.cas.photos[0]!.coins }, { fichier: 'photo-2', coins: [{ x: 120, y: 160 }, { x: 520, y: 160 }, { x: 520, y: 400 }, { x: 120, y: 400 }] }] };
    const { deps } = fausses({ decoder: async (u: string) => (u.endsWith('GRISE') ? grise : scene.image), audits: async () => [{ id: 'a1', libelle: 'Audit' }], facadesDAudit: async () => [{ libelle: 'Maison · façade nord', cas: tire }] });
    await monter(deps);
    await act(async () => { bouton('calibration.depuisAudit')?.click(); await Promise.resolve(); });
    await act(async () => { bouton('calibration.choisirAudit')?.click(); await Promise.resolve(); });
    await act(async () => { bouton('calibration.choisirFacade')?.click(); await Promise.resolve(); });
    await attendreQue(rejeuFini);
    await ouvrirEtape('prises');
    expect(hote.querySelectorAll('[aria-label="Photos du cas"] li')).toHaveLength(2);
    expect([...hote.querySelectorAll('[data-controle="calibration.originePhoto"]')].map((x) => x.textContent)).toEqual(['coins trouvés', 'coins devinés, à vérifier']);
    // Comme dans l'audit (le meme processus) : la photo grise garde des coins calcules, et c'est l'assemblage qui la laisse de cote ;
    // la barre le dit sur son segment « Image », en echec, et l'etape ouverte dit quel geste faire.
    expect(hote.querySelector('.barreFacadeSegment.echec')?.textContent).toMatch(/Image/);
    await act(async () => { (hote.querySelector('.calFrise [data-etape="coins"]') as HTMLButtonElement).click(); });
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/Photo 2 : coins prédits par la prise de vue/);
    await act(async () => { (hote.querySelector('.calFrise [data-etape="redressement"]') as HTMLButtonElement).click(); });
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/Photo 2 : redressée automatiquement/);
    await act(async () => { (hote.querySelector('.calFrise [data-etape="assemblage"]') as HTMLButtonElement).click(); });
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/^Photos indépendantes : aucun assemblage.* Reprenez la façade avec des chevauchements/);
  }, 60_000);

  it('rejoue un cas, part de la detection pour annoter, et enregistre', async () => {
    const { deps, stock } = fausses();
    await monter(deps);
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    // Avant le rejeu, la frise est la : ses quatorze etapes, a venir.
    expect(hote.querySelectorAll('.calFrise > li')).toHaveLength(14);
    await act(async () => { bouton('calibration.rejouer')?.click(); });
    await attendreQue(rejeuFini);
    // Le rejeu montre la barre de progression et la frise des etapes, chacune avec son etat.
    expect(hote.querySelectorAll('.barreFacade ol > li')).toHaveLength(8);
    expect(hote.querySelectorAll('.calFrise > li')).toHaveLength(14);
    expect(hote.querySelector('.barreFacadeSegment.echec')).toBeNull();
    // Chaque etape se nomme par son numero, de É1 a É14, sans « bis » : sur sa vignette, sur son ecran ouvert, dans la barre (decision
    // du proprietaire : il les cite par ces numeros).
    expect(ETAPES_FACADE.map((e) => e.numero)).toEqual(ETAPES_FACADE.map((_, k) => 'É' + (k + 1)));
    for (const li of [...hote.querySelectorAll('.calFrise > li')]) {
      const id = li.querySelector('[data-etape]')?.getAttribute('data-etape') as IdEtape, def = etapeFacade(id);
      expect(li.textContent).toContain(def.numero + ' · ' + def.nom);
      await act(async () => { (li.querySelector('[data-etape]') as HTMLButtonElement).click(); });
      expect(hote.querySelector('.calEtapeOuverte h3')?.textContent?.startsWith(def.numero + ' · ' + def.nom)).toBe(true);
      // Chaque etape montre ses actions, chacune avec son badge de type (Code, Claude, Manuel, Mesure).
      const badges = [...hote.querySelectorAll('.calEtapeOuverte .actionEtape .badgeAction')].map((b) => b.textContent);
      expect(badges.filter((b) => b !== 'Mesure').length).toBe(def.actions.filter((a) => a.type !== 'mesure').length);
      expect(badges.every((b) => ['Code', 'Claude', 'Manuel', 'Mesure'].includes(b ?? ''))).toBe(true);
    }
    await ouvrirEtape('ouvertures');
    const segments = [...hote.querySelectorAll('.barreFacadeSegment [aria-label]')].map((x) => x.getAttribute('aria-label') ?? '');
    SEGMENTS_FACADE.forEach((s, k) => expect(segments[k]).toContain(etapeFacade(s.etapes[0] as IdEtape).numero));
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

  it('reprend la sequence des photos d un cas (demande du proprietaire, 9 novembre 2026) : importer, ordonner, retirer, rejouer, enregistrer', async () => {
    const optique = (n: number) => ({ focale35: 26, champDeg: 69.4, sourceFocale: 'exif' as const, modeleAppareil: 'Téléphone ' + n, exif: { focale35: 26, modele: 'Téléphone ' + n }, source: { largeurPx: 4000, hauteurPx: 3000 }, reduite: { largeurPx: 1100, hauteurPx: 700 }, empreinte: null });
    const importees: string[] = [];
    // L'import prepare chaque fichier comme l'audit (app/audit/photo.ts::preparerPhoto) : ici, un faux qui rend son optique.
    const importerPhoto = vi.fn(async (f: File) => { importees.push(f.name); return { type: 'image/jpeg' as const, base64: 'IMPORT' + importees.length, optique: optique(importees.length) }; });
    const { deps, stock } = fausses({ importerPhoto });
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await monter(deps);
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    await ouvrirEtape('prises');
    const vignettes = () => [...hote.querySelectorAll('[aria-label="Photos du cas"] img')].map((i) => i.getAttribute('src'));
    const rangee = (k: number, c: string) => hote.querySelectorAll(`[aria-label="Photos du cas"] li`)[k]?.querySelector(`[data-controle="${c}"]`) as HTMLButtonElement;
    // Un champ fichier qui accepte des images, plusieurs a la fois, sans camera.
    const champ = hote.querySelector('[data-controle="calibration.fichiersPhotos"]') as HTMLInputElement;
    expect(champ.accept).toBe('image/*');
    expect(champ.multiple).toBe(true);
    expect(champ.hasAttribute('capture')).toBe(false);
    expect(bouton('calibration.ajouterPhotos')).not.toBeNull();
    // Deux photos importees : a la fin de la sequence, puis le cas se rejoue en entier, de lui-meme.
    const fichiers = ['a.jpg', 'b.jpg'].map((n) => new File([new Uint8Array([0xff, 0xd8])], n, { type: 'image/jpeg' }));
    Object.defineProperty(champ, 'files', { configurable: true, value: fichiers });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    await attendreQue(() => vignettes().length === 3 && rejeuFini());
    expect(importerPhoto).toHaveBeenCalledTimes(2);
    expect(vignettes()).toEqual(['data:image/jpeg;base64,SCENE', 'data:image/jpeg;base64,IMPORT1', 'data:image/jpeg;base64,IMPORT2']);
    expect(rejeuFini()).toBe(true);
    // Ordonner : « Avancer » la troisieme deux fois ; au premier rang, « Avancer » est grise, au dernier, « Reculer ».
    await ouvrirEtape('prises');
    await act(async () => { rangee(2, 'calibration.avancerPhoto').click(); });
    await attendreQue(rejeuFini);
    await ouvrirEtape('prises');
    await act(async () => { rangee(1, 'calibration.avancerPhoto').click(); });
    await attendreQue(rejeuFini);
    await ouvrirEtape('prises');
    expect(vignettes()).toEqual(['data:image/jpeg;base64,IMPORT2', 'data:image/jpeg;base64,SCENE', 'data:image/jpeg;base64,IMPORT1']);
    expect(rangee(0, 'calibration.avancerPhoto').disabled).toBe(true);
    expect(rangee(2, 'calibration.reculerPhoto').disabled).toBe(true);
    // Retirer : apres confirmation ; refuse, rien ne bouge.
    confirmer.mockReturnValueOnce(false);
    await act(async () => { rangee(1, 'calibration.retirerPhoto').click(); });
    expect(vignettes()).toHaveLength(3);
    await act(async () => { rangee(1, 'calibration.retirerPhoto').click(); });
    await attendreQue(rejeuFini);
    expect(confirmer).toHaveBeenCalledTimes(2);
    expect(vignettes()).toEqual(['data:image/jpeg;base64,IMPORT2', 'data:image/jpeg;base64,IMPORT1']);
    // Enregistre : les photos dans le nouvel ordre, l'optique (l'EXIF) des photos importees gardee, sans prise de vue.
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    const sauve = stock.get('cas-a') as CasStocke;
    expect(sauve.images).toEqual(['data:image/jpeg;base64,IMPORT2', 'data:image/jpeg;base64,IMPORT1']);
    expect(sauve.photos.map((p) => [p.fichier, p.optique?.modeleAppareil, p.prise])).toEqual([['import-2', 'Téléphone 2', undefined], ['import-1', 'Téléphone 1', undefined]]);
    confirmer.mockRestore();
  }, 60_000);

  it('cree un cas depuis des photos importees (reponse du proprietaire, 9 novembre 2026) : sans camera, sans plan, rejoue et enregistre', async () => {
    const optique = { focale35: 26, champDeg: 69.4, sourceFocale: 'exif' as const, modeleAppareil: 'Téléphone', exif: { focale35: 26, modele: 'Téléphone' }, source: { largeurPx: 4000, hauteurPx: 3000 }, reduite: { largeurPx: 1100, hauteurPx: 700 }, empreinte: null };
    let n = 0;
    const importerPhoto = vi.fn(async (f: File) => { if (f.name === 'casse.jpg') throw new Error('illisible'); n++; return { type: 'image/jpeg' as const, base64: 'NEUF' + n, optique }; });
    const { deps, stock } = fausses({ importerPhoto });
    await monter(deps);
    // Le champ du nouveau cas : des images, plusieurs, sans camera ; un fichier illisible est nomme, les autres entrent.
    const champ = hote.querySelector('[data-controle="calibration.fichiersNouveauCas"]') as HTMLInputElement;
    expect(champ.accept).toBe('image/*');
    expect(champ.multiple).toBe(true);
    expect(champ.hasAttribute('capture')).toBe(false);
    expect(bouton('calibration.nouveauCasPhotos')?.textContent).toBe('Nouveau cas depuis des photos');
    const fichiers = ['rue.jpg', 'casse.jpg', 'biais.jpg'].map((x) => new File([new Uint8Array([0xff, 0xd8])], x, { type: 'image/jpeg' }));
    Object.defineProperty(champ, 'files', { configurable: true, value: fichiers });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    // L'editeur s'ouvre sur le cas neuf et le rejoue de lui-meme, ses coins cherches comme dans l'audit.
    await attendreQue(() => !!hote.querySelector('.calEditeur') && rejeuFini());
    expect(hote.querySelector('.calEditeur h2')?.textContent).toBe('Nouveau cas');
    expect(hote.querySelector('[role="alert"]')?.textContent).toContain('Illisible : casse.jpg.');
    expect(hote.querySelectorAll('.calEtapeOuverte, .calFrise [data-etape="prises"] .calFriseEtat.echec').length).toBe(0);
    // Un nom, les dimensions du mur a la main (sans plan autour), puis « Enregistrer le cas » : un cas de plus, ses photos dans l'ordre.
    const nom = hote.querySelector('[data-controle="calibration.nomCas"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(nom, 'Maison importée'); nom.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    const neuf = [...stock.entries()].find(([id]) => id !== 'cas-a')?.[1] as CasStocke;
    expect(neuf).toMatchObject({ nom: 'Maison importée', largeurM: 9, hauteurM: 5, statut: 'brouillon' });
    expect(neuf.images).toEqual(['data:image/jpeg;base64,NEUF1', 'data:image/jpeg;base64,NEUF2']);
    expect(neuf.photos.map((p) => [p.fichier, p.optique?.modeleAppareil, p.prise])).toEqual([['import-1', 'Téléphone', undefined], ['import-2', 'Téléphone', undefined]]);
    expect(neuf.gabarit ?? neuf.toit ?? neuf.facade ?? neuf.origine).toBeUndefined();
  }, 60_000);

  it('reporte la verite de l E7 quand la sequence change (reponse du proprietaire, 9 novembre 2026) : ajouter, puis retirer, et le dit', async () => {
    const importerPhoto = vi.fn(async () => ({ type: 'image/jpeg' as const, base64: 'AJOUT' }));
    const { deps, stock } = fausses({ importerPhoto });
    // Le cas porte une verite de l'E7 : le mur vrai sur l'assemblage de sa photo seule (la scene, mur a 100 px du bord).
    stock.set('cas-a', { ...scene.cas, calageVrai: { x0: 100, x1: 1000, egout: 100, sol: 600, versionChaine: 14 } });
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await monter(deps);
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    await ouvrirEtape('prises');
    const champ = hote.querySelector('[data-controle="calibration.fichiersPhotos"]') as HTMLInputElement;
    Object.defineProperty(champ, 'files', { configurable: true, value: [new File([new Uint8Array([0xff, 0xd8])], 'c.jpg', { type: 'image/jpeg' })] });
    // Le cas n'a pas ete rejoue : l'assemblage d'ou vient la verite se refait (jusqu'a l'E7), puis le cas se rejoue sur deux photos.
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    await attendreQue(() => hote.querySelectorAll('[aria-label="Photos du cas"] img').length === 2 && rejeuFini() && !!hote.querySelector('[role="alert"]'));
    expect(hote.querySelector('[role="alert"]')?.textContent).toBe('La vérité de l’É7 (le mur vrai) est reportée sur le nouvel assemblage, par les photos qui la voient.');
    // Retirer la photo d'origine : la verite avait ete posee sur l'assemblage de cette photo seule ; la photo ajoutee ne la portait pas.
    await ouvrirEtape('prises');
    await act(async () => { (hote.querySelectorAll('[aria-label="Photos du cas"] li')[0]?.querySelector('[data-controle="calibration.retirerPhoto"]') as HTMLButtonElement).click(); });
    await attendreQue(() => hote.querySelectorAll('[aria-label="Photos du cas"] img').length === 1 && rejeuFini() && !!hote.querySelector('[role="alert"]'));
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/^La vérité de l’É7 \(le mur vrai\) est retirée : le bout gauche, le bout droit, l’égout et le sol ne se voyaient que sur des photos retirées/);
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    const sauve = stock.get('cas-a') as CasStocke;
    expect(sauve.images).toEqual(['data:image/jpeg;base64,AJOUT']);
    expect(sauve.calageVrai).toBeUndefined();
    confirmer.mockRestore();
  }, 60_000);

  it('le refus d un import se lit apres le rejeu, a cote du report de la verite (revue du 9 novembre 2026)', async () => {
    const importerPhoto = vi.fn(async (f: File) => { if (f.name === 'casse.jpg') throw new Error('illisible'); return { type: 'image/jpeg' as const, base64: 'AJOUT' }; });
    const { deps, stock } = fausses({ importerPhoto });
    stock.set('cas-a', { ...scene.cas, calageVrai: { x0: 100, x1: 1000, egout: 100, sol: 600, versionChaine: 14 } });
    await monter(deps);
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    await ouvrirEtape('prises');
    const champ = hote.querySelector('[data-controle="calibration.fichiersPhotos"]') as HTMLInputElement;
    Object.defineProperty(champ, 'files', { configurable: true, value: ['c.jpg', 'casse.jpg'].map((n) => new File([new Uint8Array([0xff, 0xd8])], n, { type: 'image/jpeg' })) });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    await attendreQue(() => hote.querySelectorAll('[aria-label="Photos du cas"] img').length === 2 && rejeuFini() && /Illisible/.test(hote.querySelector('[role="alert"]')?.textContent ?? ''));
    // Le rejeu ecrit le report de la verite ; le refus de l'import s'y ajoute au lieu d'etre efface par lui.
    expect(hote.querySelector('[role="alert"]')?.textContent).toBe('La vérité de l’É7 (le mur vrai) est reportée sur le nouvel assemblage, par les photos qui la voient. Illisible : casse.jpg.');
  }, 60_000);

  it('une verite qu aucun rejeu ne posera est perdue, et le cas s enregistre (revue du 9 novembre 2026)', async () => {
    // La photo ajoutee ne se decode en rien (une image vide) : seule, le rejeu va a son terme sans assemblage.
    const aplat = { largeur: 0, hauteur: 0, donnees: new Uint8ClampedArray(0) } as Image;
    const importerPhoto = vi.fn(async () => ({ type: 'image/jpeg' as const, base64: 'APLAT' }));
    const { deps, stock } = fausses({ importerPhoto, decoder: async (u: string) => (u.endsWith('APLAT') ? aplat : scene.image) });
    stock.set('cas-a', { ...scene.cas, calageVrai: { x0: 100, x1: 1000, egout: 100, sol: 600, versionChaine: 14 } });
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await monter(deps);
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    await ouvrirEtape('prises');
    const champ = hote.querySelector('[data-controle="calibration.fichiersPhotos"]') as HTMLInputElement;
    Object.defineProperty(champ, 'files', { configurable: true, value: [new File([new Uint8Array([0xff, 0xd8])], 'a.jpg', { type: 'image/jpeg' })] });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    await attendreQue(() => hote.querySelectorAll('[aria-label="Photos du cas"] img').length === 2 && rejeuFini() && !!hote.querySelector('[role="alert"]'));
    // Retirer la photo d'origine : le rejeu va a son terme sur l'image vide seule, sans assemblage ; la verite reportee ne se pose
    // nulle part, l'ecran le dit, et « Enregistrer le cas » enregistre au lieu de reclamer un rejeu.
    await ouvrirEtape('prises');
    await act(async () => { (hote.querySelectorAll('[aria-label="Photos du cas"] li')[0]?.querySelector('[data-controle="calibration.retirerPhoto"]') as HTMLButtonElement).click(); });
    await attendreQue(() => hote.querySelectorAll('[aria-label="Photos du cas"] img').length === 1 && rejeuFini() && !!hote.querySelector('[role="alert"]'));
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/^La vérité de l’É7 \(le mur vrai\) est retirée/);
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    expect(hote.querySelector('[role="alert"]')?.textContent ?? '').not.toMatch(/Rejouez d’abord/);
    const sauve = stock.get('cas-a') as CasStocke;
    expect(sauve.images).toEqual(['data:image/jpeg;base64,APLAT']);
    expect(sauve.calageVrai).toBeUndefined();
    confirmer.mockRestore();
  }, 60_000);

  it('toutes les photos retirees : la verite est perdue tout de suite, et l ecran demande une photo, pas un rejeu', async () => {
    const { deps, stock } = fausses();
    stock.set('cas-a', { ...scene.cas, calageVrai: { x0: 100, x1: 1000, egout: 100, sol: 600, versionChaine: 14 } });
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await monter(deps);
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    await ouvrirEtape('prises');
    await act(async () => { (hote.querySelectorAll('[aria-label="Photos du cas"] li')[0]?.querySelector('[data-controle="calibration.retirerPhoto"]') as HTMLButtonElement).click(); });
    await attendreQue(() => hote.querySelectorAll('[aria-label="Photos du cas"] img').length === 0 && !!hote.querySelector('[role="alert"]'));
    expect(hote.querySelector('[role="alert"]')?.textContent).toBe(VERITE_SANS_ASSEMBLAGE);
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/^Un cas a besoin d’au moins une photo/);
    confirmer.mockRestore();
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
    // Le panneau de Claude est le corps de l'E8. Sans reponse enregistree, le mode IA n'est pas propose ; on rappelle Claude.
    await ouvrirEtape('lectureIa');
    expect(bouton('calibration.modeIa')?.disabled).toBe(true);
    await act(async () => { bouton('calibration.rejouer')?.click(); });
    await attendreQue(() => !!bouton('calibration.rappelerClaude') && !bouton('calibration.rappelerClaude')?.disabled);
    await act(async () => { bouton('calibration.rappelerClaude')?.click(); });
    await attendreQue(() => /Réponse enregistrée/.test(hote.textContent ?? '') && !bouton('calibration.rejouer')?.disabled);
    // Trois passes votees : la production (le reglage `facades.ia.passes`).
    expect(appelerClaude).toHaveBeenCalledWith(expect.objectContaining({ passes: 3, texte: expect.stringMatching(/^Façade : Synthèse 02\./) }));
    expect(hote.textContent).toContain('Réponse enregistrée : Claude, 2026-10-29, trois passes votées, claude-haiku-5-5, prompt v1, schéma v1, 0,0039 $');
    expect(bouton('calibration.modeIa')?.getAttribute('aria-pressed')).toBe('true');
    // L'E8 (la lecture de Claude) dit l'accord de ses angles et ses boites retrouvees par la detection, et l'image qu'il a lue.
    const ouvrir = ouvrirEtape;
    await ouvrir('lectureIa');
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/IA \(Claude, 2026-10-29.*accord/);
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/3 ouvertures vues par Claude : 3 retrouvées par la détection/);
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/Image lue : l’assemblage/);
    expect(hote.querySelector('.calEtapeOuverte')?.textContent).toMatch(/IA : Claude, 2026-10-29.*règles [0-9a-f]{8}/);
    expect(hote.querySelectorAll('.calBoiteIa.cochee')).toHaveLength(3);
    // Chaque element lu par Claude dans la couleur de sa famille, avec l'etape qui le consomme : les trois boites, consommees par l'E12 et l'E14.
    const boites = [...hote.querySelectorAll('.calLectureFamilles .elementAction.famille-ouverture')];
    expect(boites).toHaveLength(3);
    expect(boites[0]?.textContent).toContain('Consommé par É12, É14');
    // Et l'E12 les montre a cote du calcul, meme couleur, avec leur statut et l'ouverture qu'elles confirment.
    await ouvrir('ouvertures');
    expect([...hote.querySelectorAll('.calEtapeOuverte [data-action="boites"] .elementAction.famille-ouverture')].map((x) => x.querySelector('.elementStatut')?.textContent)).toEqual(['retrouvée par la détection → ouverture 1', 'retrouvée par la détection → ouverture 2', 'retrouvée par la détection → ouverture 3']);
    await ouvrir('lectureIa');
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
    await ouvrir('lectureIa');
    expect(hote.querySelector('.calEtapeOuverte .calResume')?.textContent).toMatch(/Escalade \(claude-sonnet-5-5\) : elle l’emporte sur le parement\. Parement : pierre/);
    // Une seule escalade par reponse : le bouton le dit et se grise.
    expect([esc()?.textContent, esc()?.disabled]).toEqual(['Escaladée (claude-sonnet-5-5)', true]);
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    // Le cas garde la reponse et son escalade, pour la rejouer sans reseau.
    expect(stock.get('cas-a')?.ia).toEqual([{ ...run, escalade }]);
  }, 60_000);

  it('choisit la source d un element (Calcul, Claude, Manuel), force Claude, et range ces gestes avec le cas (lot C2)', async () => {
    // Une reponse SYNTHETIQUE (pas Claude) enregistree avec le cas : ses angles et ses trois fenetres.
    const sortie = { calage: { angles: { gauche: { x: 0.091, egout: 0.143, sol: 0.857, confiance: 'forte' }, droite: { x: 0.909, egout: 0.143, sol: 0.857, confiance: 'forte' } }, pointes: [], appentis: [], corps: [], cache: [] },
      forme: { silhouette: 'ligne-droite', bout: 'sans-objet' }, elements: [], surface: { principale: 'enduit', zones: [], confiance: 'forte' }, confiance: 'forte',
      ouvertures: [1, 4, 7].map((x) => ({ type: 'fenetre', u0: x / 9, u1: (x + 1) / 9, v0: 0.4, v1: 0.68, niveau: 0, travee: 'indetermine', confiance: 'forte', details: { volets: 'aucun', allege: 'pleine', forme: 'rect' }, carreaux: null })) };
    const run = { le: '2026-10-29T12:00:00.000Z', modele: 'synthetique', prompt: 1, schema: 1, passes: 1 as const, sorties: [sortie], cout: 0.001, tokens: { entree: 1, sortie: 1 }, image: { largeur: 1100, hauteur: 700 }, chaine: 10, synthetique: true };
    const { deps, stock } = fausses();
    stock.set('cas-a', { ...scene.cas, ia: [run] as unknown as RunEnregistre[] });
    await monter(deps);
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    await ouvrirEtape('lectureIa');
    await act(async () => { bouton('calibration.rejouer')?.click(); });
    await attendreQue(rejeuFini);
    await act(async () => { bouton('calibration.modeIa')?.click(); });
    await attendreQue(() => rejeuFini() && !!hote.querySelector('[data-commande="facade.forcerClaude"]'));
    // L'E8 : « Forcer Claude partout ».
    const partout = () => hote.querySelector('[data-commande="facade.forcerClaude"][data-toutes]') as HTMLButtonElement;
    expect(partout().getAttribute('aria-pressed')).toBe('false');
    await act(async () => { partout().click(); });
    await attendreQue(() => rejeuFini() && partout()?.getAttribute('aria-pressed') === 'true');
    expect(partout().getAttribute('aria-pressed')).toBe('true');
    // L'E12 : chaque boite a ses trois boutons ; Claude y est la source qui vaut (forcee), Manuel part du calcul et s'applique.
    await ouvrirEtape('ouvertures');
    const boite = () => hote.querySelector('.calEtapeOuverte [data-action="boites"] .elementAction') as HTMLElement;
    expect([...boite().querySelectorAll('.choixSource > button')].map((b) => b.textContent)).toEqual(['Calcul', 'Claude', 'Manuel']);
    expect(boite().querySelector('[data-source="claude"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(boite().textContent).toContain('(Claude forcé)');
    await act(async () => { (boite().querySelector('[data-commande="facade.choisirSource"][data-source="calcul"]') as HTMLButtonElement).click(); });
    await attendreQue(() => rejeuFini() && boite()?.querySelector('[data-source="calcul"]')?.getAttribute('aria-pressed') === 'true');
    expect(boite().textContent).toContain('(votre choix)');
    // Une ouverture ajoutee a la main.
    await act(async () => { ([...hote.querySelectorAll('.choixAjouts button')].find((b) => b.textContent === 'Ajouter une ouverture') as HTMLButtonElement).click(); });
    await act(async () => { (hote.querySelector('.choixAjouts [data-commande="facade.choisirSource"][data-source="manuel"]') as HTMLButtonElement).click(); });
    await attendreQue(() => rejeuFini() && !!hote.querySelector('.choixAjouts .calListe li'));
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    const garde = stock.get('cas-a');
    expect(garde?.forcages).toEqual([{ toutes: true, source: 'claude', le: expect.any(String) }]);
    expect(garde?.choix?.map((c) => [c.cle, c.source])).toEqual([['ouverture:0', 'calcul'], ['ajout:0', 'manuel']]);
    expect(garde?.choix?.[1]?.valeur).toEqual({ type: 'fenetre', x: 1, y: 1, l: 1, h: 1.2 });
  }, 120_000);

  it('mesure les cas valides, cherche de meilleurs reglages et les applique', async () => {
    const { deps, docs } = fausses();
    await monter(deps);
    await onglet('calibration.ongletReglages');
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
    await onglet('calibration.ongletReglages');
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

// Les fichiers d'un import, jusqu'a la limite du cas en photos lues : un illisible ne prend pas la place d'un lisible (revue du 9 novembre
// 2026 : les premiers fichiers seuls etaient essayes, et un lisible apres un illisible se disait « de trop » alors qu'il restait de la place).
describe('les fichiers d un import', () => {
  it('remplissent la place avec des photos lues ; les suivants sont de trop', async () => {
    const fichiers = ['casse.jpg', 'a.jpg', 'b.jpg', 'c.jpg'].map((n) => new File([new Uint8Array([0xff, 0xd8])], n, { type: 'image/jpeg' }));
    const lus: string[] = [];
    const preparer = async (f: File) => { lus.push(f.name); if (f.name === 'casse.jpg') throw new Error('illisible'); return { type: 'image/jpeg' as const, base64: f.name }; };
    const { ajouts, illisibles } = await preparerLesPhotos(fichiers, preparer, { photos: [] }, 2);
    expect(ajouts.map((a) => a.image)).toEqual(['data:image/jpeg;base64,a.jpg', 'data:image/jpeg;base64,b.jpg']);
    expect(illisibles).toEqual(['casse.jpg']);
    // Le dernier n'est pas lu : la place est prise.
    expect(lus).toEqual(['casse.jpg', 'a.jpg', 'b.jpg']);
    expect(texteDesRefus(illisibles, fichiers.length - ajouts.length - illisibles.length)).toBe('Illisible : casse.jpg. 1 photo de trop : un cas en garde 8 au plus.');
  });
});
