import { describe, it, expect, vi } from 'vitest';
import { creerValidation, type ProjetAudit } from '../../../../../src/app/audit/parcelle/validation.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { rechercher } from '../../../../../src/facade/releve/serie.js';
import { creerHistorique } from '../../../../../src/core/historique.js';
import { serializeObjects, serializeMeasures } from '../../../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { schemaMinimal } from '../../../../../src/model/migrations.js';
import { appliquerPropositions } from '../../../../../src/regles/decisions.js';
import { etapesApresValidation } from '../../../../../src/app/audit/parcelle/facadeValidee.js';
import type { EtatApp } from '../../../../../src/core/state.js';
import type { PhotoCas, PrisePhoto } from '../../../../../src/model/audit.js';
import type { RunEnregistre } from '../../../../../src/regles/facades/observations.js';
import { SORTIE_FACADE } from '../../../../fixtures/deploy/fauxAnthropic.js';
import type { CorpsToit, ObjetAPlat, ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La validation d'une facade dans l'audit (V4, MD/spec-facade-calage-audit.md §4 E11, lot F5) : le bilan de la facade (E11) s'ecrit
// dans le projet d'un geste, en un pas d'historique ; ses ouvertures, verifiees, ne bougent plus a un rejeu. La photo de synthese et
// le montage sont ceux de facadesAutomatiques.test.ts.

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

function monter(avant: Partial<ObjetPlan> = {}, runs: () => Record<string, RunEnregistre> | null = () => null) {
  const objets = normalizeObjects([
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
    obj('maison', { fonction: 'batiment', pts: PTS, elevation: 6, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS] },  ...avant }),
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
    analyse: { reponses: () => null, version: () => 0, runs },
  });
  const maison = () => etat.objects.find((o) => o.key === 'maison') as ObjetPlan;
  return { etat, historique, projet, v, messages, maison, capture };
}


