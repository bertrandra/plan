// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AuditsParcelle } from '../../../src/zones/parcours/AuditsParcelle.js';
import { creerCatalogue, type DependancesCatalogue } from '../../../src/app/audit/parcelle/catalogue.js';
import { EchecPartageAudit, type ClientAudits, type FicheAudit } from '../../../src/io/auditsServeur.js';
import type { ClientAnalysesAudits, ResumeAnalyse } from '../../../src/io/analysesAudits.js';
import type { BrouillonServeur, ClientAnalyse, DemandeAnalyse } from '../../../src/io/analyseClaude.js';
import type { AnalyseComplete, ResultatSortant } from '../../../src/io/analysesAudits.js';
import { reponse } from '../../fixtures/audit/reponseClaude.js';

// Admin › « Audits de parcelle » (Z8, MD/spec-audit.md §15) : la liste des audits recus, et pour
// chacun « Ouvrir dans ce projet » (meme parcelle), « Télécharger » et « Retirer » (confirme sur la carte).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDU = '78650000AE0101';
const fiche = (plus: Partial<FicheAudit>): FicheAudit => ({
  id: '20261013-154200-0000abcd', recuLe: '2026-10-13T15:42:00Z', organisation: 'org-test', nature: 'parcelle', idu: IDU, commune: null, dossier: null,
  propositions: null, cas: null, statuts: null, adresse: '2 allée des Limites',
  taille: 3 * 1024 * 1024, marque: 'sauvegarde', photos: 12, phase: 'capture', debut: '2026-10-13T15:00:00.000Z', ...plus,
});
const AUDITS = [
  fiche({}),
  fiche({ id: '20261012-100000-0000beef', recuLe: '2026-10-12T10:00:00Z', marque: 'corpus', phase: 'analyse', photos: 30, organisation: 'admin' }),
  fiche({ id: '20261011-100000-0000cafe', recuLe: '2026-10-11T10:00:00Z', idu: '35238000AB0001', adresse: null, photos: null, phase: null, taille: null }),
];

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

function monter(plus: Partial<DependancesCatalogue> = {}, client: Partial<ClientAudits> = {}) {
  const c: ClientAudits = {
    envoyer: vi.fn(), remplacer: vi.fn(), retirer: vi.fn(async () => {}), lister: vi.fn(async () => AUDITS.map((a) => ({ ...a }))),
    lire: vi.fn(async (id: string) => '{"format":"plan-audit-parcelle","id":"' + id + '"}'), ...client,
  };
  const d = { client: () => c, iduProjet: () => IDU, refusEcriture: () => null, ouvrir: vi.fn(), telecharger: vi.fn(), signaler: vi.fn(), ...plus };
  const catalogue = creerCatalogue(d);
  const fermer = vi.fn();
  act(() => racine.render(createElement(AuditsParcelle, { catalogue, fermer })));
  return { c, d, catalogue, fermer };
}
const attendre = async () => { await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); }); };
const cartes = () => [...hote.querySelectorAll('.carteAuditRecu')];
const bouton = (carte: Element | undefined, controle: string) => carte?.querySelector<HTMLButtonElement>('[data-controle="' + controle + '"]') ?? null;
const cliquer = async (b: HTMLElement | null) => { expect(b).not.toBeNull(); await act(async () => { b?.click(); }); await attendre(); };

