import { describe, it, expect, vi } from 'vitest';
import { creerValidation, type ProjetAudit } from '../../../../../src/app/audit/parcelle/validation.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { mesurerFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { rechercher } from '../../../../../src/facade/releve/serie.js';
import { etalonPourLAudit } from '../../../../banc/facades/etalonAudit.js';
import { facadesDuContour } from '../../../../../src/geometry/cotesVusDeDehors.js';
import { creerHistorique } from '../../../../../src/core/historique.js';
import { serializeObjects, serializeMeasures } from '../../../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { CONFIANCE_MIN } from '../../../../../src/regles/decisions.js';
import type { EtatApp } from '../../../../../src/core/state.js';
import type { PhotoCas, PrisePhoto } from '../../../../../src/model/audit.js';
import type { ObjetBrut, ObjetPlan, ReleveFacade } from '../../../../../src/model/types.js';

// Les photos de l'audit alimentent les facades : la mesure d'une facade photographiee, aux coins trouves, pose
// son releve sur le projet sans attendre « Valider » (un pas d'historique, annulable), et ne touche jamais un releve
// fait a la main.

const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
// La maison photographiee : l'etalon 02 du catalogue (enduit, de face), son batiment de demonstration et sa photo de synthese, au lieu
// d'un mur peint ici (CLAUDE.md, « chercher avant de creer »).
const E = etalonPourLAudit('02');
const PTS = E.pts;
const PHOTO: PhotoCas = { type: 'image/jpeg', base64: 'AAAA', prise: E.photos[0]?.prise as PrisePhoto };
/**
 * La recherche des coins, forcee a « trouves » : sur la photo de synthese le calage fin ne les trouve pas ; on lui
 * fait dire qu'il a trouve ceux que la prise de vue predit, pour jouer la mesure d'une photo reussie.
 */
async function coinsTrouves(e: Parameters<typeof rechercher>[0]): Promise<ReturnType<typeof rechercher>> {
  const r = rechercher(e);
  if (!r.coins?.coins) return r;
  return { ...r, coins: { ...r.coins, trouve: true, note: 0.9, sources: ['trouve', 'trouve', 'trouve', 'trouve'] } };
}
const dependances = { pixels: async () => E.pixels(), chercherCoins: coinsTrouves, jpeg: () => 'data:image/jpeg;base64,TEXTURE', limites: () => [] };

