// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AuditsParcelle } from '../../../src/zones/parcours/AuditsParcelle.js';
import { creerCatalogue, type DependancesCatalogue } from '../../../src/app/audit/parcelle/catalogue.js';
import type { ClientAudits, FicheAudit } from '../../../src/io/auditsServeur.js';
import type { AnalyseComplete, ClientAnalysesAudits, ResumeAnalyse } from '../../../src/io/analysesAudits.js';
import type { ClientAnalyse } from '../../../src/io/analyseClaude.js';
import type { ClientDonneesAnalyse, DonneesAnalyse } from '../../../src/io/donneesAnalyse.js';

// Admin › « Audits », les donnees d'analyse (lot L0) : l'export a travers les audits (JSON tel quel, CSV pour un tableur), ses choix
// de periode, d'usage et de modele ; le rejeu du run d'une facade depuis son image gardee, sur une analyse ouverte.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDU = '78650000AE0101';
const FICHE: FicheAudit = {
  id: '20261013-154200-0000abcd', recuLe: '2026-10-13T15:42:00Z', organisation: 'org-test', nature: 'parcelle', idu: IDU, commune: null, dossier: null,
  propositions: null, cas: null, statuts: null, adresse: '2 allée des Limites', taille: 1024, marque: 'sauvegarde', photos: 2, phase: 'analyse', debut: '2026-10-13T15:00:00.000Z',
};
const TRACE = '20261029-100000-claude-haiku-5-5-0a1b';
const RESUME: ResumeAnalyse = { id: TRACE, audit: FICHE.id, nature: 'immediat', etat: 'termine', creeLe: '2026-10-29T10:00:00Z', finLe: '2026-10-29T10:00:05Z', idBatch: null, organisation: 'org-test',
  usage: 'facade', modele: 'claude-haiku-5-5', effort: 'low', prompt: 2, schema: 2, versions: { facade: { prompt: 2, schema: 2 } }, requetes: 3, images: 3, facades: 1, resultats: [], cout: 0.004, tokens: null };
const COMPLETE: AnalyseComplete = { audit: FICHE.id, resume: RESUME, sortant: null, entrant: { max_tokens: 16000, effort: 'low', usages: {}, requetes: [1, 2].map((p) => ({
  id: 'r' + p, passe: p, usage: 'facade', modele: 'claude-haiku-5-5', facades: p === 1 ? 1 : 0, images: 1, contenu: [{ type: 'image' as const, media_type: 'image/jpeg', image: 'a'.repeat(64) + '.jpg', octets: 4 }] })) } };
const DONNEES: DonneesAnalyse = { format: 'plan-donnees-analyse', version: 1, genereLe: '2026-10-29T11:00:00Z', du: '2026-10-01', au: '2026-10-29', filtres: { modele: null, usage: null }, requetes: [], propositions: [] };

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

function monter(plus: Partial<DependancesCatalogue> = {}) {
  const c = { lister: vi.fn(async () => [FICHE]), lire: vi.fn(async () => '{"format":"plan-audit-parcelle"}') } as unknown as ClientAudits;
  const donnees: ClientDonneesAnalyse = {
    exporter: vi.fn(async () => DONNEES),
    rejouerFacade: vi.fn(async () => ({ modele: 'claude-haiku-5-5', prompt: 2, schema: 2, trace: 'x', resultats: [{ id: 'rejeu-p1', statut: 'reussi' as const, passe: 1, sortie: {}, erreur: null, cout: 0.0015 }] })),
  };
  const analyses: ClientAnalysesAudits = { lister: vi.fn(async () => [RESUME]), lire: vi.fn(async () => COMPLETE), urlImage: () => 'image' };
  const analyse = { etat: vi.fn(async () => ({ actif: true, prompt: 9, schema: 9, organisation: null, admin: true, modeles: ['claude-haiku-5-5', 'claude-sonnet-5-5'], brouillon: null })) } as unknown as ClientAnalyse;
  const d: DependancesCatalogue = { client: () => c, iduProjet: () => IDU, refusEcriture: () => null, ouvrir: vi.fn(), telecharger: vi.fn(), signaler: vi.fn(), donnees: () => donnees,
    rejeu: { analyses: () => analyses, analyse: () => analyse, preparer: vi.fn() }, ...plus };
  const catalogue = creerCatalogue(d);
  act(() => racine.render(createElement(AuditsParcelle, { catalogue, fermer: vi.fn() })));
  return { d, donnees, analyses, catalogue };
}
const attendre = async () => { await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); }); };
const controle = (nom: string) => hote.querySelector<HTMLButtonElement>('[data-controle="' + nom + '"]');
const cliquer = async (b: HTMLElement | null) => { expect(b).not.toBeNull(); await act(async () => { b?.click(); }); await attendre(); };

