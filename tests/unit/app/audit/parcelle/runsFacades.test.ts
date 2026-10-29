import { describe, it, expect } from 'vitest';
import { creerAnalyseClaude } from '../../../../../src/app/audit/parcelle/analyseClaude.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { cleMesure, cochesParDefaut, type EntreesPropositions } from '../../../../../src/app/audit/parcelle/propositions.js';
import { accorderLesFacades, murDeLaTexture, rangerRuns, requetesRunsDuBatiment, type FabriqueImageRunFacade } from '../../../../../src/app/audit/parcelle/runsFacades.js';
import { propositionsAccords, RESERVE_POINTILLE } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import type { FabriqueImages } from '../../../../../src/app/audit/parcelle/entreesAnalyse.js';
import type { MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import type { ClientAnalyse, DemandeAnalyse, ResultatsBatch } from '../../../../../src/io/analyseClaude.js';
import type { RunEnregistre } from '../../../../../src/regles/facades/observations.js';
import type { Image } from '../../../../../src/facade/vision/homographie.js';
import type { ObjetBrut, ObjetPlan, PtBrut, ReleveFacade } from '../../../../../src/model/types.js';
import { SORTIE_FACADE } from '../../../../fixtures/deploy/fauxAnthropic.js';

// Le run d'une facade dans l'audit de la parcelle (MD/spec-facade-calage-audit.md §8, lot F3) : une requete par facade mesuree,
// dans le batch de l'analyse, sur l'elevation du mur ; sa reponse enregistree avec ses versions ; ses boites accordees par le moteur
// avec la detection, puis proposees, decochees. Il remplace le renfort a trois passes votees.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const PHOTO = { type: 'image/jpeg' as const, base64: 'QUJDRA==', prise: { t: '2026-10-13T09:00:00Z', x: 10, y: 2, lat: null, lon: null, precisionM: 5, azimutDeg: 0, sourceAzimut: 'boussole' as const, champDeg: 66 } };

/** Un mur de 10 x 6 m a 50 px/m, une baie sombre de 1,2 x 1,3 m a x = 6, y = 1 ; la texture monte 2 m au-dessus de l'egout. */
function texture(): Image {
  const px = 50, L = 10 * px, H = 8 * px;
  const donnees = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const m = x / px, z = 8 - (y + 0.5) / px;
    const baie = m >= 6 && m < 7.2 && z >= 1 && z < 2.3;
    const v = z > 6 ? 90 : baie ? 50 : 210;
    donnees.set([v, v, v, 255], (y * L + x) * 4);
  }
  return { largeur: L, hauteur: H, donnees };
}

const RELEVE: ReleveFacade = {
  cote: 0, largeur: 10, hauteur: 6, hauteurTexture: 8, texture: 'data:image/jpeg;base64,VEVYVFVSRQ==', distance: 8, sourceDistance: 'gps', releveLe: '2026-10-13T09:00:00Z',
  ouvertures: [{ type: 'fenetre', x: 2, y: 1, l: 1.2, h: 1.3, confiance: 0.9, source: 'detectee' }],
  calage: { photos: [{ coins: [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 600 }, { x: 100, y: 600 }], pxParMSource: 80, sourceCoins: ['trouve', 'trouve', 'trouve', 'trouve'] }], confiance: 0.8 },
};

/**
 * Les boites de Claude, en part du mur : celle que la detection a trouvee (x = 2, sans detail de plus), et la baie de x = 6 qu'elle
 * n'a pas vue.
 */
const RETROUVEE = { ...SORTIE_FACADE.ouvertures[0], type: 'fenetre', u0: 0.2, u1: 0.32, v0: 1 / 6, v1: 2.3 / 6, details: { volets: 'indetermine', allege: 'indetermine', forme: 'indetermine' } };
const SEULE = { ...RETROUVEE, u0: 0.61, u1: 0.71, v0: 0.9 / 6, v1: 2.4 / 6 };
const sortie = (ouvertures: object[]) => ({ ...SORTIE_FACADE, ouvertures, confiance: 'forte' });
const run = (ouvertures: object[]): RunEnregistre => ({ le: '2026-10-13T10:00:00.000Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, passes: 1, sorties: [sortie(ouvertures)], cout: 0.001, tokens: { entree: 1000, sortie: 400 }, image: { largeur: 500, hauteur: 300 }, chaine: 10 });

function entrees(m: Partial<MesureFacade> = {}): EntreesPropositions {
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101' } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6 },
  ] as ObjetBrut[]) as ObjetPlan[];
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  capture.ajouterPhotoFacade('maison', 0, PHOTO);
  capture.noterVu('maison', { murs: 'enduit' });
  capture.terminer();
  const mesure: MesureFacade = { cle: 'maison', cote: 0, releve: RELEVE, rangReleve: 0, coinsTrouves: true, confiance: 0.8, hauteurM: 6, couleur: null, gabarit: [{ u: 0, v: 1 }, { u: 0.5, v: 1.6 }, { u: 1, v: 1 }], ...m };
  return { objets, liste: listeDeControle(objets, capture.lire()), capture: capture.lire(), mesures: new Map([[cleMesure('maison', 0), mesure]]) };
}

