import { describe, it, expect } from 'vitest';
import { creerAnalyseClaude, type AnalyseClaude } from '../../../../../src/app/audit/parcelle/analyseClaude.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { cleMesure, cochesParDefaut, type EntreesPropositions } from '../../../../../src/app/audit/parcelle/propositions.js';
import { creerValidation, type ProjetAudit } from '../../../../../src/app/audit/parcelle/validation.js';
import { signatureAnalyse } from '../../../../../src/model/auditParcelle.js';
import type { EtatApp } from '../../../../../src/core/state.js';
import { murDeLaTexture, rangerRenfort, renforcerFacades, requetesRenfortDuBatiment, type FabriqueImagesRenfortAudit } from '../../../../../src/app/audit/parcelle/entreesRenfort.js';
import { propositionsRenfort, RESERVE_POINTILLE, RESERVE_RENFORT } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import type { FabriqueImages } from '../../../../../src/app/audit/parcelle/entreesAnalyse.js';
import type { MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import type { ClientAnalyse, DemandeAnalyse, ResultatBatch } from '../../../../../src/io/analyseClaude.js';
import type { ReponseRenfort } from '../../../../../src/facade/detection/renfort.js';
import type { Image } from '../../../../../src/facade/vision/homographie.js';
import type { ObjetBrut, ObjetPlan, PtBrut, ReleveFacade } from '../../../../../src/model/types.js';

// Le renfort de Claude dans l'audit de la parcelle (lot L18) : trois requetes par facade relevee,
// dans le batch de l'analyse ; leurs reponses rangees par facade, recalees sur l'elevation de la
// texture du releve, puis proposees, decochees.

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

const passe = (manquees: ReponseRenfort['manquees']): ReponseRenfort => ({
  mur: { indices: [], vu: 'attendu' }, coins: { indices: [], hautGauche: 'indetermine', hautDroit: 'indetermine', basDroit: 'indetermine', basGauche: 'indetermine' },
  ouvertures: [{ indices: [], numero: 1, decision: 'garder', raison: 'sans-objet', type: 'indetermine', volets: 'indetermine', coffre: 'indetermine', balcon: 'indetermine', forme: 'indetermine' }],
  manquees, confiance: 'moyenne',
});
const MANQUEE = { indices: [{ image: 2, vu: 'fenêtre' }], type: 'fenetre' as const, x: 6.1, y: 0.9, l: 1.1, h: 1.4 };

function entrees(): EntreesPropositions {
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101' } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6 },
  ] as ObjetBrut[]) as ObjetPlan[];
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  capture.ajouterPhotoFacade('maison', 0, PHOTO);
  capture.terminer();
  const m: MesureFacade = { cle: 'maison', cote: 0, releve: RELEVE, rangReleve: 0, coinsTrouves: true, confiance: 0.8, hauteurM: 6, couleur: null };
  return { objets, liste: listeDeControle(objets, capture.lire()), capture: capture.lire(), mesures: new Map([[cleMesure('maison', 0), m]]) };
}

const FAB: FabriqueImagesRenfortAudit = {
  photo: async () => ({ base64: 'UEhPVE8=', mediaType: 'image/jpeg' }),
  elevation: async () => ({ base64: 'RUxFVg==', mediaType: 'image/png' }),
};

