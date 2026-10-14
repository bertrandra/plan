// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AuditsParcelle } from '../../../src/zones/parcours/AuditsParcelle.js';
import { creerCatalogue, type DependancesCatalogue } from '../../../src/app/audit/parcelle/catalogue.js';
import { EchecPartageAudit, type ClientAudits, type FicheAudit } from '../../../src/io/auditsServeur.js';

// Admin › « Audits de parcelle » (Z8, MD/spec-audit.md §15) : la liste des audits recus, et pour
// chacun « Ouvrir dans ce projet » (meme parcelle), « Télécharger » et « Retirer » (confirme sur la carte).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDU = '78650000AE0101';
const fiche = (plus: Partial<FicheAudit>): FicheAudit => ({
  id: '20261013-154200-0000abcd', recuLe: '2026-10-13T15:42:00Z', organisation: 'org-test', idu: IDU, adresse: '2 allée des Limites',
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
    expect(hote.querySelector('.titreParcours')?.textContent).toBe('Audits de parcelle');
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
    expect(cartes()[0]?.textContent).toContain('Retirer cet audit du serveur de Plan ? Il ne pourra plus être rouvert, téléchargé ni rejoué.');
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