describe('le catalogue des audits de parcelle', () => {
  it('liste les audits recus : date, parcelle, adresse, photos, phase, sauvegarde ou corpus', async () => {
    const t = monter();
    await act(async () => { await t.catalogue.relire(); });
    expect(hote.querySelector('.titreParcours')?.textContent).toBe('Audits');
    expect(hote.textContent).toContain('3 audits reçus : 2 sauvegardes, 1 partagé pour améliorer Plan.');
    expect(cartes()).toHaveLength(3);
    const [premiere, deuxieme, troisieme] = cartes();
    expect(premiere?.querySelector('.dateAuditRecu')?.textContent).toMatch(/^13 octobre 2026 à \d\d:\d\d$/);
    expect([...(premiere?.querySelectorAll('.pastilleAudit') ?? [])].map((p) => p.textContent)).toEqual(['Sauvegarde', 'Capture en cours']);
    expect(premiere?.querySelector('.parcelleAuditRecu')?.textContent).toBe('Parcelle ' + IDU);
    expect(premiere?.textContent).toContain('2 allée des Limites · 12 photos · 3 Mo · organisation org-test');
    expect([...(deuxieme?.querySelectorAll('.pastilleAudit') ?? [])].map((p) => p.textContent)).toEqual(['Partagé pour améliorer Plan', 'Capture terminée']);
    expect(deuxieme?.textContent).toContain('30 photos · 3 Mo · administrateur');
    // Une autre parcelle : « Ouvrir » est grise, et la raison s'ecrit sous les boutons.
    expect(bouton(premiere, 'auditsParcelle.ouvrir')?.disabled).toBe(false);
    expect(bouton(troisieme, 'auditsParcelle.ouvrir')?.disabled).toBe(true);
    expect(troisieme?.querySelector('.raisonAuditRecu')?.textContent).toBe('Ce projet est sur la parcelle ' + IDU + ' : ouvrez le projet de la parcelle 35238000AB0001.');
  });

  it('dit l absence d audit et l erreur du serveur', async () => {
    const vide = monter({}, { lister: vi.fn(async () => []) });
    await act(async () => { await vide.catalogue.relire(); });
    expect(hote.textContent).toContain('Aucun audit reçu sur le serveur de Plan.');
    act(() => racine.unmount());
    racine = createRoot(hote);
    const ko = monter({}, { lister: vi.fn(async () => { throw new EchecPartageAudit('liste des audits reçus : Mot de passe requis.', 401); }) });
    await act(async () => { await ko.catalogue.relire(); });
    expect(hote.querySelector('[role="alert"]')?.textContent).toBe('liste des audits reçus : Mot de passe requis.');
  });

  it('ouvre un audit de la parcelle du projet par le chemin de l import', async () => {
    const t = monter();
    await act(async () => { await t.catalogue.relire(); });
    await cliquer(bouton(cartes()[0], 'auditsParcelle.ouvrir'));
    expect(t.c.lire).toHaveBeenCalledWith('20261013-154200-0000abcd');
    expect(t.d.ouvrir).toHaveBeenCalledWith('{"format":"plan-audit-parcelle","id":"20261013-154200-0000abcd"}', expect.objectContaining({ id: '20261013-154200-0000abcd', marque: 'sauvegarde' }));
  });

  it('n ouvre rien en lecture seule ni sans parcelle, et le dit', async () => {
    const t = monter({ refusEcriture: () => 'Un administrateur de votre organisation peut vous donner ce droit.' });
    await act(async () => { await t.catalogue.relire(); });
    expect(bouton(cartes()[0], 'auditsParcelle.ouvrir')?.disabled).toBe(true);
    expect(cartes()[0]?.querySelector('.raisonAuditRecu')?.textContent).toBe('Un administrateur de votre organisation peut vous donner ce droit.');
    const sans = creerCatalogue({ ...t.d, refusEcriture: () => null, iduProjet: () => null });
    expect(sans.raisonOuvrir(fiche({}))).toBe('Ce projet n’a pas de parcelle cadastrale : importez d’abord la parcelle depuis son adresse.');
  });

  it('montre l avant et l apres d un audit sur la Vue 3D du projet, sans rien ecrire (meme parcelle)', async () => {
    const consulter = vi.fn();
    const t = monter({ consulter });
    await act(async () => { await t.catalogue.relire(); });
    await cliquer(bouton(cartes()[0], 'auditsParcelle.avantApres'));
    expect(t.c.lire).toHaveBeenCalledWith('20261013-154200-0000abcd');
    expect(consulter).toHaveBeenCalledWith('{"format":"plan-audit-parcelle","id":"20261013-154200-0000abcd"}', expect.objectContaining({ id: '20261013-154200-0000abcd' }));
    expect(t.d.ouvrir).not.toHaveBeenCalled();
  });

  it('ne le propose pas sans parcelle, sur une autre parcelle, sans proposition, ni pour une promenade', async () => {
    const consulter = vi.fn();
    const t = monter({ consulter });
    await act(async () => { await t.catalogue.relire(); });
    // Une autre parcelle : bouton grise, la raison sous les boutons (celle d'« Ouvrir » vient d'abord).
    expect(bouton(cartes()[2], 'auditsParcelle.avantApres')?.disabled).toBe(true);
    expect(t.catalogue.raisonConsulter(AUDITS[2] as FicheAudit)).toBe('Ce projet est sur la parcelle ' + IDU + ' : ouvrez le projet de la parcelle 35238000AB0001 pour voir l’avant et l’après.');
    const sans = creerCatalogue({ ...t.d, consulter, iduProjet: () => null });
    expect(sans.raisonConsulter(fiche({}))).toBe('Ouvrez le projet de la parcelle ' + IDU + ' : l’avant et l’après se voient sur son modèle 3D.');
    expect(t.catalogue.raisonConsulter(fiche({ propositions: { total: 0, claude: 0, mesures: 0, validees: 0, refusees: 0, enAttente: 0 } }))).toBe('Cet audit n’a aucune proposition : rien à comparer.');
    expect(t.catalogue.raisonConsulter(fiche({ nature: 'promenade', idu: '', commune: 'Le Vésinet' }))).toBe('Une promenade des toits n’a pas d’avant ni d’après à comparer.');
    // La consultation n'est pas lue quand elle est refusee.
    await act(async () => { await t.catalogue.consulter(AUDITS[2] as FicheAudit); });
    expect(consulter).not.toHaveBeenCalled();
    expect(t.d.signaler).toHaveBeenCalledWith(expect.stringContaining('Ce projet est sur la parcelle'));
  });

  it('telecharge le fichier tel qu il est arrive, sous le nom du fichier de l audit', async () => {
    const t = monter();
    await act(async () => { await t.catalogue.relire(); });
    await cliquer(bouton(cartes()[1], 'auditsParcelle.telecharger'));
    expect(t.d.telecharger).toHaveBeenCalledWith('audit-parcelle-2026-10-12-' + IDU + '.json', '{"format":"plan-audit-parcelle","id":"20261012-100000-0000beef"}');
  });

  it('retire un audit apres confirmation sur sa carte ; « Garder » y renonce', async () => {
    const t = monter();
    await act(async () => { await t.catalogue.relire(); });
    await cliquer(bouton(cartes()[0], 'auditsParcelle.retirer'));
    expect(cartes()[0]?.textContent).toContain('Retirer cet audit du serveur de Plan ? Il ne pourra plus être rouvert, téléchargé ni rejoué, et ses analyses partent avec lui.');
    await cliquer(bouton(cartes()[0], 'auditsParcelle.garder'));
    expect(t.c.retirer).not.toHaveBeenCalled();
    expect(bouton(cartes()[0], 'auditsParcelle.confirmerRetrait')).toBeNull();
    await cliquer(bouton(cartes()[0], 'auditsParcelle.retirer'));
    await cliquer(bouton(cartes()[0], 'auditsParcelle.confirmerRetrait'));
    // L'administrateur retire sans secret : sa session suffit.
    expect(t.c.retirer).toHaveBeenCalledWith('20261013-154200-0000abcd', '');
    expect(cartes()).toHaveLength(2);
    expect(t.d.signaler).toHaveBeenCalledWith('Audit retiré du serveur de Plan.');
  });

  it('se ferme par son bouton, et relit la liste a la demande', async () => {
    const t = monter();
    await act(async () => { await t.catalogue.relire(); });
    await cliquer(hote.querySelector<HTMLButtonElement>('[data-controle="auditsParcelle.relire"]'));
    expect(t.c.lister).toHaveBeenCalledTimes(2);
    await cliquer(hote.querySelector<HTMLButtonElement>('[data-controle="auditsParcelle.fermer"]'));
    expect(t.fermer).toHaveBeenCalled();
  });
});

