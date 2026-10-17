import { describe, it, expect, vi } from 'vitest';
import { creerValidation, type ProjetAudit } from '../../../../../src/app/audit/parcelle/validation.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { mesurerFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { rechercher } from '../../../../../src/zones/releve/serie.js';
import { facadesDuContour } from '../../../../../src/facade/geometrie.js';
import { creerHistorique } from '../../../../../src/core/historique.js';
import { serializeObjects, serializeMeasures } from '../../../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { CONFIANCE_MIN } from '../../../../../src/regles/decisions.js';
import type { EtatApp } from '../../../../../src/core/state.js';
import type { PhotoCas, PrisePhoto } from '../../../../../src/model/audit.js';
import type { CorpsToit, ObjetBrut, ObjetPlan, PtBrut, ReleveFacade } from '../../../../../src/model/types.js';

// Les photos de l'audit alimentent les facades : la mesure d'une facade photographiee, aux coins trouves, pose
// son releve sur le projet sans attendre « Valider » (un pas d'historique, annulable), et ne touche jamais un releve
// fait a la main.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const PTS = rect(5, 10, 15, 18);
const CORPS: CorpsToit = { pts: PTS, posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };

/** Une photo de synthese : ciel, mur enduit beige, deux fenetres sombres, gazon (celle de mesures.test.ts). */
function image() {
  const L = 640, H = 480, data = new Uint8ClampedArray(L * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < L; i++) {
    let c = [205, 186, 152];
    if (j < 60) c = [150, 190, 235];
    else if (j > 420) c = [96, 140, 70];
    else if ((i > 150 && i < 210 || i > 430 && i < 490) && j > 160 && j < 260) c = [40, 46, 54];
    const k = (j * L + i) * 4;
    data[k] = c[0] as number; data[k + 1] = c[1] as number; data[k + 2] = c[2] as number; data[k + 3] = 255;
  }
  return { data, largeur: L, hauteur: H };
}
const prise: PrisePhoto = { t: '2026-10-13T09:00:00Z', x: 10, y: 2, lat: null, lon: null, precisionM: 4, azimutDeg: 0, sourceAzimut: 'boussole', inclinaisonDeg: 5, roulisDeg: 0, champDeg: 67 };
const PHOTO: PhotoCas = { type: 'image/jpeg', base64: 'AAAA', prise };
/**
 * La recherche des coins, forcee a « trouves » : sur la photo de synthese le calage fin ne les trouve pas ; on lui
 * fait dire qu'il a trouve ceux que la prise de vue predit, pour jouer la mesure d'une photo reussie.
 */
async function coinsTrouves(e: Parameters<typeof rechercher>[0]): Promise<ReturnType<typeof rechercher>> {
  const r = rechercher(e);
  if (!r.coins?.coins) return r;
  return { ...r, coins: { ...r.coins, trouve: true, note: 0.9, sources: ['trouve', 'trouve', 'trouve', 'trouve'] } };
}
const dependances = { pixels: async () => image(), chercherCoins: coinsTrouves, jpeg: () => 'data:image/jpeg;base64,TEXTURE', limites: () => [] };

function monter(avant: Partial<ObjetPlan> = {}) {
  const objets = normalizeObjects([
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
    obj('maison', { fonction: 'batiment', pts: PTS, elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS], ...avant }),
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
    maintenant: () => new Date('2026-10-13T09:00:00Z'), mesures: dependances,
  });
  const maison = () => etat.objects.find((o) => o.key === 'maison') as ObjetPlan;
  return { etat, historique, projet, v, messages, maison };
}

/** Ce que la mesure de la photo de synthese donne : ses coins sont-ils trouves, et avec quelle confiance ? */
async function mesureDeReference() {
  const f = facadesDuContour(PTS, 6).find((x) => x.orientation === 'Sud');
  return mesurerFacade('maison', f as NonNullable<typeof f>, { pts: PTS }, [PHOTO], dependances);
}

describe('les photos de l audit alimentent les facades', () => {
  it('pose le releve mesure des que la mesure est prete, sans « Valider », quand ses coins sont trouves', async () => {
    const m = await mesureDeReference();
    expect(m.coinsTrouves, 'la mesure de reference doit avoir des coins trouves').toBe(true);
    // La photo donne aussi la ligne du haut du mur, de quoi dire les bouts du toit (silhouettes.ts).
    expect(['triangle', 'trapeze', 'ligne-droite', 'rampe', 'indetermine']).toContain(m.silhouette);
    const attendu = m.coinsTrouves && (m.confiance ?? 1) >= CONFIANCE_MIN && !!m.releve;
    const t = monter();
    expect(t.maison().facades ?? []).toHaveLength(0);
    await t.v.lancer();
    const pose = t.maison().facades ?? [];
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
    const main: ReleveFacade = { ...(m.releve as ReleveFacade), releveLe: '2026-10-01T10:00:00Z', ouvertures: [{ type: 'fenetre', x: 1, y: 1, l: 1, h: 1.4 }] };
    const t = monter({ facades: [main] });
    await t.v.lancer();
    expect(t.maison().facades).toEqual([main]);
    expect(t.projet.pushHistory).not.toHaveBeenCalled();
    const p = t.v.propositions().find((x) => x.id === 'maison#0:releve');
    expect(p?.remplaceChoix).toMatch(/^relevé du 01\/10\/2026/);
    expect(t.v.cochee('maison#0:releve')).toBe(false);
  }, 30000);

  it('remplace un releve pose par l audit d apres une photo plus ancienne, mais pas un releve refait a la main (la marque tombe)', async () => {
    const m = await mesureDeReference();
    expect(m.coinsTrouves && (m.confiance ?? 1) >= CONFIANCE_MIN && !!m.releve).toBe(true);
    const ancien: ReleveFacade = { ...(m.releve as ReleveFacade), releveLe: '2026-10-01T10:00:00Z', depuisAudit: true };
    const t = monter({ facades: [ancien] });
    await t.v.lancer();
    expect(t.maison().facades?.[0]?.releveLe).not.toBe(ancien.releveLe);
    expect(t.maison().facades?.[0]?.depuisAudit).toBe(true);
    // Refait a la main (app/releve.ts retire la marque) : l'audit ne le remplace plus tout seul.
    const { depuisAudit: _marque, ...refait } = { ...(t.maison().facades?.[0] as ReleveFacade), releveLe: '2026-10-14T10:00:00Z' };
    void _marque;
    const t2 = monter({ facades: [refait] });
    await t2.v.lancer();
    expect(t2.maison().facades?.[0]?.releveLe).toBe('2026-10-14T10:00:00Z');
  }, 30000);

  it('ne pose rien dans la consultation d un audit recu (rien ne se mesure ni ne s ecrit)', async () => {
    const t = monter();
    t.v.figer([]);
    await t.v.lancer();
    expect(t.maison().facades ?? []).toHaveLength(0);
    expect(t.projet.pushHistory).not.toHaveBeenCalled();
  });
});
