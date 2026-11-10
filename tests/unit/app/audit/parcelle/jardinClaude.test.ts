import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerAnalyseClaude, type AnalyseClaude } from '../../../../../src/app/audit/parcelle/analyseClaude.js';
import { creerValidation, type ProjetAudit } from '../../../../../src/app/audit/parcelle/validation.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { runJardinDesResultats, type FabriqueImagesJardin } from '../../../../../src/app/audit/parcelle/jardinClaude.js';
import { propositionsDuJardin, RESERVE_JARDIN } from '../../../../../src/app/regles/jardin.js';
import { cocheeParDefaut, projetApres } from '../../../../../src/regles/decisions.js';
import { lireRunJardin } from '../../../../../src/regles/jardin/observations.js';
import { poserEspeces } from '../../../../../src/model/especesArbre.js';
import { EchecAnalyse, type ClientAnalyse, type DemandeAnalyse, type ResultatBatch } from '../../../../../src/io/analyseClaude.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import { BIBLIOTHEQUE_LIVREE } from '../../../../fixtures/bibliotheque-livree.js';
import type { FabriqueImages } from '../../../../../src/app/audit/parcelle/entreesAnalyse.js';
import type { EtatApp } from '../../../../../src/core/state.js';
import type { ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La lecture du jardin dans l'audit (lot L3), de bout en bout contre une API simulee qui rend la reponse SYNTHETIQUE de l'orthophoto
// de synthese (tests/fixtures/jardin-ia/) : la requete part dans le batch de l'analyse, la reponse est enregistree avec l'image exacte,
// le moteur en fait des propositions decochees, et seule une ligne cochee puis validee ajoute un objet au plan, une fois.

const ID_REQUETE_JARDIN = 'jardin-p1';
const SORTIE_JARDIN = (JSON.parse(readFileSync(new URL('../../../../fixtures/jardin-ia/reponse-synthetique.json', import.meta.url), 'utf8')) as { sortie: unknown }).sortie;
const IMAGE_JARDIN = readFileSync(new URL('../../../../fixtures/jardin-ia/jardin-test.jpg', import.meta.url)).toString('base64');
const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const PHOTO = { type: 'image/jpeg' as const, base64: 'QUJDRA==', prise: { t: '2026-10-13T09:00:00Z', x: 15, y: 10, lat: null, lon: null, precisionM: 5, azimutDeg: 0, sourceAzimut: 'boussole' as const, champDeg: 66 } };

function fauxClient() {
  const demandes: DemandeAnalyse[] = [];
  const client: ClientAnalyse = {
    etat: async () => ({ actif: true, prompt: 1, schema: 1, organisation: 'org-1', admin: false }),
    creerBatch: async (d) => { demandes.push(d); return { batch: { id: 'msgbatch_' + demandes.length, etat: 'in_progress', compte: null }, modele: 'claude-haiku-5-5', prompt: 9, schema: 5 }; },
    etatBatch: async (id) => ({ id, etat: 'ended', compte: null }),
    resultats: async (id) => {
      const d = demandes[Number(id.slice('msgbatch_'.length)) - 1]!;
      const resultats: ResultatBatch[] = d.requetes.map((r) => (r.usage === 'jardin'
        ? { id: r.id, statut: 'reussi', passe: 1, usage: 'jardin', sortie: SORTIE_JARDIN, erreur: null, modele: 'claude-haiku-5-5', prompt: 1, schema: 1, tokens: { entree: 1500, ecritureCache: 0, lectureCache: 0, sortie: 900 }, cout: 0.0012 }
        : { id: r.id, statut: 'reussi', passe: r.passe, sortie: reponse(), erreur: null }));
      return { batch: { id, etat: 'ended', compte: null }, modele: 'claude-haiku-5-5', prompt: 9, schema: 5, resultats };
    },
    immediat: async () => { throw new EchecAnalyse('serveur', 'non'); },
  };
  return { client, demandes };
}

const IMAGES: FabriqueImages = {
  photo: async (p) => ({ base64: p.base64, mediaType: 'image/jpeg' }), rendu: () => null, ortho: async () => null, carte: () => null,
};
const JARDIN: FabriqueImagesJardin = {
  ortho: async () => ({ image: { base64: IMAGE_JARDIN, mediaType: 'image/jpeg', largeur: 512, hauteur: 512 }, cadrage: { xMin: 0, yMin: 0, coteM: 30 } }),
  photo: async (p) => ({ base64: p.base64, mediaType: 'image/jpeg' }),
};

afterEach(() => { poserEspeces([]); });

function monter(avecPhotoMaison = true) {
  poserEspeces(BIBLIOTHEQUE_LIVREE);
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: rect(1.8, 1.8, 28.2, 28.2), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } },
    { key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: rect(9.9, 18, 20.1, 26.4), elevation: 6 },
  ] as ObjetBrut[]) as ObjetPlan[];
  const etat = { objects: objets, measures: [], selectedKey: null, dirty: false } as unknown as EtatApp;
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  if (avecPhotoMaison) capture.ajouterPhotoFacade('maison', 0, PHOTO);
  const faux = fauxClient();
  const historique = vi.fn();
  const projet: ProjetAudit = { pushHistory: historique, render: vi.fn(), refaire3d: vi.fn(), remplacer3d: () => true };
  let analyse: AnalyseClaude;
  const validation = creerValidation({
    etat, capture, liste: () => listeDeControle(etat.objects, capture.lire()), projet, signaler: () => {}, maintenant: () => new Date('2026-10-13T09:00:00Z'),
    mesures: { pixels: async () => null, chercherCoins: async () => ({ distorsion: null, coins: null }), jpeg: () => '', limites: () => [] },
    analyse: { reponses: () => analyse.reponses(), version: () => analyse.version(), jardin: () => analyse.jardin() },
  });
  const planifies: (() => void)[] = [];
  analyse = creerAnalyseClaude({
    capture, entrees: () => validation.entrees(), mesuresPretes: async () => {}, client: faux.client, images: IMAGES, jardin: JARDIN,
    identite: () => ({ projet: 'p-1', idu: '78650000AE0101', adresse: null, audit: 'a-1' }), signaler: () => {}, maintenant: () => new Date('2026-10-13T10:00:00Z'),
    planifier: (f) => { planifies.push(f); return () => {}; },
  });
  const tour = async () => { const f = planifies.shift(); if (f) { f(); for (let i = 0; i < 4; i++) await new Promise((ok) => setTimeout(ok, 0)); } };
  return { etat, capture, validation, analyse, faux, tour, historique };
}