const FAB: FabriqueImageRunFacade = { elevation: async (r) => ({ image: { base64: 'RUxFVg==', mediaType: 'image/jpeg' }, largeur: r.largeur * 50, hauteur: r.hauteur * 50 }) };

describe('le run des facades dans l audit', () => {
  it('prepare trois passes par facade mesuree (la production), sur l elevation du mur, sans compter la facade une seconde fois', async () => {
    const r = await requetesRunsDuBatiment(entrees(), 'maison', 'maison', 0, FAB);
    expect(r.requetes.map((q) => [q.id, q.passe, q.usage, q.facades])).toEqual([['b0-f0-p1', 1, 'facade', 0], ['b0-f0-p2', 2, 'facade', 0], ['b0-f0-p3', 3, 'facade', 0]]);
    expect(r.requetes[2]!.contenu).toEqual(r.requetes[0]!.contenu);
    expect(r.parId['b0-f0-p3']).toMatchObject({ cle: 'maison', passe: 3, cote: 0, usage: 'facade' });
    // Une passe, pour mesurer.
    expect((await requetesRunsDuBatiment(entrees(), 'maison', 'maison', 0, FAB, Infinity, 1)).requetes.map((q) => q.id)).toEqual(['b0-f0-p1']);
    expect(r.parId['b0-f0-p1']).toEqual({ cle: 'maison', passe: 1, cote: 0, usage: 'facade', image: { largeur: 500, hauteur: 300 } });
    // L'image, puis le texte du run : la facade, ce qu'est l'image, ce que le plan attend du haut, le parement vu sur place.
    expect(r.requetes[0]!.contenu.map((b) => b.type)).toEqual(['image', 'text']);
    const texte = (r.requetes[0]!.contenu[1] as { text: string }).text;
    expect(texte).toMatch(/^Façade : sud de maison\./);
    expect(texte).toMatch(/L’image est le mur seul/);
    expect(texte).toMatch(/une pointe de pignon : u 0\.5, à environ 1\.6 fois l’égout/);
    expect(texte).toMatch(/Le parement du mur que Plan connaît .* : enduit\./);
    // Pas de place dans le batch pour ses trois passes, ou pas de releve mesure : rien.
    expect((await requetesRunsDuBatiment(entrees(), 'maison', 'maison', 0, FAB, 2)).requetes).toEqual([]);
    expect((await requetesRunsDuBatiment(entrees({ releve: null }), 'maison', 'maison', 0, FAB)).requetes).toEqual([]);
  });

  it('enregistre la reponse de chaque facade avec ses propres versions, comme la calibration la garde', () => {
    const lu: ResultatsBatch = {
      batch: { id: 'msgbatch_1', etat: 'ended', compte: null }, modele: 'claude-haiku-5-5', prompt: 7, schema: 5,
      resultats: [
        { id: 'b0-p1', statut: 'reussi', passe: 1, sortie: { forme: {} }, erreur: null },
        { id: 'b0-f0-p1', statut: 'reussi', passe: 1, usage: 'facade', sortie: sortie([RETROUVEE]), erreur: null, tokens: { entree: 900, ecritureCache: 0, lectureCache: 100, sortie: 300 }, cout: 0.0012, modele: 'claude-haiku-5-5', prompt: 1, schema: 1 },
        { id: 'b0-f0-p2', statut: 'reussi', passe: 2, usage: 'facade', sortie: sortie([RETROUVEE]), erreur: null, tokens: { entree: 900, ecritureCache: 0, lectureCache: 100, sortie: 300 }, cout: 0.0012, modele: 'claude-haiku-5-5', prompt: 1, schema: 1 },
        { id: 'b0-f0-p3', statut: 'echoue', passe: 3, usage: 'facade', sortie: null, erreur: { type: 'overloaded_error', message: 'Surcharge.' }, cout: 0.0001, modele: 'claude-haiku-5-5', prompt: 1, schema: 1 },
        { id: 'b0-f1-p1', statut: 'reussi', passe: 1, usage: 'facade', sortie: 'illisible', erreur: null },
      ],
    };
    const facade = (passe: number, cote = 0) => ({ cle: 'maison', passe, cote, usage: 'facade' as const, image: { largeur: 500, hauteur: 300 } });
    const requetes = { 'b0-p1': { cle: 'maison', passe: 1 }, 'b0-f0-p1': facade(1), 'b0-f0-p2': facade(2), 'b0-f0-p3': facade(3), 'b0-f1-p1': facade(1, 1) };
    const runs = rangerRuns(lu, requetes, new Date('2026-10-13T10:00:00Z'));
    expect(Object.keys(runs)).toEqual(['maison#0']);
    // Les trois passes envoyees ensemble : deux lues, le cout de toutes.
    expect(runs['maison#0']).toMatchObject({ le: '2026-10-13T10:00:00.000Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, passes: 3, cout: 0.0025, tokens: { entree: 2000, sortie: 600 }, image: { largeur: 500, hauteur: 300 } });
    expect(runs['maison#0']?.sorties).toHaveLength(2);
    const mur = murDeLaTexture(texture(), RELEVE);
    expect([mur.largeur, mur.hauteur]).toEqual([500, 300]);
  });

  it('accorde ses boites avec la detection : une boite seule reste decochee, en pointille, a part', async () => {
    const e = entrees();
    const accords = await accorderLesFacades({ 'maison#0': run([RETROUVEE, SEULE]) }, e.mesures, async () => texture());
    const a = accords['maison#0']!;
    expect(a.bilan).toMatchObject({ boites: 2, retrouvees: 1, seules: 1 });
    expect(a.confiance).toBe(0.9);
    // La boite seule est recalee sur les aretes de l'elevation : la baie sombre de x = 6.
    const seule = a.decochees.find((o) => o.source === 'claude')!;
    expect(Math.abs(seule.x - 6)).toBeLessThanOrEqual(0.06);
    const ps = propositionsAccords(e, accords);
    expect(ps.map((p) => p.id)).toEqual(['maison#0:claude:pointille']);
    expect(ps[0]).toMatchObject({ source: 'claude', reserve: RESERVE_POINTILLE, confiance: 0.9, apres: '2 ouvertures, dont 1 fenêtre en pointillé, vue par Claude, non confirmée sur la photo' });
    expect(cochesParDefaut(ps).size).toBe(0);
  });

  it('confirme une baie devinee du releve au lieu d en ajouter une seconde ; ne propose rien quand rien ne change', async () => {
    const devinee = { type: 'fenetre' as const, x: 6, y: 1, l: 1.2, h: 1.3, source: 'devinee' as const, confiance: 0.4 };
    const e = entrees({ devinees: [devinee] });
    const a = (await accorderLesFacades({ 'maison#0': run([RETROUVEE, SEULE]) }, e.mesures, async () => texture()))['maison#0']!;
    expect(a.ouvertures).toContainEqual(devinee);
    expect(a.resume).toMatch(/1 baie devinée confirmée/);
    const ps = propositionsAccords(e, { 'maison#0': a });
    expect(ps.map((p) => p.id)).toEqual(['maison#0:claude:releve']);
    expect(ps[0]).toMatchObject({ reserve: expect.stringMatching(/^Taux d’accord de Claude non encore mesuré sur le relevé des façades/), apres: '2 ouvertures avec l’aide de Claude (2 ouvertures vues par Claude : 1 retrouvée par la détection, 1 baie devinée confirmée)' });
    // Ses details (volets, allege) completent ceux d'une ouverture retrouvee : le releve change, une ligne le propose.
    const details = (await accorderLesFacades({ 'maison#0': run([{ ...RETROUVEE, details: SORTIE_FACADE.ouvertures[0]!.details }]) }, entrees().mesures, async () => texture()))['maison#0']!;
    expect(details.resume).toMatch(/1 détail ajouté/);
    // Toutes ses boites retrouvees, sans detail de plus : rien a proposer.
    const rien = (await accorderLesFacades({ 'maison#0': run([RETROUVEE]) }, entrees().mesures, async () => texture()))['maison#0']!;
    expect(rien.resume).toBeNull();
    expect(propositionsAccords(entrees(), { 'maison#0': rien })).toEqual([]);
  });

  it('part dans le batch de l analyse, et garde la reponse et l accord a la lecture', async () => {
    const e = entrees();
    const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
    capture.ajouterPhotoFacade('maison', 0, PHOTO);
    capture.terminer();
    const demandes: DemandeAnalyse[] = [];
    const immediats: DemandeAnalyse[] = [];
    let fini = false;
    const client: ClientAnalyse = {
      creerBatch: async (d) => { demandes.push(d); return { batch: { id: 'msgbatch_1', etat: 'in_progress', compte: null }, modele: 'claude-haiku-5-5', prompt: 1, schema: 1 }; },
      etatBatch: async (id) => ({ id, etat: fini ? 'ended' : 'in_progress', compte: null }),
      resultats: async (id) => ({ batch: { id, etat: 'ended', compte: null }, modele: 'claude-haiku-5-5', prompt: 3, schema: 2, resultats: (demandes[0]?.requetes ?? []).map((q) => ({ id: q.id, statut: 'reussi' as const, passe: q.passe, usage: q.usage ?? 'analyse', sortie: q.usage === 'facade' ? sortie([SEULE]) : {}, erreur: null, ...(q.usage === 'facade' ? { prompt: 1, schema: 1, modele: 'claude-haiku-5-5' } : {}) })) }),
      etat: async () => ({ actif: true, prompt: 1, schema: 1, organisation: null, admin: true, escaladeFacade: { modele: 'claude-sonnet-5-5', prix: { entree: 3, sortie: 15 } } }),
      immediat: async (d) => { immediats.push(d); return { modele: 'claude-sonnet-5-5', prompt: 2, schema: 2, resultats: d.requetes.map((q) => ({ id: q.id, statut: 'reussi' as const, passe: 1, usage: 'escalade', sortie: sortie([SEULE, RETROUVEE]), erreur: null, cout: 0.004, tokens: { entree: 1000, ecritureCache: 0, lectureCache: 0, sortie: 300 } })) }; },
    };
    const images: FabriqueImages = { photo: async (p) => ({ base64: p.base64, mediaType: 'image/jpeg' }), rendu: () => null, ortho: async () => null, carte: () => null, facade: FAB };
    const recus: Record<string, RunEnregistre>[] = [];
    const planifies: (() => void)[] = [];
    const a = creerAnalyseClaude({
      capture, entrees: () => ({ ...e, capture: capture.lire() }), mesuresPretes: async () => {}, client, images,
      identite: () => ({ projet: null, idu: '78650000AE0101', adresse: null, audit: 'a-1' }), signaler: () => {}, maintenant: () => new Date('2026-10-13T10:00:00Z'),
      accorder: async (runs) => { recus.push(runs); return accorderLesFacades(runs, e.mesures, async () => texture()); },
      planifier: (f) => { planifies.push(f); return () => {}; },
    });
    await a.accorder(true);
    expect(demandes[0]!.requetes.map((q) => q.id)).toEqual(['b0-p1', 'b0-p2', 'b0-p3', 'b0-f0-p1', 'b0-f0-p2', 'b0-f0-p3']);
    expect(capture.lire().analyse?.batch?.requetes['b0-f0-p1']).toEqual({ cle: 'maison', passe: 1, cote: 0, usage: 'facade', image: { largeur: 500, hauteur: 300 } });
    fini = true;
    for (let k = 0; k < 3 && planifies.length; k++) { planifies.shift()?.(); await new Promise((ok) => setTimeout(ok, 0)); await new Promise((ok) => setTimeout(ok, 0)); }
    // La reponse est gardee avec ses propres versions (pas celles de l'analyse des maisons), puis accordee par le moteur.
    expect(capture.lire().analyse?.resultats?.runs?.['maison#0']).toMatchObject({ prompt: 1, schema: 1, passes: 3 });
    expect(recus[0]?.['maison#0']?.sorties).toHaveLength(3);
    expect(a.accords()?.['maison#0']?.bilan).toMatchObject({ seules: 1 });
    expect(immediats).toHaveLength(0);

    // L'escalade, a la demande : UNE requete, usage escalade, sur le contenu exact du run de la facade ; gardee dans le run, et
    // l'accord est refait par le moteur (la boite que l'escalade voit en plus, retrouvee par la detection, est cochee).
    expect(a.prixEscalade()).toBeNull();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(a.prixEscalade()).toEqual({ modele: 'claude-sonnet-5-5', prix: { entree: 3, sortie: 15 } });
    const dit = await a.escaladerFacade('maison#0');
    expect(dit).toBe('Escalade de la façade enregistrée (claude-sonnet-5-5, 0,0040 $) : le moteur l’a pesée contre le vote des passes.');
    expect(immediats[0]).toMatchObject({ usage: 'escalade', audit: expect.stringMatching(/^audit-esc-/) });
    expect(immediats[0]!.requetes.map((q) => [q.id, q.usage, q.facades])).toEqual([['escalade-p1', 'facade', 0]]);
    expect(immediats[0]!.requetes[0]!.contenu).toEqual(demandes[0]!.requetes.find((q) => q.id === 'b0-f0-p1')!.contenu);
    expect(a.runs()?.['maison#0']?.escalade).toMatchObject({ modele: 'claude-sonnet-5-5', cout: 0.004 });
    expect(a.accords()?.['maison#0']?.bilan).toMatchObject({ boites: 2, retrouvees: 1, seules: 1 });
    // Jamais deux.
    expect(await a.escaladerFacade('maison#0')).toBe('Cette façade est déjà escaladée : une seule escalade par lecture.');
    expect(immediats).toHaveLength(1);
  });
});