describe('le renfort dans l audit', () => {
  it('prepare trois requetes de renfort par facade relevee, sans compter la facade une seconde fois', async () => {
    const r = await requetesRenfortDuBatiment(entrees(), 'maison', 'maison', 0, FAB);
    expect(r.requetes.map((q) => [q.id, q.passe, q.usage, q.facades])).toEqual([['b0-f0-p1', 1, 'renfort', 0], ['b0-f0-p2', 2, 'renfort', 0], ['b0-f0-p3', 3, 'renfort', 0]]);
    expect(r.parId['b0-f0-p2']).toEqual({ cle: 'maison', passe: 2, cote: 0, usage: 'renfort' });
    const textes = r.requetes[0]!.contenu.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map((b) => b.text);
    expect(textes.at(-1)).toMatch(/Façade : sud de maison\./);
    expect(textes.at(-1)).toMatch(/1\. fenetre x 2,00/);
    // Pas de place dans le batch : rien.
    expect((await requetesRenfortDuBatiment(entrees(), 'maison', 'maison', 0, FAB, 2)).requetes).toEqual([]);
  });

  it('range les reponses par facade et garde le mur seul de la texture', () => {
    const res: ResultatBatch[] = [
      { id: 'b0-f0-p2', statut: 'reussi', passe: 2, usage: 'renfort', sortie: passe([MANQUEE]), erreur: null },
      { id: 'b0-f0-p1', statut: 'reussi', passe: 1, usage: 'renfort', sortie: passe([]), erreur: null },
      { id: 'b0-p1', statut: 'reussi', passe: 1, sortie: { forme: {} }, erreur: null },
    ];
    const par = rangerRenfort(res, { 'b0-f0-p1': { cle: 'maison', passe: 1, cote: 0, usage: 'renfort' }, 'b0-f0-p2': { cle: 'maison', passe: 2, cote: 0, usage: 'renfort' }, 'b0-p1': { cle: 'maison', passe: 1 } });
    expect(Object.keys(par)).toEqual(['maison#0']);
    expect(par['maison#0']!.map((r) => r.manquees.length)).toEqual([0, 1]);
    const mur = murDeLaTexture(texture(), RELEVE);
    expect([mur.largeur, mur.hauteur]).toEqual([500, 300]);
  });

  it('recale les graines sur la texture, puis propose le releve renforce, decoche', async () => {
    const e = entrees();
    const renfort = await renforcerFacades({ 'maison#0': [passe([MANQUEE]), passe([MANQUEE]), passe([])] }, e.mesures, async () => texture());
    const rf = renfort['maison#0']!;
    expect(rf.resume).toBe('1 ouverture ajoutée');
    const ajoutee = rf.ouvertures.find((o) => o.source === 'claude')!;
    expect(Math.abs(ajoutee.x - 6)).toBeLessThanOrEqual(0.04);
    expect(Math.abs(ajoutee.y - 1)).toBeLessThanOrEqual(0.04);
    const ps = propositionsRenfort(e, renfort);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ id: 'maison#0:claude:releve', source: 'claude', reserve: RESERVE_RENFORT, cible: { type: 'facade', cle: 'maison', cote: 0 }, apres: '2 ouvertures avec l’aide de Claude (1 ouverture ajoutée)' });
    expect(ps[0]!.effet).toMatchObject({ type: 'releve', releve: { texture: RELEVE.texture, grille: { travees: [{}, {}] } } });
    // Rien de change : pas de proposition.
    expect(propositionsRenfort(e, { 'maison#0': { ...rf, resume: null } })).toEqual([]);
  });

  it('confirme une baie devinee du releve au lieu d en ajouter une seconde', async () => {
    const e = entrees();
    const m = e.mesures.get('maison#0')!;
    const devinee = { type: 'fenetre' as const, x: 6, y: 1, l: 1.2, h: 1.3, source: 'devinee' as const, confiance: 0.4 };
    const mesures = new Map([['maison#0', { ...m, devinees: [devinee] }]]);
    const rf = (await renforcerFacades({ 'maison#0': [passe([MANQUEE]), passe([MANQUEE]), passe([])] }, mesures, async () => texture()))['maison#0']!;
    expect(rf.resume).toBe('1 baie devinée confirmée');
    expect(rf.ouvertures).toContainEqual(devinee);
  });

  it('propose a part, decochees, les ouvertures que Claude voit sans que la photo les confirme', async () => {
    const e = entrees();
    // Sans texture lisible, rien ne soutient la graine : elle reste en pointille.
    const renfort = await renforcerFacades({ 'maison#0': [passe([MANQUEE]), passe([MANQUEE]), passe([])] }, e.mesures, async () => null);
    expect(renfort['maison#0']?.resume).toBe('1 ouverture proposée en pointillé');
    const ps = propositionsRenfort(e, renfort);
    expect(ps.map((p) => p.id)).toEqual(['maison#0:claude:pointille']);
    expect(ps[0]).toMatchObject({ source: 'claude', reserve: RESERVE_POINTILLE, apres: '2 ouvertures, dont 1 fenêtre en pointillé, vue par Claude, non confirmée sur la photo' });
    expect((ps[0]!.effet as { releve: ReleveFacade }).releve.ouvertures.map((o) => o.source)).toEqual(['detectee', 'claude']);
    expect(cochesParDefaut(ps).size).toBe(0);
    // Avec une ouverture pleine en plus : deux lignes, la seconde contient la premiere et le dit.
    const deux = propositionsRenfort(e, { 'maison#0': { ...renfort['maison#0']!, bilan: { ...renfort['maison#0']!.bilan, typesCorriges: 1 } } });
    expect(deux.map((p) => p.id)).toEqual(['maison#0:claude:releve', 'maison#0:claude:pointille']);
    expect(deux[0]!.apres).toBe('1 ouverture avec l’aide de Claude (1 type corrigé)');
    expect(deux[1]!.reserve).toMatch(/comprend aussi les ouvertures de la ligne « avec l’aide de Claude »/);
  });

  it('a la reprise d un batch deja fini, attend les mesures pour recaler le renfort, et ne note jamais un renfort vide', async () => {
    const e = entrees();
    const etat = { objects: e.objets, measures: [], selectedKey: null, dirty: false } as unknown as EtatApp;
    const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
    capture.ajouterPhotoFacade('maison', 0, PHOTO);
    capture.terminer();
    // Le batch est parti avant que l'onglet ne soit decharge ; quand la page revient, il est fini.
    const requetes = Object.fromEntries([1, 2, 3].map((p) => ['b0-f0-p' + p, { cle: 'maison', passe: p, cote: 0, usage: 'renfort' as const }]));
    capture.noterAnalyse({ accord: { t: '2026-10-13T09:30:00.000Z', partage: true }, batch: { id: 'msgbatch_1', creeLe: '2026-10-13T09:30:00.000Z', signature: signatureAnalyse(capture.lire()), requetes, etiquettes: {} } });
    let lectures = 0;
    const client: ClientAnalyse = {
      etat: async () => ({ actif: true, prompt: 1, schema: 1, organisation: null, admin: true }),
      creerBatch: async () => { throw new Error('rien ne repart'); },
      etatBatch: async (id) => ({ id, etat: 'ended', compte: null }),
      resultats: async (id) => { lectures++; return { batch: { id, etat: 'ended', compte: null }, modele: 'modele-simule', prompt: 1, schema: 1, resultats: Object.keys(requetes).map((rid, k) => ({ id: rid, statut: 'reussi' as const, passe: k + 1, usage: 'renfort', sortie: passe(k < 2 ? [MANQUEE] : []), erreur: null })) }; },
      immediat: async () => { throw new Error('non'); },
    };
    const images: FabriqueImages = { photo: async (p) => ({ base64: p.base64, mediaType: 'image/jpeg' }), rendu: () => null, ortho: async () => null, carte: () => null };
    const projet: ProjetAudit = { pushHistory: () => {}, render: () => {}, refaire3d: () => {}, remplacer3d: () => true };
    const tours: (() => void)[] = [];
    const attendre = async () => { for (let k = 0; k < 6; k++) await new Promise((ok) => setTimeout(ok, 0)); };
    const monter = (mesuresPretes: () => Promise<void>) => {
      let analyse: AnalyseClaude | null = null;
      const validation = creerValidation({
        etat, capture, liste: () => listeDeControle(etat.objects, capture.lire()), projet, signaler: () => {}, maintenant: () => new Date('2026-10-13T10:00:00Z'),
        mesures: { pixels: async () => null, chercherCoins: async () => ({ distorsion: null, coins: null }), jpeg: () => '', limites: () => [] },
        analyse: { reponses: () => analyse?.reponses() ?? null, version: () => analyse?.version() ?? 0, renfort: () => analyse?.renfort() ?? null },
      });
      analyse = creerAnalyseClaude({
        capture, entrees: () => validation.entrees(), mesuresPretes, client, images,
        identite: () => ({ projet: null, idu: '78650000AE0101', adresse: null, audit: 'a-1' }), signaler: () => {}, maintenant: () => new Date('2026-10-13T10:00:00Z'),
        // Comme la session (controleur.ts) : les mesures du moment, lues a l'appel.
        renforcer: (par) => renforcerFacades(par, validation.entrees().mesures, async () => texture()),
        planifier: (f) => { tours.push(f); return () => {}; },
      });
      return { validation, analyse };
    };
    let pretes: () => void = () => {};
    const s = monter(() => new Promise<void>((ok) => { pretes = ok; }));
    s.analyse.reprendre();
    tours.shift()?.();
    await attendre();
    // Le batch est lu, mais les mesures ne sont pas faites : rien n'est recale, et rien de vide n'est note.
    expect(capture.lire().analyse?.resultats?.renfort).toBeUndefined();
    expect(capture.lire().analyse?.resultats?.renfortBrut?.['maison#0']).toHaveLength(3);
    expect(s.validation.propositions().some((p) => p.id === 'maison#0:claude:releve')).toBe(false);
    // Les mesures arrivent : la proposition du releve renforce apparait.
    s.validation.poserMesures([e.mesures.get('maison#0')!]);
    pretes();
    await attendre();
    expect(s.validation.propositions().find((p) => p.id === 'maison#0:claude:releve')).toMatchObject({ source: 'claude', apres: '2 ouvertures avec l’aide de Claude (1 ouverture ajoutée)' });

    // Un brouillon d'avant la correction : renfort vide note, sans reponses brutes. La reprise relit le
    // batch au serveur, une fois, et recale quand les mesures sont la.
    const r = capture.lire().analyse!.resultats!;
    capture.noterAnalyse({ resultats: { t: r.t, modele: r.modele, schema: r.schema, prompt: r.prompt, parBatiment: r.parBatiment, renfort: {} } });
    const avant = lectures;
    const t = monter(async () => {});
    t.validation.poserMesures([e.mesures.get('maison#0')!]);
    t.analyse.reprendre();
    await attendre();
    expect(lectures).toBe(avant + 1);
    expect(t.validation.propositions().some((p) => p.id === 'maison#0:claude:releve')).toBe(true);
  });

  it('envoie le renfort dans le batch de l analyse et garde son resultat a la lecture', async () => {
    const e = entrees();
    const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
    capture.ajouterPhotoFacade('maison', 0, PHOTO);
    capture.terminer();
    const demandes: DemandeAnalyse[] = [];
    let fini = false;
    const client: ClientAnalyse = {
      etat: async () => ({ actif: true, prompt: 1, schema: 1, organisation: null, admin: true }),
      creerBatch: async (d) => { demandes.push(d); return { batch: { id: 'msgbatch_1', etat: 'in_progress', compte: null }, modele: 'claude-haiku-5-5', prompt: 1, schema: 1 }; },
      etatBatch: async (id) => ({ id, etat: fini ? 'ended' : 'in_progress', compte: null }),
      resultats: async (id) => ({ batch: { id, etat: 'ended', compte: null }, modele: 'claude-haiku-5-5', prompt: 1, schema: 1, resultats: (demandes[0]?.requetes ?? []).map((q) => ({ id: q.id, statut: 'reussi' as const, passe: q.passe, usage: q.usage ?? 'analyse', sortie: q.usage === 'renfort' ? passe([MANQUEE]) : {}, erreur: null })) }),
      immediat: async () => { throw new Error('non'); },
    };
    const images: FabriqueImages = { photo: async (p) => ({ base64: p.base64, mediaType: 'image/jpeg' }), rendu: () => null, ortho: async () => null, carte: () => null, renfort: FAB };
    const recus: Record<string, ReponseRenfort[]>[] = [];
    const planifies: (() => void)[] = [];
    const a = creerAnalyseClaude({
      capture, entrees: () => ({ ...e, capture: capture.lire() }), mesuresPretes: async () => {}, client, images,
      identite: () => ({ projet: null, idu: '78650000AE0101', adresse: null, audit: 'a-1' }), signaler: () => {}, maintenant: () => new Date('2026-10-13T10:00:00Z'),
      renforcer: async (par) => { recus.push(par); return { 'maison#0': { passes: 3, ouvertures: [], decochees: [], bilan: { pleines: 1 }, resume: '1 ouverture ajoutée' } }; },
      planifier: (f) => { planifies.push(f); return () => {}; },
    });
    await a.accorder(true);
    const ids = demandes[0]!.requetes.map((q) => q.id);
    expect(ids).toEqual(['b0-p1', 'b0-p2', 'b0-p3', 'b0-f0-p1', 'b0-f0-p2', 'b0-f0-p3']);
    expect(capture.lire().analyse?.batch?.requetes['b0-f0-p1']).toEqual({ cle: 'maison', passe: 1, cote: 0, usage: 'renfort' });
    fini = true;
    for (let k = 0; k < 3 && planifies.length; k++) { planifies.shift()?.(); await new Promise((ok) => setTimeout(ok, 0)); await new Promise((ok) => setTimeout(ok, 0)); }
    expect(recus[0]?.['maison#0']).toHaveLength(3);
    expect(a.renfort()).toMatchObject({ 'maison#0': { resume: '1 ouverture ajoutée' } });
  });
});