describe('la lecture du jardin dans l audit', () => {
  it('part dans le batch de l analyse : une requete, l orthophoto puis le texte, et ce qui est deja dans le plan', async () => {
    const t = monter();
    t.capture.terminer();
    await t.analyse.accorder(true);
    const d = t.faux.demandes[0]!;
    const j = d.requetes.find((r) => r.id === ID_REQUETE_JARDIN)!;
    expect(j).toMatchObject({ usage: 'jardin', passe: 1, facades: 0 });
    expect(j.contenu[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE_JARDIN } });
    expect(j.contenu[1]).toMatchObject({ type: 'text', text: expect.stringMatching(/couvre 30 m de côté[\s\S]*Aucune photo[\s\S]*ne contient encore rien/) });
    expect(t.capture.lire().analyse?.batch?.jardin).toMatchObject({ cadrage: { xMin: 0, yMin: 0, coteM: 30 }, photos: 0 });
  });

  it('part aussi sans photo d une maison : le jardin seul', async () => {
    const t = monter(false);
    t.capture.terminer();
    await t.analyse.accorder(true);
    expect(t.faux.demandes[0]!.requetes.map((r) => r.id)).toEqual([ID_REQUETE_JARDIN]);
  });

  it('enregistre la reponse avec l image exacte, et propose des lignes decochees ; seule une ligne cochee entre dans le plan, une fois', async () => {
    const t = monter();
    t.capture.terminer();
    await t.analyse.accorder(true);
    await t.tour();
    const run = t.analyse.jardin()!;
    expect(lireRunJardin(JSON.parse(JSON.stringify(run)))).toEqual(run);
    expect(run).toMatchObject({ modele: 'claude-haiku-5-5', prompt: 1, schema: 1, cout: 0.0012, tokens: { entree: 1500, sortie: 900 }, image: { base64: IMAGE_JARDIN, largeur: 512 }, cadrage: { coteM: 30 } });
    expect(run.reglages).toMatch(/^[0-9a-f]{8}$/);
    const duJardin = t.validation.propositions().filter((p) => p.id.startsWith('jardin:'));
    expect(duJardin).toHaveLength(10);
    expect(duJardin.every((p) => !cocheeParDefaut(p) && !t.validation.cochee(p.id) && p.reserve?.startsWith(RESERVE_JARDIN))).toBe(true);
    // L'apercu « Après » montre l'objet neuf sans toucher au plan.
    const pb = duJardin.find((p) => p.objet === 'Plate-bande')!;
    const apercu = projetApres(t.etat.objects, [pb], '2026-10-13');
    expect(apercu.objets).toHaveLength(3);
    expect(t.etat.objects).toHaveLength(2);
    // Cochee, validee : la plate-bande entre dans le plan, en un pas d'historique ; rien d'autre.
    t.validation.basculer(pb.id);
    expect(t.validation.valider()).toMatchObject({ ecrites: 1 });
    expect(t.historique).toHaveBeenCalledTimes(1);
    expect(t.etat.objects).toHaveLength(3);
    expect(t.etat.objects[2]).toMatchObject({ fonction: 'massif', plantation: { type: 'fleurs', forme: 'plate-bande', source: 'ia' } });
    // Elle ne se propose plus : elle est dans le plan.
    expect(t.validation.propositions().some((p) => p.objet === 'Plate-bande')).toBe(false);
    // Une seconde lecture dit a Claude ce que le plan porte deja.
    t.capture.ajouterPhotoFacade('maison', 0, { ...PHOTO, base64: 'QUJDREVG' });
    await t.analyse.lancer();
    const texte = t.faux.demandes[1]!.requetes.find((r) => r.id === ID_REQUETE_JARDIN)!.contenu.find((b) => b.type === 'text');
    expect(texte).toMatchObject({ text: expect.stringContaining('Le plan contient déjà dans le jardin : 1 massif.') });
  });

  it('ne redit pas un cote de cloture qu une autre ligne regle deja', () => {
    const run = { le: '', modele: 'm', prompt: 1, schema: 1, sortie: SORTIE_JARDIN, cout: null, tokens: { entree: 0, sortie: 0 }, image: { base64: '', mediaType: 'image/jpeg' as const, largeur: 1, hauteur: 1 }, cadrage: { xMin: 0, yMin: 0, coteM: 30 }, photos: 0, texte: '' };
    const objets = [{ key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(1.8, 1.8, 28.2, 28.2) } as unknown as ObjetPlan];
    const rue = { id: 'parcelle:portail', cible: { type: 'parcelle' as const }, objet: 'Portail', avant: '', apres: '', source: 'mesure' as const, indices: [], confiance: 1, remplaceChoix: null, reserve: null, effet: { type: 'portail' as const, cote: 0, nature: 'portillon' as const } };
    expect(propositionsDuJardin(run, objets, BIBLIOTHEQUE_LIVREE, [rue]).propositions.some((p) => p.effet.type === 'portail')).toBe(false);
    expect(propositionsDuJardin(run, objets, BIBLIOTHEQUE_LIVREE).propositions.some((p) => p.effet.type === 'portail')).toBe(true);
  });

  it('garde l image par l empreinte que le serveur en garde avec la trace (lot L0), ses octets seulement a defaut', () => {
    const envoi = { image: { base64: IMAGE_JARDIN, mediaType: 'image/jpeg' as const, largeur: 512, hauteur: 512 }, cadrage: { xMin: 0, yMin: 0, coteM: 30 }, photos: 0, texte: 't' };
    const r = { id: ID_REQUETE_JARDIN, statut: 'reussi' as const, passe: 1, sortie: SORTIE_JARDIN, erreur: null };
    const sha = 'a'.repeat(64);
    const avec = runJardinDesResultats({ modele: 'm', prompt: 1, schema: 1, resultats: [{ ...r, empreintes: [{ sha256: sha, octets: 20208, type: 'image/jpeg' }] }] }, envoi, new Date('2026-10-30T08:00:00Z'))!;
    expect(avec.image).toEqual({ mediaType: 'image/jpeg', largeur: 512, hauteur: 512, sha256: sha, octets: 20208 });
    const sans = runJardinDesResultats({ modele: 'm', prompt: 1, schema: 1, resultats: [r] }, envoi, new Date('2026-10-30T08:00:00Z'))!;
    expect(sans.image.base64).toBe(IMAGE_JARDIN);
    expect(lireRunJardin(JSON.parse(JSON.stringify(avec)))).toEqual(avec);
  });
});
