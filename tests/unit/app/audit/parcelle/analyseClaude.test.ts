import { describe, it, expect, vi } from 'vitest';
import { creerAnalyseClaude, idAuditAnalyse, rangerResultats, type AnalyseClaude, type ContexteAnalyse } from '../../../../../src/app/audit/parcelle/analyseClaude.js';
import { creerValidation, type ProjetAudit } from '../../../../../src/app/audit/parcelle/validation.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { preparerDemande, textePrise, type FabriqueImages } from '../../../../../src/app/audit/parcelle/entreesAnalyse.js';
import { EchecAnalyse, type BrouillonServeur, type ClientAnalyse, type DemandeAnalyse, type ResultatBatch } from '../../../../../src/io/analyseClaude.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { signatureAnalyse } from '../../../../../src/model/auditParcelle.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { EtatApp } from '../../../../../src/core/state.js';
import type { CorpsToit, ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// L'analyse par Claude, cote client (MD/spec-audit.md §13.2) contre une API simulee : l'accord, les
// entrees preparees (trois passes identiques, images etiquetees, facades comptees), le suivi du batch,
// la lecture des resultats, la notification, les propositions ajoutees a la liste, le retrait.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const PHOTO = { type: 'image/jpeg' as const, base64: 'QUJDRA==', prise: { t: '2026-10-13T09:00:00Z', x: 10, y: 2, lat: null, lon: null, precisionM: 5, azimutDeg: 0, sourceAzimut: 'boussole' as const, champDeg: 66 } };

/** Une API simulee : les demandes recues, un batch qui finit quand on le dit, des resultats choisis. */
function fauxClient(reponses: (id: string) => unknown = () => reponse()) {
  const demandes: DemandeAnalyse[] = [];
  const etat = { fini: false, actif: true, refus: null as EchecAnalyse | null, admin: false, brouillon: null as BrouillonServeur | null };
  const client: ClientAnalyse = {
    etat: async () => ({ actif: etat.actif, prompt: 1, schema: 1, organisation: 'org-1', admin: etat.admin, brouillon: etat.brouillon }),
    creerBatch: async (d) => { if (etat.refus) throw etat.refus; demandes.push(d); return { batch: { id: 'msgbatch_' + demandes.length, etat: 'in_progress', compte: null }, modele: 'claude-haiku-5-5', prompt: 1, schema: 1 }; },
    etatBatch: async (id) => ({ id, etat: etat.fini ? 'ended' : 'in_progress', compte: null }),
    resultats: async (id) => {
      if (!etat.fini) throw new EchecAnalyse('pasPret', 'pas fini');
      const d = demandes[Number(id.slice('msgbatch_'.length)) - 1]!;
      const resultats: ResultatBatch[] = d.requetes.map((r) => ({ id: r.id, statut: 'reussi', passe: r.passe, sortie: reponses(r.id), erreur: null }));
      return { batch: { id, etat: 'ended', compte: null }, modele: 'claude-haiku-5-5', prompt: 1, schema: 1, resultats };
    },
    immediat: async () => { throw new EchecAnalyse('serveur', 'pas d appel immediat dans l audit'); },
  };
  return { client, demandes, etat };
}

const IMAGES: FabriqueImages = {
  photo: async (p) => ({ base64: p.base64, mediaType: 'image/jpeg' }),
  rendu: () => ({ base64: 'UkVORFU=', mediaType: 'image/jpeg' }),
  ortho: async () => ({ base64: 'T1JUSE8=', mediaType: 'image/jpeg' }),
  carte: (o) => (o.toitMesure ? { base64: 'Q0FSVEU=', mediaType: 'image/png' } : null),
};

function monter(reponses?: (id: string) => unknown, memoire?: ContexteAnalyse['memoire'], essai?: () => boolean) {
  const objets = normalizeObjects([
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS] }),
  ] as ObjetBrut[]) as ObjetPlan[];
  const etat = { objects: objets, measures: [], selectedKey: null, dirty: false } as unknown as EtatApp;
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  capture.ajouterPhotoFacade('maison', 0, PHOTO);
  capture.noterVu('maison', { murs: 'enduit' });
  const faux = fauxClient(reponses);
  const messages: string[] = [];
  const notifications: string[] = [];
  const planifies: (() => void)[] = [];
  const projet: ProjetAudit = { pushHistory: () => {}, render: vi.fn(), refaire3d: vi.fn(), remplacer3d: () => true };
  let analyse: AnalyseClaude;
  const validation = creerValidation({
    etat, capture, liste: () => listeDeControle(etat.objects, capture.lire()), projet, signaler: (m) => messages.push(m),
    maintenant: () => new Date('2026-10-13T09:00:00Z'),
    mesures: { pixels: async () => null, chercherCoins: async () => ({ distorsion: null, coins: null }), jpeg: () => '', limites: () => [] },
    analyse: { reponses: () => analyse.reponses(), version: () => analyse.version() },
  });
  analyse = creerAnalyseClaude({
    capture, entrees: () => validation.entrees(), mesuresPretes: () => validation.lancer(), client: faux.client, images: IMAGES,
    identite: () => ({ projet: 'p-1', idu: '78650000AE0101', adresse: '2 allée des Limites', audit: 'a-1' }),
    signaler: (m) => messages.push(m), notifier: (m) => notifications.push(m), maintenant: () => new Date('2026-10-13T10:00:00Z'),
    ...(memoire ? { memoire } : {}),
    ...(essai ? { essai } : {}),
    // Le suivi est planifie par le test : chaque tour se joue a la main.
    planifier: (f) => { planifies.push(f); return () => { const i = planifies.indexOf(f); if (i >= 0) planifies.splice(i, 1); }; },
  });
  const tour = async () => { const f = planifies.shift(); if (f) { f(); await new Promise((ok) => setTimeout(ok, 0)); await new Promise((ok) => setTimeout(ok, 0)); } };
  return { etat, capture, validation, analyse, faux, messages, notifications, planifies, tour };
}