describe('les donnees d analyse dans Admin › Audits', () => {
  it('exporte la periode en JSON tel quel et en CSV, avec l usage choisi', async () => {
    const t = monter();
    expect(hote.querySelector('.exportDonneesAnalyse summary')?.textContent).toBe('Exporter les données d’analyse');
    act(() => t.catalogue.choisirExport({ du: '2026-10-01', au: '2026-10-29', usage: 'facade' }));
    expect(hote.querySelector<HTMLSelectElement>('[data-controle="auditsParcelle.exportUsage"]')?.value).toBe('facade');
    await cliquer(controle('auditsParcelle.exporterDonneesJson'));
    expect(t.donnees.exporter).toHaveBeenCalledWith({ du: '2026-10-01', au: '2026-10-29', usage: 'facade', modele: null });
    expect(t.d.telecharger).toHaveBeenCalledWith('donnees-analyse-2026-10-01-2026-10-29.json', JSON.stringify(DONNEES, null, 2) + '\n');
    await cliquer(controle('auditsParcelle.exporterDonneesCsv'));
    expect(t.d.telecharger).toHaveBeenLastCalledWith('donnees-analyse-2026-10-01-2026-10-29.csv', expect.stringMatching(/^\uFEFFNature;Date;/), 'text/csv;charset=utf-8');
    expect(t.d.signaler).toHaveBeenLastCalledWith('Données d’analyse exportées : 0 requête, 0 proposition.');
  });

  it('grise l export sur une periode a l envers, et le retire sans session admin', async () => {
    const t = monter();
    act(() => t.catalogue.choisirExport({ du: '2026-10-29', au: '2026-10-01' }));
    expect(controle('auditsParcelle.exporterDonneesCsv')?.disabled).toBe(true);
    expect(hote.querySelector('.exportDonneesAnalyse .raisonAuditRecu')?.textContent).toBe('Choisissez une période : le premier jour avant le dernier.');
    act(() => racine.unmount());
    racine = createRoot(hote);
    monter({ donnees: () => null });
    expect(hote.querySelector('.exportDonneesAnalyse')).toBeNull();
  });

  it('rejoue le run d une facade depuis son image gardee, une fois par facade, et relit les analyses', async () => {
    const t = monter();
    await act(async () => { await t.catalogue.relire(); });
    await cliquer(controle('auditsParcelle.details'));
    await act(async () => { await t.catalogue.voirTrace(FICHE.id, TRACE); });
    // Les passes d'une facade ont le meme contenu : un bouton, sur la premiere.
    expect(hote.querySelectorAll('[data-controle="auditsParcelle.rejouerFacade"]')).toHaveLength(1);
    const avant = (t.analyses.lister as ReturnType<typeof vi.fn>).mock.calls.length;
    await cliquer(controle('auditsParcelle.rejouerFacade'));
    expect(t.donnees.rejouerFacade).toHaveBeenCalledWith({ audit: FICHE.id, trace: TRACE, requete: 'r1', passes: 3 });
    expect(t.d.signaler).toHaveBeenLastCalledWith('Façade rejouée depuis son image gardée (claude-haiku-5-5, prompt 2, 0,0015 $) : la nouvelle analyse est dans la liste.');
    expect((t.analyses.lister as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(avant);
  });
});