describe('la validation d une facade (V4)', () => {
  it('ecrit la Facade du bilan en un pas d historique : dimensions, forme, pose de la texture, ouvertures numerotees et verifiees', async () => {
    const t = monter();
    await t.v.lancer();
    const m = t.v.mesuresFaites().get('maison#0');
    // L'E11 attend la personne : le bilan est la, rien n'est encore ecrit de la Facade.
    expect(m?.etapes?.find((e) => e.id === 'validation')).toMatchObject({ etat: 'a-confirmer', resume: expect.stringMatching(/^Mur de 10 × .* Validez la façade pour l’écrire dans le projet \(V4\)\.$/) });
    expect(m?.facade?.ouvertures.length).toBe(m?.releve?.ouvertures.length);
    expect(t.maison().batiment?.facades?.[0]?.dimensions).toBeUndefined();
    expect(t.v.facadeValidee('maison', 0)).toBeNull();
    const avant = JSON.stringify(serializeObjects(t.etat.objects));
    expect(t.v.validerFacade('maison', 0)).toBe(true);
    expect(t.projet.pushHistory).toHaveBeenCalledTimes(2);
    const r = t.maison().batiment?.facades?.[0];
    // Les dimensions du plan (un batiment dessine : sa hauteur est saisie), le gabarit du toit, la texture et le mur sur elle.
    expect(r?.dimensions).toMatchObject({ largeurM: 10, egoutM: 6, source: 'saisie' });
    expect(r?.forme?.gabarit.length).toBeGreaterThanOrEqual(2);
    expect(r?.textureCalee?.cadre.x1).toBeGreaterThan(0);
    expect(r?.depuisAudit).toBeUndefined();
    expect(r?.ouvertures.map((o) => o.id)).toEqual(r?.ouvertures.map((_, i) => 'o' + (i + 1)));
    expect(r?.ouvertures.every((o) => o.verifieeLe === '2026-10-13')).toBe(true);
    expect(schemaMinimal(serializeObjects(t.etat.objects) as unknown as ObjetAPlat[])).toBe(7);
    // La barre dit l'E11 faite ; Ctrl+Z defait la validation d'un coup.
    expect(t.v.facadeValidee('maison', 0)).toBe(r);
    expect(etapesApresValidation(m?.etapes ?? [], r ?? null).find((e) => e.id === 'validation')?.etat).toBe('ok');
    expect(t.messages.at(-1)).toMatch(/^Façade validée : \d+ ouvertures? vérifiées?, dimensions, forme et texture écrites dans le projet\. Ctrl\+Z la défait\.$/);
    t.historique.annuler();
    expect(JSON.stringify(serializeObjects(t.etat.objects))).toBe(avant);
  }, 30000);

  it('un rejeu ne deplace pas une ouverture verifiee : il ne s ecrit pas d office, et ecrit, il garde leur place, les dimensions et la forme', async () => {
    const t = monter();
    await t.v.lancer();
    t.v.validerFacade('maison', 0);
    // La personne a verifie ses ouvertures ; la premiere, un peu a cote de ce que la detection voit (elle l'a placee elle-meme), et
    // elle en a ajoute une que la photo ne montre pas (la porte du fond).
    const valide = t.maison().batiment?.facades?.[0];
    if (!valide?.ouvertures.length) throw new Error('aucune ouverture a verifier');
    const placee = { ...valide.ouvertures[0]!, x: valide.ouvertures[0]!.x + 0.05 };
    const ajoutee = { type: 'porte' as const, x: 8.6, y: 0, l: 0.9, h: 2.1, source: 'ajoutee' as const, id: 'o9', verifieeLe: '2026-10-13' };
    t.maison().batiment!.facades = [{ ...valide, ouvertures: [placee, ...valide.ouvertures.slice(1), ajoutee] }];
    // Un rejeu : la nouvelle mesure ne s'ecrit pas d'office sur une Facade validee (model/protections.ts, groupe `facadeTexture`).
    await t.v.rejouerFacade('maison', 0);
    expect(t.maison().batiment?.facades?.[0]?.ouvertures).toEqual([placee, ...valide.ouvertures.slice(1), ajoutee]);
    // Ecrite quand meme (la personne coche la ligne qui la propose : le meme effet, `releve`), ses ouvertures verifiees restent telles
    // quelles, a leur place, et la detection qui les recouvre n'entre pas en double.
    const neuve = t.v.mesuresFaites().get('maison#0')?.releve;
    if (!neuve) throw new Error('pas de nouvelle mesure');
    expect(neuve.releveLe).not.toBe(valide.releveLe);
    appliquerPropositions(t.etat.objects, [{ id: 'maison#0:releve', cible: { type: 'facade', cle: 'maison', cote: 0 }, objet: 'Façade', source: 'mesure', avant: '', apres: '', indices: [], confiance: null, remplaceChoix: 'relevé validé', reserve: null, effet: { type: 'releve', releve: neuve } }], [], '2026-11-02');
    const apres = t.maison().batiment?.facades?.[0];
    expect(apres?.releveLe).toBe(neuve.releveLe);
    expect(apres?.ouvertures).toContainEqual(placee);
    expect(apres?.ouvertures).toContainEqual(ajoutee);
    expect(apres?.ouvertures.filter((o) => Math.abs(o.x - placee.x) < 0.5 && Math.abs(o.y - placee.y) < 0.5)).toHaveLength(1);
    expect(apres?.dimensions).toMatchObject({ largeurM: 10, egoutM: 6, source: 'saisie' });
    expect(apres?.forme).toEqual(valide.forme);
    expect(apres?.textureCalee).toBeUndefined();
  }, 60000);

  it('ne valide rien sans bilan, ni dans la consultation d un audit recu', async () => {
    const t = monter();
    expect(t.v.validerFacade('maison', 0)).toBe(false);
    t.v.figer([]);
    expect(t.v.validerFacade('maison', 0)).toBe(false);
    expect(t.projet.pushHistory).not.toHaveBeenCalled();
  });

  // Une ouverture lue sous le pignon d'un corps voisin (decision du proprietaire, 2 novembre 2026, Q2 ; facade/releve/murVoisin.ts) : la
  // maison a un sommet au milieu de sa facade sud (le mur photographie, cote 0, de 5 a 10 ; le mur du corps voisin, cote 1, de 10 a 15).
  // La detection elle-meme est prouvee de bout en bout dans murVoisin.test.ts ; ici, ce qu'elle a lu est pose sur la mesure.
  const EN_L: PtBrut[] = [{ x: 5, y: 10 }, { x: 10, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 18 }, { x: 5, y: 18 }];
  const SOUS_LE_PIGNON = { type: 'fenetre' as const, x: 5.8, y: 0.9, l: 1.1, h: 1.3 };
  const avecLaBaieDuVoisin = (t: ReturnType<typeof monter>) => {
    const m = t.v.mesuresFaites().get('maison#0');
    if (!m?.releve) throw new Error('pas de releve');
    m.releve.ouvertures = [...m.releve.ouvertures, { ...SOUS_LE_PIGNON }];
    // Le releve que l'audit a pose d'office sur le mur, d'apres la meme mesure.
    const pose = t.maison().batiment?.facades?.find((x) => x.cote === 0);
    if (pose) pose.ouvertures = [...pose.ouvertures, { ...SOUS_LE_PIGNON }];
  };

  it('A1 : une baie sous le pignon voisin va sur la facade de son mur, en un pas avec celle-ci ; Ctrl+Z defait les deux', async () => {
    const voisine = { cote: 1, largeur: 5, hauteur: 6, texture: 'data:image/jpeg;base64,VOISINE', ouvertures: [{ type: 'porte' as const, x: 3, y: 0, l: 1, h: 2.1, id: 'o1', verifieeLe: '2026-10-01', source: 'ajoutee' as const }], distance: null, sourceDistance: null, releveLe: '2026-10-01', dimensions: { largeurM: 5, egoutM: 6, source: 'saisie' as const } };
    const t = monter({ pts: EN_L, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS], facades: [voisine] } });
    await t.v.lancer();
    avecLaBaieDuVoisin(t);
    const avant = JSON.stringify(serializeObjects(t.etat.objects));
    const appels = (t.projet.pushHistory as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(t.v.validerFacade('maison', 0)).toBe(true);
    expect((t.projet.pushHistory as ReturnType<typeof vi.fn>).mock.calls.length).toBe(appels + 1);
    const facades = t.maison().batiment?.facades ?? [];
    // Ce mur ne la porte plus ; le mur voisin l'a, dans son repere (x = 0,8 depuis sa gauche), detectee, numerotee a la suite.
    expect(facades.find((x) => x.cote === 0)?.ouvertures.some((o) => o.x > 5)).toBe(false);
    const v = facades.find((x) => x.cote === 1);
    expect(v?.ouvertures).toEqual([voisine.ouvertures[0], { type: 'fenetre', x: 0.8, y: 0.9, l: 1.1, h: 1.3, source: 'detectee', id: 'o2' }]);
    // Rien d'autre de la facade voisine ne change.
    expect({ ...v, ouvertures: [] }).toEqual({ ...voisine, ouvertures: [] });
    expect(t.messages.at(-1)).toMatch(/La façade voisine est complétée des ouvertures lues sous le pignon de son corps\. Ctrl\+Z la défait\.$/);
    t.historique.annuler();
    expect(JSON.stringify(serializeObjects(t.etat.objects))).toBe(avant);
  }, 30000);

  it('A2c : le mur voisin n a pas de facade, la baie reste sur ce mur et aucune facade n est creee', async () => {
    const t = monter({ pts: EN_L });
    await t.v.lancer();
    avecLaBaieDuVoisin(t);
    expect(t.v.validerFacade('maison', 0)).toBe(true);
    const facades = t.maison().batiment?.facades ?? [];
    expect(facades.map((x) => x.cote)).toEqual([0]);
    expect(facades[0]?.ouvertures.some((o) => o.x === 5.8)).toBe(true);
  }, 30000);
});