describe('l analyse par Claude', () => {
  it('ne pose la question qu une fois la capture terminee, et rien ne part sans accord', async () => {
    const t = monter();
    expect(t.analyse.etat()).toBe('attente');
    t.capture.terminer();
    expect(t.analyse.etat()).toBe('sansAccord');
    await t.analyse.lancer();
    expect(t.faux.demandes).toHaveLength(0);
    t.analyse.refuser();
    expect(t.analyse.etat()).toBe('refusee');
    expect(t.capture.lire().analyse).toMatchObject({ accord: null, refus: '2026-10-13T10:00:00.000Z' });
    await t.analyse.lancer();
    expect(t.faux.demandes).toHaveLength(0);
    // Sans client (hors plateforme), la question ne se pose meme pas.
    const sans = creerAnalyseClaude({ capture: t.capture, entrees: () => t.validation.entrees(), mesuresPretes: async () => {}, client: null, images: IMAGES, identite: () => ({ projet: null, idu: null, adresse: null, audit: 'a' }), signaler: () => {}, maintenant: () => new Date() });
    expect(sans.etat()).toBe('indisponible');
  });

  it('avec l accord, prepare trois passes identiques, images etiquetees et facades comptees, puis envoie', async () => {
    const t = monter();
    t.capture.terminer();
    await t.analyse.accorder(true);
    expect(t.capture.lire().analyse?.accord).toEqual({ t: '2026-10-13T10:00:00.000Z', partage: true });
    expect(t.faux.demandes).toHaveLength(1);
    const d = t.faux.demandes[0]!;
    expect(d).toMatchObject({ projet: 'p-1', idu: '78650000AE0101', adresse: '2 allée des Limites', audit: 'a-1', usage: 'analyse' });
    expect(d.requetes.map((r) => [r.id, r.passe, r.facades])).toEqual([['b0-p1', 1, 1], ['b0-p2', 2, 1], ['b0-p3', 3, 1]]);
    expect(d.requetes[1]!.contenu).toEqual(d.requetes[0]!.contenu);
    const blocs = d.requetes[0]!.contenu;
    // Photo de la facade, son rendu, l'orthophoto (pas de carte sans mesure LiDAR), puis le texte.
    expect(blocs.filter((b) => b.type === 'image')).toHaveLength(3);
    const textes = blocs.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map((b) => b.text);
    expect(textes[0]).toBe('Image 1 : photo de la façade sud de maison, prise à 8 m, vers 0°.');
    expect(textes[1]).toBe('Image 2 : rendu du modèle actuel de Plan, façade vue de face (perpendiculairement au mur, sans obstacle), du pied du mur au haut du toit, côté de l’image 1.');
    expect(textes[2]).toMatch(/^Image 3 : orthophoto/);
    expect(textes[3]).toMatch(/Façades à décrire \(étiquettes\) : sud\./);
    expect(textes[3]).toMatch(/Indices LiDAR chiffrés : aucune mesure LiDAR/);
    expect(textes[3]).toMatch(/"hauteurEgoutM":6/);
    expect(textes[3]).toMatch(/Ce que la personne a vu sur place : .*enduit/i);
    const b = t.capture.lire().analyse?.batch;
    expect(b).toMatchObject({ id: 'msgbatch_1', signature: signatureAnalyse(t.capture.lire()), requetes: { 'b0-p1': { cle: 'maison', passe: 1 } } });
    expect(b?.etiquettes.maison?.[0]).toEqual({ texte: 'photo de la façade sud de maison, prise à 8 m, vers 0°', photo: { cle: 'maison', cote: 0, rang: 0 } });
    expect(t.messages.at(-1)).toMatch(/^Vos photos sont parties à l’analyse par Claude \(accord du 13 octobre\)/);
    expect(t.analyse.etat()).toBe('enCours');
  });

  describe('l essai du brouillon des regles (?regles=local)', () => {
    const BROUILLON: BrouillonServeur = { enregistreLe: '2026-10-16T10:00:00Z', prompt: 6, schema: 1 };

    it('nomme le brouillon dans la demande quand l administrateur en a un sur le serveur, et le dit', async () => {
      const t = monter(undefined, undefined, () => true);
      t.faux.etat.admin = true;
      t.faux.etat.brouillon = BROUILLON;
      t.capture.terminer();
      await t.analyse.accorder(true);
      expect(t.faux.demandes[0]).toMatchObject({ usage: 'analyse', essai: 'brouillon' });
      expect(t.messages.some((m) => /^Essai : l’analyse part avec le prompt du brouillon des règles \(version 6, enregistré le 2026-10-16 10:00\)/.test(m))).toBe(true);
    });

    it('part avec le prompt livre, en le disant, sans brouillon sur le serveur ou hors administrateur', async () => {
      const sansBrouillon = monter(undefined, undefined, () => true);
      sansBrouillon.faux.etat.admin = true;
      sansBrouillon.capture.terminer();
      await sansBrouillon.analyse.accorder(true);
      expect(sansBrouillon.faux.demandes[0]).not.toHaveProperty('essai');
      expect(sansBrouillon.messages.some((m) => /le serveur n’a pas de brouillon/.test(m))).toBe(true);

      const pasAdmin = monter(undefined, undefined, () => true);
      pasAdmin.faux.etat.brouillon = BROUILLON;
      pasAdmin.capture.terminer();
      await pasAdmin.analyse.accorder(true);
      expect(pasAdmin.faux.demandes[0]).not.toHaveProperty('essai');
    });

    it('ne change rien quand l essai n est pas demande, brouillon ou non', async () => {
      const t = monter(undefined, undefined, () => false);
      t.faux.etat.admin = true;
      t.faux.etat.brouillon = BROUILLON;
      t.capture.terminer();
      await t.analyse.accorder(true);
      expect(t.faux.demandes[0]).not.toHaveProperty('essai');
      expect(t.messages.some((m) => /Essai/.test(m))).toBe(false);
    });
  });

  it('suit le batch, lit les resultats, previent, et ajoute les propositions de Claude a la liste', async () => {
    const t = monter();
    t.capture.terminer();
    await t.analyse.accorder(false);
    await t.validation.lancer();
    expect(t.validation.propositions().map((p) => p.id)).toEqual(['maison:materiauMurs']);
    await t.tour();
    expect(t.analyse.etat()).toBe('enCours');
    expect(t.planifies).toHaveLength(1);
    t.faux.etat.fini = true;
    await t.tour();
    expect(t.analyse.etat()).toBe('prete');
    expect(t.planifies).toHaveLength(0);
    expect(t.capture.lire().analyse?.resultats).toMatchObject({ modele: 'claude-haiku-5-5', schema: 1, parBatiment: { maison: [reponse(), reponse(), reponse()] } });
    expect(t.messages.at(-1)).toBe('Les propositions de Claude sont prêtes : 1 bâtiment analysé.');
    expect(t.notifications).toEqual(['Les propositions de Claude sont prêtes : 1 bâtiment analysé.']);
    const ids = t.validation.propositions().map((p) => p.id);
    expect(ids).toEqual(['maison:materiauMurs', 'maison:claude:couverture', 'maison:claude:cheminees', 'maison:claude:materiauMurs']);
    expect(t.validation.propositions().find((p) => p.id === 'maison:claude:couverture')).toMatchObject({ source: 'claude', confiance: 1, indices: [{ texte: 'ardoises fines et sombres (orthophoto)' }] });
    // Decochees : aucun taux d'accord mesure.
    expect(t.validation.cochee('maison:claude:couverture')).toBe(false);
  });

  it('retire l accord : plus de propositions de Claude, et la question est reposee par « Demander »', async () => {
    const t = monter();
    t.capture.terminer();
    await t.analyse.accorder(true);
    t.faux.etat.fini = true;
    await t.tour();
    expect(t.validation.propositions().some((p) => p.source === 'claude')).toBe(true);
    t.analyse.retirerAccord();
    expect(t.analyse.etat()).toBe('refusee');
    expect(t.analyse.reponses()).toBe(null);
    expect(t.validation.propositions().some((p) => p.source === 'claude')).toBe(false);
    expect(t.messages.at(-1)).toMatch(/^Accord retiré/);
  });

  it('garde l accord pour le projet : un second audit part sans reposer la question, et le retrait vaut pour les suivants', async () => {
    let garde: ReturnType<NonNullable<ContexteAnalyse['memoire']>['lire']> = null;
    const memoire = { lire: () => garde, ecrire: (a: typeof garde) => { garde = a; } };
    const premier = monter(undefined, memoire);
    premier.capture.terminer();
    await premier.analyse.accorder(false);
    expect(garde).toEqual({ t: '2026-10-13T10:00:00.000Z', partage: false });
    // Un nouvel audit du meme projet : la capture n'a rien, l'accord du projet est repris et rappele.
    const second = monter(undefined, memoire);
    second.capture.terminer();
    expect(second.analyse.etat()).toBe('sansAccord');
    await second.analyse.lancer();
    expect(second.faux.demandes).toHaveLength(1);
    expect(second.capture.lire().analyse?.accord).toEqual({ t: '2026-10-13T10:00:00.000Z', partage: false });
    expect(second.messages.at(-1)).toMatch(/\(accord du 13 octobre\)/);
    second.analyse.retirerAccord();
    expect(garde).toBe(null);
    const troisieme = monter(undefined, memoire);
    troisieme.capture.terminer();
    await troisieme.analyse.lancer();
    expect(troisieme.faux.demandes).toHaveLength(0);
    expect(troisieme.analyse.etat()).toBe('sansAccord');
    // Un audit qui a dit « Seulement les mesures » ne reprend pas l'accord du projet.
    garde = { t: '2026-10-13T10:00:00.000Z', partage: true };
    troisieme.analyse.refuser();
    await troisieme.analyse.lancer();
    expect(troisieme.faux.demandes).toHaveLength(0);
  });

  it('nomme l audit du journal par la capture et l heure de son debut', () => {
    expect(idAuditAnalyse({ id: 'parcelle-78650000AE0101', debut: '2026-10-13T09:05:00.000Z' })).toBe('parcelle-78650000AE0101-202610130905');
    expect(idAuditAnalyse({ id: 'x'.repeat(80), debut: '2026-10-13T09:05:00.000Z' })).toHaveLength(64);
  });

  it('demande a relancer quand les photos changent, et ne renvoie pas les memes', async () => {
    const t = monter();
    t.capture.terminer();
    await t.analyse.accorder(true);
    await t.analyse.lancer();
    expect(t.faux.demandes).toHaveLength(1);
    t.capture.ajouterPhotoFacade('maison', 0, { ...PHOTO, base64: 'QUJDREVG' });
    expect(t.analyse.etat()).toBe('aRelancer');
    await t.analyse.lancer();
    expect(t.faux.demandes).toHaveLength(2);
    expect(t.faux.demandes[1]!.requetes[0]!.contenu.filter((b) => b.type === 'image')).toHaveLength(5);
  });

  it('dit pourquoi l envoi a echoue, et laisse les mesures seules', async () => {
    const t = monter();
    t.capture.terminer();
    t.faux.etat.refus = new EchecAnalyse('plafond', 'Plafond atteint');
    await t.analyse.accorder(true);
    expect(t.analyse.etat()).toBe('erreur');
    expect(t.analyse.detail()).toMatch(/^Le plafond de l’analyse est atteint/);
    expect(t.capture.lire().analyse?.batch ?? null).toBe(null);
    t.faux.etat.refus = null;
    await t.analyse.lancer();
    expect(t.analyse.etat()).toBe('enCours');
  });

  it('reprend le suivi d un brouillon relu, et range les resultats par batiment dans l ordre des passes', async () => {
    const t = monter();
    t.capture.terminer();
    await t.analyse.accorder(true);
    t.analyse.arreter();
    expect(t.planifies).toHaveLength(0);
    t.analyse.reprendre();
    expect(t.planifies).toHaveLength(1);
    const ranges = rangerResultats([
      { id: 'b0-p3', statut: 'reussi', passe: 3, sortie: reponse({ confiance: 'faible' }), erreur: null },
      { id: 'b0-p1', statut: 'reussi', passe: 1, sortie: reponse(), erreur: null },
      { id: 'b0-p2', statut: 'echoue', passe: 2, sortie: null, erreur: { type: 'overloaded_error', message: 'surcharge' } },
      { id: 'b1-p1', statut: 'reussi', passe: 1, sortie: { pas: 'une réponse' }, erreur: null },
    ], { 'b0-p1': { cle: 'maison', passe: 1 }, 'b0-p2': { cle: 'maison', passe: 2 }, 'b0-p3': { cle: 'maison', passe: 3 }, 'b1-p1': { cle: 'garage', passe: 1 } });
    expect(Object.keys(ranges)).toEqual(['maison']);
    expect((ranges.maison as { confiance: string }[]).map((r) => r.confiance)).toEqual(['forte', 'faible']);
  });

  it('prepare la carte LiDAR quand le batiment a une mesure, et rien sans photo', async () => {
    const t = monter();
    const m = t.etat.objects.find((o) => o.key === 'maison') as ObjetPlan;
    m.toitMesure = { pas: 1, x0: 5, y0: 18, nx: 10, ny: 8, z: new Array(80).fill(7), egout: 6, faite: 9, source: 'lidar' };
    const prepare = await preparerDemande(t.validation.entrees(), IMAGES, { projet: null, idu: null, adresse: null, audit: 'a' });
    const textes = prepare!.demande.requetes[0]!.contenu.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map((b) => b.text);
    expect(textes[3]).toMatch(/^Image 4 : carte des hauteurs LiDAR/);
    expect(textes[4]).toMatch(/Indices LiDAR chiffrés : \{"egoutM":6,"faiteM":9/);
    t.capture.retirerPhotoFacade('maison', 0, 0);
    expect(await preparerDemande(t.validation.entrees(), IMAGES, { projet: null, idu: null, adresse: null, audit: 'a' })).toBe(null);
    expect(textePrise(undefined, null)).toBe('');
    expect(textePrise({ ...PHOTO.prise, inclinaisonDeg: 12 }, 7.6)).toBe(', prise à 8 m, vers 0°, inclinée de 12°');
  });
});