function monter(avant: Partial<ObjetPlan> = {}, deps: typeof dependances = dependances) {
  const objets = normalizeObjects([
    obj('parcelle', { fonction: 'terrain', pts: E.parcelle, cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
    obj('maison', { fonction: 'batiment', pts: PTS, elevation: E.hauteur, batiment: { toit: E.toit, corpsToit: E.corps },  ...avant }),
  ] as ObjetBrut[]) as ObjetPlan[];
  const etat = { objects: objets, measures: [], selectedKey: null, dirty: false } as unknown as EtatApp;
  const historique = creerHistorique(etat as never, {
    serializeObjects: (o) => serializeObjects(o as ObjetPlan[]), serializeMeasures: (m) => serializeMeasures(m as never),
    normalizeObjects: (b) => normalizeObjects(b) as never, detruireVue: () => {}, createObjectDOM: () => {}, rebuildHandles: () => {},
    reapplyStackingOrder: () => {}, rebuildSelector: () => {}, render: () => {}, boutonAnnuler: () => null,
  });
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  capture.ajouterPhotoFacade('maison', 0, PHOTO);
  const projet: ProjetAudit = { pushHistory: vi.fn(() => historique.empiler()), render: vi.fn(), refaire3d: vi.fn(), remplacer3d: () => true };
  const messages: string[] = [];
  const v = creerValidation({
    etat, capture, liste: () => listeDeControle(etat.objects, capture.lire()), projet, signaler: (m) => messages.push(m),
    maintenant: () => new Date('2026-10-13T09:00:00Z'), mesures: deps,
  });
  const maison = () => etat.objects.find((o) => o.key === 'maison') as ObjetPlan;
  return { etat, historique, projet, v, messages, maison, capture };
}

/** Ce que la mesure de la photo de synthese donne : ses coins sont-ils trouves, et avec quelle confiance ? */
async function mesureDeReference() {
  const f = facadesDuContour(PTS, E.hauteur).find((x) => x.orientation === 'Sud');
  return mesurerFacade('maison', f as NonNullable<typeof f>, { pts: PTS, corpsToit: E.corps }, [PHOTO], dependances);
}

describe('les photos de l audit alimentent les facades', () => {
  it('pose le releve mesure des que la mesure est prete, sans « Valider », quand ses coins sont trouves', async () => {
    const m = await mesureDeReference();
    expect(m.coinsTrouves, 'la mesure de reference doit avoir des coins trouves').toBe(true);
    // La photo donne aussi la ligne du haut du mur, de quoi dire les bouts du toit (silhouettes.ts).
    expect(['triangle', 'trapeze', 'ligne-droite', 'rampe', 'indetermine']).toContain(m.silhouette);
    const attendu = m.coinsTrouves && (m.confiance ?? 1) >= CONFIANCE_MIN && !!m.releve;
    const t = monter();
    expect(t.maison().batiment?.facades ?? []).toHaveLength(0);
    await t.v.lancer();
    const pose = t.maison().batiment?.facades ?? [];
    expect(attendu).toBe(true);
    expect(pose).toHaveLength(1);
    expect(pose[0]).toMatchObject({ cote: 0, depuisAudit: true, texture: 'data:image/jpeg;base64,TEXTURE' });
    expect(t.messages.at(-1)).toBe('1 façade relevée automatiquement d’après vos photos (Ctrl+Z pour annuler).');
    expect(t.projet.render).toHaveBeenCalled();
    expect(t.projet.refaire3d).toHaveBeenCalled();
    // La ligne n'est plus proposee : elle est deja ecrite.
    expect(t.v.propositions().some((p) => p.id === 'maison#0:releve')).toBe(false);
  }, 30000);

  it('se fait en un seul pas d historique, que Ctrl+Z defait au bit pres', async () => {
    const m = await mesureDeReference();
    expect(m.coinsTrouves && (m.confiance ?? 1) >= CONFIANCE_MIN).toBe(true);
    const t = monter();
    const avant = JSON.stringify(serializeObjects(t.etat.objects));
    await t.v.lancer();
    expect(t.projet.pushHistory).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(serializeObjects(t.etat.objects))).not.toBe(avant);
    // Une seconde mesure sans nouvelle photo ne repose rien : la facade est a jour.
    await t.v.lancer();
    expect(t.projet.pushHistory).toHaveBeenCalledTimes(1);
    t.historique.annuler();
    expect(JSON.stringify(serializeObjects(t.etat.objects))).toBe(avant);
  }, 30000);

  it('ne touche jamais une facade que la personne a relevee a la main : la ligne reste une proposition decochee', async () => {
    const m = await mesureDeReference();
    expect(m.releve).not.toBeNull();
    // Deux ouvertures a la main, loin des six que montre la photo de l'etalon 02 : un desaccord que l'arbitrage voit.
    const main: ReleveFacade = { ...(m.releve as ReleveFacade), releveLe: '2026-10-01T10:00:00Z', ouvertures: [0, 1].map((k) => ({ type: 'fenetre' as const, x: 1 + k, y: 1, l: 0.8, h: 1.4 })) };
    const t = monter({ batiment: { facades: [main] } });
    await t.v.lancer();
    expect(t.maison().batiment?.facades).toEqual([main]);
    expect(t.projet.pushHistory).not.toHaveBeenCalled();
    const p = t.v.propositions().find((x) => x.id === 'maison#0:releve');
    expect(p?.remplaceChoix).toMatch(/^relevé du 01\/10\/2026/);
    // Une valeur choisie a la main est un veto : la decision est a la personne.
    expect(p?.arbitrages?.[0]).toMatchObject({ attribut: 'ouverturesFacade', decision: 'manuelle' });
    expect(t.v.cochee('maison#0:releve')).toBe(false);
  }, 30000);

  it('remplace un releve pose par l audit d apres une photo plus ancienne, mais pas un releve refait a la main (la marque tombe)', async () => {
    const m = await mesureDeReference();
    expect(m.coinsTrouves && (m.confiance ?? 1) >= CONFIANCE_MIN && !!m.releve).toBe(true);
    const ancien: ReleveFacade = { ...(m.releve as ReleveFacade), releveLe: '2026-10-01T10:00:00Z', depuisAudit: true };
    const t = monter({ batiment: { facades: [ancien] } });
    await t.v.lancer();
    expect(t.maison().batiment?.facades?.[0]?.releveLe).not.toBe(ancien.releveLe);
    expect(t.maison().batiment?.facades?.[0]?.depuisAudit).toBe(true);
    // Refait a la main (app/releve/releve.ts retire la marque) : l'audit ne le remplace plus tout seul.
    const { depuisAudit: _marque, ...refait } = { ...(t.maison().batiment?.facades?.[0] as ReleveFacade), releveLe: '2026-10-14T10:00:00Z' };
    void _marque;
    const t2 = monter({ batiment: { facades: [refait] } });
    await t2.v.lancer();
    expect(t2.maison().batiment?.facades?.[0]?.releveLe).toBe('2026-10-14T10:00:00Z');
  }, 30000);

  it('ne pose rien dans la consultation d un audit recu (rien ne se mesure ni ne s ecrit)', async () => {
    const t = monter();
    t.v.figer([]);
    await t.v.lancer();
    expect(t.maison().batiment?.facades ?? []).toHaveLength(0);
    expect(t.projet.pushHistory).not.toHaveBeenCalled();
  });
});

// La photo prise a l'ecran de prise (« Photographier » sur un mur, decision du proprietaire du 14 novembre 2026) : le calcul fini, le
// releve se pose sur la facade sans autre geste, par le meme chemin que celui que l'audit pose d'office a l'ouverture des propositions.
describe('la photo prise se pose sur sa facade des la fin du calcul', () => {
  const PHOTO_SUD = { cle: 'maison', cote: 0 };
  const facades = (t: ReturnType<typeof monter>) => t.maison().batiment?.facades ?? [];

  it('pose la photo et les ouvertures non verifiees (depuisAudit), en un pas d historique, et le dit', async () => {
    const t = monter();
    const r = await t.v.poserLaPrise(PHOTO_SUD.cle, PHOTO_SUD.cote);
    expect(r).toBe('posee');
    expect(facades(t)).toHaveLength(1);
    expect(facades(t)[0]).toMatchObject({ cote: 0, depuisAudit: true, texture: 'data:image/jpeg;base64,TEXTURE' });
    expect((facades(t)[0]?.ouvertures ?? []).length).toBeGreaterThan(0);
    expect((facades(t)[0]?.ouvertures ?? []).every((o) => !o.verifieeLe)).toBe(true);
    expect(t.projet.pushHistory).toHaveBeenCalledTimes(1);
    expect(t.projet.refaire3d).toHaveBeenCalled();
    expect(t.messages.at(-1)).toBe('Photo posée sur la façade (ouvertures à vérifier dans l’audit ; Ctrl+Z pour annuler).');
    // La meme ligne n'est plus proposee : l'ouverture des propositions ne la repose pas.
    await t.v.lancer();
    expect(t.projet.pushHistory).toHaveBeenCalledTimes(1);
  }, 60000);

  it('Ctrl+Z defait la pose au bit pres', async () => {
    const t = monter();
    const avant = JSON.stringify(serializeObjects(t.etat.objects));
    await t.v.poserLaPrise(PHOTO_SUD.cle, PHOTO_SUD.cote);
    expect(JSON.stringify(serializeObjects(t.etat.objects))).not.toBe(avant);
    t.historique.annuler();
    expect(JSON.stringify(serializeObjects(t.etat.objects))).toBe(avant);
  }, 60000);

  it('sans coins trouves, ne pose rien et dit le chemin a la main', async () => {
    // La recherche des coins forcee a « non trouves » : ceux que la prise de vue predit, seuls.
    const sansCoins = async (e: Parameters<typeof rechercher>[0]): Promise<ReturnType<typeof rechercher>> => {
      const r = rechercher(e);
      return r.coins?.coins ? { ...r, coins: { ...r.coins, trouve: false, note: 0, sources: ['predit', 'predit', 'predit', 'predit'] } } : r;
    };
    const t = monter({}, { ...dependances, chercherCoins: sansCoins });
    const r = await t.v.poserLaPrise(PHOTO_SUD.cle, PHOTO_SUD.cote);
    expect(r).toBe('sans-coins');
    expect(facades(t)).toHaveLength(0);
    expect(t.projet.pushHistory).not.toHaveBeenCalled();
    expect(t.messages.at(-1)).toBe('Les coins du mur n’ont pas été trouvés : la photo n’est pas posée. Dans la liste, dépliez la façade et placez 4 repères sur la photo.');
  }, 60000);

  it('une deuxieme photo remplace la pose d apres la premiere : un pas de plus, que Ctrl+Z defait seul', async () => {
    const t = monter();
    await t.v.poserLaPrise(PHOTO_SUD.cle, PHOTO_SUD.cote);
    const premiere = JSON.stringify(serializeObjects(t.etat.objects));
    const le = facades(t)[0]?.releveLe;
    t.capture.ajouterPhotoFacade('maison', 0, { ...PHOTO, base64: 'AAAABBBB' });
    expect(await t.v.poserLaPrise(PHOTO_SUD.cle, PHOTO_SUD.cote)).toBe('posee');
    expect(facades(t)).toHaveLength(1);
    expect(facades(t)[0]?.depuisAudit).toBe(true);
    expect(facades(t)[0]?.releveLe).not.toBe(le);
    expect(t.projet.pushHistory).toHaveBeenCalledTimes(2);
    t.historique.annuler();
    expect(JSON.stringify(serializeObjects(t.etat.objects))).toBe(premiere);
  }, 90000);

  it('une photo prise pendant le calcul : la facade se recalcule avec elle, et ne se pose qu une fois', async () => {
    const t = monter();
    const un = t.v.poserLaPrise(PHOTO_SUD.cle, PHOTO_SUD.cote);
    t.capture.ajouterPhotoFacade('maison', 0, { ...PHOTO, base64: 'AAAABBBB' });
    const deux = t.v.poserLaPrise(PHOTO_SUD.cle, PHOTO_SUD.cote);
    const r = await Promise.all([un, deux]);
    expect(r.filter((x) => x === 'posee')).toHaveLength(1);
    expect(t.projet.pushHistory).toHaveBeenCalledTimes(1);
    // La mesure posee est celle des deux photos : elle est a jour, rien ne reste a poser.
    expect(t.v.mesuresFaites().has('maison#0')).toBe(true);
    expect(t.v.propositions().some((p) => p.id === 'maison#0:releve')).toBe(false);
  }, 120000);

  it('ne touche jamais une facade relevee a la main', async () => {
    const m = await mesureDeReference();
    const main: ReleveFacade = { ...(m.releve as ReleveFacade), releveLe: '2026-10-01T10:00:00Z', ouvertures: [0, 1].map((k) => ({ type: 'fenetre' as const, x: 1 + k, y: 1, l: 0.8, h: 1.4 })) };
    const t = monter({ batiment: { facades: [main] } });
    expect(await t.v.poserLaPrise(PHOTO_SUD.cle, PHOTO_SUD.cote)).toBe('rien');
    expect(facades(t)).toEqual([main]);
    expect(t.projet.pushHistory).not.toHaveBeenCalled();
  }, 60000);

  it('ne pose rien dans la consultation d un audit recu', async () => {
    const t = monter();
    t.v.figer([]);
    expect(await t.v.poserLaPrise(PHOTO_SUD.cle, PHOTO_SUD.cote)).toBe('rien');
    expect(t.projet.pushHistory).not.toHaveBeenCalled();
  });
});