describe('« Confirmer le mur » (V1) dans l audit, puis V4 (decision du proprietaire, 3 novembre 2026)', () => {
  it('confirme le mur retenu (il survit au rejeu), l ecrit avec la Facade en un pas d historique, et le meme geste le retire', async () => {
    const t = monter();
    await t.v.lancer();
    const etatE5 = () => t.v.mesuresFaites().get('maison#0')?.etapes?.find((e) => e.id === 'calage');
    const propre = etatE5()?.etat;
    expect(propre).not.toBe('confirme');
    expect(await t.v.confirmerMur('maison', 0)).toBe(true);
    // Dans la capture : les coins que la mesure a retenus, et le jour ; la facade s'est rejouee, l'E5 est « confirmé par vous ».
    const mur = t.capture.lire().batiments.maison?.facades['0']?.murConfirme;
    expect(mur?.le).toBe('2026-10-13T09:00:00.000Z');
    expect(mur?.coins[0]?.coins).toHaveLength(4);
    expect(etatE5()).toMatchObject({ etat: 'confirme', resume: expect.stringMatching(/^Mur confirmé par vous le 13 octobre 2026\./) });
    expect(t.v.mesuresFaites().get('maison#0')?.etapes?.some((e) => e.herite)).toBe(false);
    // Un rejeu (« Rejouer la façade ») garde la confirmation : le meme mur.
    await t.v.rejouerFacade('maison', 0);
    expect(etatE5()?.etat).toBe('confirme');
    // V4 : la Facade porte le jour de la confirmation, dans son calage ; un seul pas d'historique, que Ctrl+Z defait.
    const avant = JSON.stringify(serializeObjects(t.etat.objects));
    const n = (t.projet.pushHistory as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(t.v.validerFacade('maison', 0)).toBe(true);
    expect((t.projet.pushHistory as ReturnType<typeof vi.fn>).mock.calls.length).toBe(n + 1);
    expect(t.maison().batiment?.facades?.[0]?.calage?.murConfirmeLe).toBe('2026-10-13T09:00:00.000Z');
    t.historique.annuler();
    expect(JSON.stringify(serializeObjects(t.etat.objects))).toBe(avant);
    // Le meme geste retire la confirmation : l'E5 retrouve son propre verdict.
    expect(await t.v.confirmerMur('maison', 0)).toBe(true);
    expect(t.capture.lire().batiments.maison?.facades['0']?.murConfirme).toBeUndefined();
    expect(etatE5()?.etat).toBe(propre);
  }, 60000);

  it('ne confirme rien dans la consultation d un audit recu', async () => {
    const t = monter();
    await t.v.lancer();
    t.v.figer([]);
    expect(await t.v.confirmerMur('maison', 0)).toBe(false);
  }, 30000);
});


describe('Ctrl+Z sur « Confirmer le mur » avant V4 (decision du proprietaire, 3 novembre 2026)', () => {
  it('defait la confirmation d un pas (et la refait), sans rien ecrire dans le projet ; V4 passe la main au Ctrl+Z du projet', async () => {
    const t = monter();
    await t.v.lancer();
    const etatE5 = () => t.v.mesuresFaites().get('maison#0')?.etapes?.find((e) => e.id === 'calage')?.etat;
    const propre = etatE5();
    const projet = JSON.stringify(serializeObjects(t.etat.objects));
    const pas = (t.projet.pushHistory as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(t.capture.peutAnnulerGeste()).toBe(false);
    await t.v.confirmerMur('maison', 0);
    expect(etatE5()).toBe('confirme');
    expect(t.capture.peutAnnulerGeste()).toBe(true);
    // Ctrl+Z : la capture d'avant le geste, la facade rejouee ; l'E5 retrouve son verdict.
    expect(t.capture.annulerGeste()).toEqual({ cle: 'maison', cote: 0 });
    expect(t.capture.lire().batiments.maison?.facades['0']?.murConfirme).toBeUndefined();
    await t.v.rejouerFacade('maison', 0);
    expect(etatE5()).toBe(propre);
    // Ctrl+Y : la confirmation revient.
    expect(t.capture.retablirGeste()).toEqual({ cle: 'maison', cote: 0 });
    await t.v.rejouerFacade('maison', 0);
    expect(etatE5()).toBe('confirme');
    // Rien n'est entre dans le projet : ni pas d'historique, ni changement.
    expect((t.projet.pushHistory as ReturnType<typeof vi.fn>).mock.calls.length).toBe(pas);
    expect(JSON.stringify(serializeObjects(t.etat.objects))).toBe(projet);
    // V4 ecrit dans le projet : son Ctrl+Z prend la suite, les gestes d'avant ne se defont plus sur la capture.
    t.v.validerFacade('maison', 0);
    expect(t.capture.peutAnnulerGeste()).toBe(false);
    t.historique.annuler();
    expect(JSON.stringify(serializeObjects(t.etat.objects))).toBe(projet);
  }, 60000);
});

describe('V3 dans l audit : les ouvertures se relisent avant V4 (decision du proprietaire, 3 novembre 2026)', () => {
  it('relues, l E9 est faite et V4 ecrit celles qui ont ete gardees ; Ctrl+Z defait la relecture avant V4', async () => {
    const t = monter();
    await t.v.lancer();
    const m = () => t.v.mesuresFaites().get('maison#0');
    const e9 = () => m()?.etapes?.find((e) => e.id === 'ouvertures');
    expect(e9()).toMatchObject({ etat: 'a-confirmer', resume: expect.stringMatching(/Relisez-les \(V3\)/) });
    // Le mur de cette photo de synthese est a confirmer : V1 d'abord, sinon l'E9 en herite le doute.
    if (m()?.etapes?.find((e) => e.id === 'calage')?.etat === 'a-confirmer') await t.v.confirmerMur('maison', 0);
    const detectees = m()?.releve?.ouvertures ?? [];
    if (detectees.length < 2) throw new Error('il faut deux ouvertures');
    // La personne retire la premiere et garde l'autre.
    expect(await t.v.relireOuvertures('maison', 0, detectees.slice(1))).toBe(true);
    expect(e9()).toMatchObject({ etat: 'ok', resume: expect.stringMatching(/^Ouvertures relues par vous le 13 octobre 2026 : 1 gardée\. /) });
    // Ctrl+Z avant V4 : la relecture defaite, l'E9 a relire ; Ctrl+Y : relue de nouveau.
    t.capture.annulerGeste(); await t.v.rejouerFacade('maison', 0);
    expect(e9()?.etat).toBe('a-confirmer');
    t.capture.retablirGeste(); await t.v.rejouerFacade('maison', 0);
    expect(e9()?.etat).toBe('ok');
    // V4 : la Facade ecrite porte les ouvertures gardees, pas celles de la detection.
    expect(t.v.validerFacade('maison', 0)).toBe(true);
    const r = t.maison().batiment?.facades?.[0];
    expect(r?.ouvertures).toHaveLength(detectees.length - 1);
    expect(r?.ouvertures[0]?.x).toBeCloseTo(detectees[1]!.x, 6);
  }, 60000);
});

describe('la lecture de Claude dans l enchainement de l audit (decision 4 du proprietaire, 3 novembre 2026)', () => {
  it('sa lecture refait la mesure : la barre la dit, l accord est celui de l E9, et V4 ecrit ses pointes dans la forme', async () => {
    let runs: Record<string, RunEnregistre> | null = null;
    const t = monter({}, () => runs);
    await t.v.lancer();
    const m = () => t.v.mesuresFaites().get('maison#0');
    expect(m()?.accord).toBeUndefined();
    expect(m()?.etapes?.find((e) => e.id === 'calage')?.resume).not.toMatch(/IA \(/);
    // La lecture arrive (le batch de l'analyse) : la facade se mesure de nouveau, avec elle.
    runs = { 'maison#0': { le: '2026-10-13T10:00:00.000Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, passes: 1, sorties: [SORTIE_FACADE], cout: 0.001, tokens: { entree: 1000, sortie: 400 }, image: { largeur: 500, hauteur: 300 }, chaine: 13 } };
    await t.v.lancer();
    // La barre la dit a la lecture de Claude (E8), et seulement la.
    expect(m()?.etapes?.find((e) => e.id === 'lectureIa')?.resume).toMatch(/^IA \(Claude, 2026-10-13.*vues? par Claude/);
    expect(m()?.etapes?.find((e) => e.id === 'calage')?.resume).not.toMatch(/IA \(/);
    expect(m()?.accord?.bilan.boites).toBeGreaterThan(0);
    // V4 ecrit ce que la barre montre : la forme du bilan, les pointes de Claude comprises.
    if (m()?.etapes?.find((e) => e.id === 'calage')?.etat === 'a-confirmer') await t.v.confirmerMur('maison', 0);
    expect(t.v.validerFacade('maison', 0)).toBe(true);
    const forme = t.maison().batiment?.facades?.[0]?.forme;
    expect(forme).toEqual(m()?.facade?.forme);
    expect(forme?.pointes?.some((p) => p.source === 'ia')).toBe(true);
  }, 60000);
});