// Admin › « Audits » (spec-audit 15.4 et 15.5) : les promenades a part, les donnees et la conclusion
// d'un audit, ses analyses cote a cote, le detail d'une analyse (entrant, sortant), le rejeu par modele.
describe('l ecran des audits : donnees, conclusion, analyses et rejeux', () => {
  const ID = '20261013-154200-0000abcd';
  const photo = { type: 'image/jpeg', base64: 'QUJDRA==' };
  const fichier = {
    format: 'plan-audit-parcelle', version: 1, parcelle: { idu: IDU, adresse: '2 allée des Limites', origine: null }, code: { version: '2.2.0', commit: null },
    regles: { lectureToits: 1, lectureMurs: 2 }, debut: '2026-10-13T08:00:00.000Z', finCapture: '2026-10-13T08:30:00.000Z', ecritLe: '2026-10-13T09:00:00.000Z',
    batiments: [{ cle: 'b1', nom: 'Maison', mitoyen: false, cas: null, vu: {}, photos: [], facades: [{ cote: 0, orientation: 'Sud', largeurM: 9, hauteurM: 6, photos: [photo, photo], mesure: null }] }],
    cloture: { photos: [] }, portail: { photos: [] },
    propositions: [
      { id: 'p1', objet: 'Façade sud de Maison', avant: '4 ouvertures', apres: '6 ouvertures relevées', source: 'mesure', decision: 'validee' },
      { id: 'p2', objet: 'Toit de Maison', avant: 'deux pans', apres: 'croupes', source: 'claude', decision: 'refusee' },
      { id: 'p3', objet: 'Toit de Maison', avant: 'tuile', apres: 'ardoise', source: 'claude', decision: null },
    ],
    decisions: [{ t: '2026-10-13T09:00:00.000Z', acceptees: ['p1'], refusees: ['p2'], verifies: [] }],
  };
  const tokens = { entree: 10, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 0, sortie: 5 };
  const resultat = { id: 'b0-p1', passe: 1, usage: 'analyse', modele: 'claude-haiku-5-5', statut: 'reussi' as const, arret: 'end_turn', erreur: null, tokens, cout: 0.002,
    trouve: { ouvertures: 6, manquees: 0, enTrop: 0, bouts: 1, lucarnes: 2, elements: 0, ecarts: 1, coins: 0, determines: 3, vide: false } };
  const resume = (plus: Partial<ResumeAnalyse>): ResumeAnalyse => ({
    id: '20261014-100000-claude-haiku-5-5-abcd', audit: ID, nature: 'analyse', etat: 'termine', creeLe: '2026-10-14T10:00:00Z', finLe: '2026-10-14T10:02:00Z', idBatch: 'msgbatch_1',
    organisation: 'admin', usage: 'analyse', modele: 'claude-haiku-5-5', effort: 'low', prompt: 3, schema: 2, versions: {}, requetes: 1, images: 1, facades: 1, cout: 0.002,
    tokens, resultats: [resultat], ...plus,
  });

  function monterTout(plus: Partial<DependancesCatalogue> = {}, options: { brouillon?: BrouillonServeur } = {}) {
    const promenade = fiche({ id: '20261012-100000-0000beef', nature: 'promenade', idu: '', commune: 'Le Vésinet', adresse: 'Le Vésinet', marque: 'corpus', cas: 2, statuts: { a_corriger: 1, valide: 1 } });
    const parcelle = fiche({ marque: 'corpus', phase: 'analyse', photos: 2, propositions: { total: 3, claude: 2, mesures: 1, validees: 1, refusees: 1, enAttente: 1 } });
    const c: ClientAudits = { envoyer: vi.fn(async () => ({ id: 'x', retrait: '' })), remplacer: vi.fn(), retirer: vi.fn(async () => {}), lister: vi.fn(async () => [parcelle, promenade]), lire: vi.fn(async () => JSON.stringify(fichier)) };
    const enCours = resume({ id: '20261015-100000-claude-sonnet-5-5-beef', nature: 'rejeu', etat: 'en_cours', creeLe: '2026-10-15T10:00:00Z', finLe: null, modele: 'claude-sonnet-5-5', resultats: null, cout: null, idBatch: 'msgbatch_2' });
    let fini = false;
    const analyses: ClientAnalysesAudits = {
      lister: vi.fn(async () => (fini ? [resume({}), { ...enCours, etat: 'termine' as const, finLe: '2026-10-15T10:05:00Z', resultats: [resultat] }] : [resume({}), enCours])),
      lire: vi.fn(async () => ({ audit: ID, resume: resume({}), entrant: { max_tokens: 8000, effort: 'low', usages: { analyse: { prompt: 3, schema: 2, systeme: 'Vous êtes un expert des maisons.', schemaJson: {} } },
        requetes: [{ id: 'b0-p1', passe: 1, usage: 'analyse', modele: 'claude-haiku-5-5', facades: 1, images: 1, contenu: [{ type: 'image' as const, media_type: 'image/jpeg', image: 'a'.repeat(64) + '.jpg', octets: 4 }, { type: 'text' as const, text: 'Bâtiment : Maison.' }] }] },
        sortant: { idBatch: 'msgbatch_1', finLe: '2026-10-14T10:02:00Z', resultats: [{ ...resultat, texte: '{"forme":{"valeur":"Deux pans"}}', sortie: { forme: { valeur: 'deux-pans' } }, tarif: '2026-10-01' }] } })),
      urlImage: (a: string, n: string) => 'admin/audits/' + a + '/images/' + n,
    };
    const analyse: ClientAnalyse = {
      etat: vi.fn(async () => ({ actif: true, prompt: 3, schema: 2, organisation: 'admin', admin: true, modeles: ['claude-haiku-5-5', 'claude-sonnet-5-5'], brouillon: options.brouillon ?? null })),
      creerBatch: vi.fn(async () => ({ batch: { id: 'msgbatch_3', etat: 'in_progress', compte: null }, modele: 'claude-sonnet-5-5', prompt: 3, schema: 2, trace: 't' })),
      etatBatch: vi.fn(async () => { fini = true; return { id: 'msgbatch_2', etat: 'ended', compte: null }; }),
      resultats: vi.fn(async () => ({ batch: { id: 'msgbatch_2', etat: 'ended', compte: null }, modele: 'claude-sonnet-5-5', prompt: 3, schema: 2, resultats: [] })),
      immediat: vi.fn(),
    };
    const preparer = vi.fn(async (_t: string, _f: FicheAudit, modele: string): Promise<DemandeAnalyse> => ({ projet: null, idu: IDU, adresse: null, audit: ID, depot: ID, usage: 'rejeu', modele, requetes: [{ id: 'b0-p1', passe: 1, facades: 1, contenu: [] }] }));
    const d: DependancesCatalogue = {
      client: () => c, iduProjet: () => IDU, refusEcriture: () => null, ouvrir: vi.fn(), telecharger: vi.fn(), signaler: vi.fn(), choisirFichier: vi.fn((f: (t: string) => void) => f('{"format":"plan-audit"}')),
      rejeu: { analyses: () => analyses, analyse: () => analyse, preparer, planifier: () => () => {} }, ...plus,
    };
    const catalogue = creerCatalogue(d);
    act(() => racine.render(createElement(AuditsParcelle, { catalogue, fermer: vi.fn() })));
    return { c, d, catalogue, analyses, analyse, preparer };
  }
  const ouvrirDetails = async () => { await cliquer(bouton(cartes()[0], 'auditsParcelle.details')); await attendre(); };

  it('range les promenades a part, et dit la conclusion de chaque audit', async () => {
    const t = monterTout();
    await act(async () => { await t.catalogue.relire(); });
    expect([...hote.querySelectorAll('.titreSectionAudits')].map((x) => x.textContent)).toEqual(['Audits de parcelle (1)', 'Promenades des toits (1)']);
    const [parcelle, promenade] = cartes();
    expect(parcelle?.querySelector('.conclusionAuditRecu')?.textContent).toBe('3 propositions (Claude 2, mesures 1) : 1 validée, 1 refusée, 1 en attente');
    expect(promenade?.querySelector('.parcelleAuditRecu')?.textContent).toBe('Commune Le Vésinet');
    expect(promenade?.querySelector('.conclusionAuditRecu')?.textContent).toBe('À corriger 1, Validé 1');
    // Une promenade ne s'ouvre pas dans un projet, et ne se rejoue pas par Claude.
    expect(bouton(promenade, 'auditsParcelle.ouvrir')).toBeNull();
    expect(t.catalogue.raisonRejouer(t.catalogue.etat().audits?.[1] as FicheAudit)).toBe('Le rejeu par Claude ne porte que sur les audits de parcelle.');
    // « Ajouter un fichier d'audit… » depose le fichier du poste, puis relit la liste.
    await cliquer(hote.querySelector<HTMLButtonElement>('[data-controle="auditsParcelle.deposer"]'));
    expect(t.c.envoyer).toHaveBeenCalledWith('{"format":"plan-audit"}', 'corpus');
    expect(t.d.signaler).toHaveBeenCalledWith('Fichier d’audit ajouté au serveur de Plan.');
  });

  it('montre les donnees et les decisions, compare les analyses, suit celle en cours', async () => {
    const t = monterTout();
    await act(async () => { await t.catalogue.relire(); });
    await ouvrirDetails();
    const carte = cartes()[0];
    expect(carte?.querySelectorAll('.vignettesAudit img')).toHaveLength(2);
    expect(carte?.textContent).toContain('Façade sud : 2 photos');
    const decisions = [...(carte?.querySelectorAll('.tableAudit:not(.tableComparaison) tbody tr') ?? [])].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(decisions).toEqual([
      ['Façade sud de Maison', '4 ouvertures', '6 ouvertures relevées', 'Mesure', 'Validée'],
      ['Toit de Maison', 'deux pans', 'croupes', 'Claude', 'Refusée'],
      ['Toit de Maison', 'tuile', 'ardoise', 'Claude', 'En attente'],
    ]);
    // Le rejeu en cours est suivi : son batch fini, le serveur complete la trace et la liste se relit.
    expect(t.analyse.etatBatch).toHaveBeenCalledWith('msgbatch_2');
    expect(t.analyse.resultats).toHaveBeenCalledWith('msgbatch_2');
    const lignes = [...(carte?.querySelectorAll('.tableComparaison tbody tr') ?? [])].map((tr) => [...tr.querySelectorAll('td')].slice(1, 13).map((td) => td.textContent));
    expect(lignes).toEqual([
      ['Analyse', 'Claude Haiku 5.5', '3 · 2', '1 / 1', '0', '6', '1', '2', '1', '3', '0,0020 $', '120 s'],
      ['Rejeu', 'Claude Sonnet 5.5', '3 · 2', '1 / 1', '0', '6', '1', '2', '1', '3', '—', '300 s'],
    ]);
    await cliquer(bouton(carte, 'auditsParcelle.exporterAnalyses'));
    expect(t.d.telecharger).toHaveBeenCalledWith('analyses-' + IDU + '-' + ID + '.csv', expect.stringContaining('Analyse;Nature;Envoyée le;Modèle'), 'text/csv;charset=utf-8');
  });

  it('montre une analyse en entier, entrant et sortant, et l exporte', async () => {
    const t = monterTout();
    await act(async () => { await t.catalogue.relire(); });
    await ouvrirDetails();
    await cliquer(cartes()[0]?.querySelector<HTMLButtonElement>('[data-controle="auditsParcelle.voirAnalyse"]') ?? null);
    const trace = hote.querySelector('.traceAudit');
    expect(trace?.textContent).toContain('Vous êtes un expert des maisons.');
    expect(trace?.textContent).toContain('Bâtiment : Maison.');
    expect(trace?.querySelector('.imageTrace')?.getAttribute('src')).toBe('admin/audits/' + ID + '/images/' + 'a'.repeat(64) + '.jpg');
    expect(trace?.textContent).toContain('{"forme":{"valeur":"Deux pans"}}');
    expect(trace?.textContent).toContain('"valeur": "deux-pans"');
    expect(trace?.textContent).toContain('Trouvé : ouvertures 6, pignons 1, lucarnes 2');
    await cliquer(trace?.querySelector<HTMLButtonElement>('[data-controle="auditsParcelle.exporterAnalyse"]') ?? null);
    expect(t.d.telecharger).toHaveBeenCalledWith('analyse-' + ID + '-20261014-100000-claude-haiku-5-5-abcd.json', expect.stringContaining('"systeme": "Vous êtes un expert des maisons."'));
  });

  it('rejoue l analyse avec le modele choisi ; refuse sur une autre parcelle', async () => {
    const t = monterTout();
    await act(async () => { await t.catalogue.relire(); });
    await ouvrirDetails();
    const choix = cartes()[0]?.querySelector<HTMLSelectElement>('[data-controle="auditsParcelle.modeleRejeu"]');
    expect([...(choix?.options ?? [])].map((o) => o.textContent)).toEqual(['Claude Haiku 5.5', 'Claude Sonnet 5.5']);
    act(() => t.catalogue.choisirModele('claude-sonnet-5-5'));
    await cliquer(bouton(cartes()[0], 'auditsParcelle.rejouer'));
    expect(t.preparer).toHaveBeenCalledWith(JSON.stringify(fichier), expect.objectContaining({ id: ID }), 'claude-sonnet-5-5');
    expect(t.analyse.creerBatch).toHaveBeenCalledWith(expect.objectContaining({ usage: 'rejeu', depot: ID, modele: 'claude-sonnet-5-5' }));
    expect(t.d.signaler).toHaveBeenCalledWith('Rejeu de l’analyse parti (claude-sonnet-5-5, 1 requêtes) : la réponse arrive en général en quelques minutes.');
    act(() => racine.unmount());
    racine = createRoot(hote);
    const ailleurs = monterTout({ iduProjet: () => '35238000AB0001' });
    await act(async () => { await ailleurs.catalogue.relire(); });
    await ouvrirDetails();
    expect(bouton(cartes()[0], 'auditsParcelle.rejouer')?.disabled).toBe(true);
    expect(cartes()[0]?.querySelector('.detailAuditRecu .raisonAuditRecu')?.textContent).toBe('Ce projet est sur la parcelle 35238000AB0001 : ouvrez le projet de la parcelle ' + IDU + ' pour rejouer son audit.');
  });

  it('relance l analyse des photos a cote du rejeu : l audit s ouvre sans ses mesures ; refuse sur une autre parcelle, avec la raison de l ouverture', async () => {
    const t = monterTout();
    await act(async () => { await t.catalogue.relire(); });
    await ouvrirDetails();
    const bout = bouton(cartes()[0], 'auditsParcelle.remesurer');
    expect(bout?.textContent).toBe('Relancer l’analyse des photos');
    expect(bout?.disabled).toBe(false);
    await cliquer(bout);
    expect(t.d.ouvrir).toHaveBeenCalledWith(JSON.stringify(fichier), expect.objectContaining({ id: ID }), true);
    // Rejouer l'analyse n'ouvre rien : les deux boutons sont distincts.
    expect(t.analyse.creerBatch).not.toHaveBeenCalled();
    act(() => racine.unmount());
    racine = createRoot(hote);
    const ailleurs = monterTout({ iduProjet: () => '35238000AB0001' });
    await act(async () => { await ailleurs.catalogue.relire(); });
    await ouvrirDetails();
    expect(bouton(cartes()[0], 'auditsParcelle.remesurer')?.disabled).toBe(true);
    expect(bouton(cartes()[0], 'auditsParcelle.remesurer')?.title).toContain('Ce projet est sur la parcelle 35238000AB0001');
  });

  it('rejoue avec le prompt du brouillon des regles quand l administrateur en a un, et le dit', async () => {
    const t = monterTout({}, { brouillon: { enregistreLe: '2026-10-16T10:00:00Z', prompt: 6, schema: 1 } });
    await act(async () => { await t.catalogue.relire(); });
    await ouvrirDetails();
    const case_ = cartes()[0]?.querySelector<HTMLInputElement>('[data-controle="auditsParcelle.essaiRejeu"]');
    expect(case_?.disabled).toBe(false);
    expect(case_?.checked).toBe(false);
    expect(case_?.closest('label')?.textContent).toContain('Avec le brouillon des règles (v6)');
    // Sans la case, le rejeu part avec le prompt livre : la demande ne nomme aucun essai.
    await cliquer(bouton(cartes()[0], 'auditsParcelle.rejouer'));
    expect(t.analyse.creerBatch).toHaveBeenLastCalledWith(expect.not.objectContaining({ essai: expect.anything() }));
    await cliquer(case_ ?? null);
    expect(t.catalogue.etat().essai).toBe(true);
    await cliquer(bouton(cartes()[0], 'auditsParcelle.rejouer'));
    expect(t.analyse.creerBatch).toHaveBeenLastCalledWith(expect.objectContaining({ usage: 'rejeu', depot: ID, essai: 'brouillon' }));
    expect(t.d.signaler).toHaveBeenLastCalledWith(expect.stringContaining('prompt du brouillon des règles'));
  });

  it('ne propose pas l essai sans brouillon sur le serveur, et refuse de rejouer s il a ete demande quand meme', async () => {
    const t = monterTout();
    await act(async () => { await t.catalogue.relire(); });
    await ouvrirDetails();
    const case_ = cartes()[0]?.querySelector<HTMLInputElement>('[data-controle="auditsParcelle.essaiRejeu"]');
    expect(case_?.disabled).toBe(true);
    expect(case_?.closest('label')?.getAttribute('title')).toContain('Aucun brouillon enregistré');
    act(() => t.catalogue.choisirEssai(true));
    expect(t.catalogue.raisonRejouer(t.catalogue.etat().audits?.[0] as FicheAudit)).toMatch(/brouillon des règles/);
    await cliquer(bouton(cartes()[0], 'auditsParcelle.rejouer'));
    expect(t.analyse.creerBatch).not.toHaveBeenCalled();
  });

  it('compare les reponses d une analyse a celles d une autre : ce que le vote des passes dit differemment', async () => {
    const t = monterTout();
    const IDS = { analyse: '20261014-100000-claude-haiku-5-5-abcd', rejeu: '20261015-100000-claude-sonnet-5-5-beef' };
    const sortie = (forme: string) => reponse({ forme: { indices: [], valeur: forme } });
    const resultats = (forme: string): ResultatSortant[] => ['b0-p1', 'b0-p2', 'b0-p3'].map((id) => ({ ...resultat, id, passe: Number(id.slice(-1)), usage: 'rejeu', texte: null, sortie: sortie(forme), tarif: null }));
    const complete = (id: keyof typeof IDS, forme: string): AnalyseComplete => ({
      audit: ID, resume: resume({ id: IDS[id], nature: id === 'rejeu' ? 'rejeu' : 'analyse', essai: id === 'rejeu' }), entrant: null,
      sortant: { idBatch: 'msgbatch_x', finLe: '2026-10-15T10:05:00Z', resultats: resultats(forme) },
    });
    t.analyses.lire = vi.fn(async (_a: string, trace: string) => (trace === IDS.rejeu ? complete('rejeu', 'croupes') : complete('analyse', 'deux-pans')));
    await act(async () => { await t.catalogue.relire(); });
    await ouvrirDetails();
    await act(async () => { await t.catalogue.voirTrace(ID, IDS.rejeu); });
    await attendre();
    const trace = hote.querySelector('.traceAudit');
    expect(trace?.textContent).toContain('Brouillon des règles');
    // L'autre analyse est proposee a la comparaison : la seule terminee, celle du prompt livre.
    const choix = trace?.querySelector<HTMLSelectElement>('[data-controle="auditsParcelle.comparerAvec"]');
    expect([...(choix?.options ?? [])].map((o) => o.value)).toEqual(['', IDS.analyse]);
    await act(async () => { await t.catalogue.comparer(ID, IDS.analyse); });
    await attendre();
    const lignes = [...(hote.querySelectorAll('.traceAudit details .tableComparaison tbody tr'))].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(lignes).toEqual([['b0', 'Forme du toit', 'deux-pans (100 %)', 'croupes (100 %)']]);
    expect(trace?.textContent).toContain('1 bâtiment lu dans les deux · 1 attribut change sur');
    // Deux analyses qui disent la meme chose : rien a montrer, et on le dit.
    t.analyses.lire = vi.fn(async () => complete('analyse', 'croupes'));
    await act(async () => { await t.catalogue.comparer(ID, IDS.analyse); });
    await attendre();
    expect(hote.querySelector('.traceAudit')?.textContent).toContain('Les deux analyses disent la même chose sur tous leurs attributs.');
    // Fermer l'analyse ferme aussi la comparaison.
    act(() => t.catalogue.fermerTrace());
    expect(t.catalogue.etat().comparaison).toBeNull();
  });
});
