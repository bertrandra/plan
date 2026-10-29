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
import type { CorpsToit, ObjetAPlat, ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La validation d'une facade dans l'audit (V4, MD/spec-facade-calage-audit.md §4 E9, lot F5) : le bilan de la facade (E9) s'ecrit
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

function monter(avant: Partial<ObjetPlan> = {}) {
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
  });
  const maison = () => etat.objects.find((o) => o.key === 'maison') as ObjetPlan;
  return { etat, historique, projet, v, messages, maison };
}


describe('la validation d une facade (V4)', () => {
  it('ecrit la Facade du bilan en un pas d historique : dimensions, forme, pose de la texture, ouvertures numerotees et verifiees', async () => {
    const t = monter();
    await t.v.lancer();
    const m = t.v.mesuresFaites().get('maison#0');
    // L'E9 attend la personne : le bilan est la, rien n'est encore ecrit de la Facade.
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
    // La barre dit l'E9 faite ; Ctrl+Z defait la validation d'un coup.
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
});
