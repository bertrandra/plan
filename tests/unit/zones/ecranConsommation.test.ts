// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranConsommation, type PropsEcranConsommation } from '../../../src/zones/EcranConsommation.js';
import { demandeEcranConsommation } from '../../../src/app/ecranConsommation.js';
import type { FiltresConsommation } from '../../../src/io/depotDemos.js';
import type { Tarifs } from '../../../src/model/tarifsClaude.js';

// L'ecran Admin › Consommation de Claude (`?admin&ecran=consommation`, MD/spec-audit.md 13.3) :
// filtres envoyes au serveur, chiffres cles, alertes, vues, export CSV de la vue affichee, tarifs.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TARIFS = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../deploy/claude-tarifs.json'), 'utf8')) as Tarifs;
const PLAFONDS = { format: 'plan-claude-plafonds', defaut: { jour: 1, mois: 10 }, organisations: {}, requetesParBatch: 60, estimationRequete: 0.005 };

const ligne = (t: string, plus: Record<string, unknown> = {}) => ({
  t, organisation: 'admin', projet: 'admin', idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet', audit: 'audit-1',
  usage: 'analyse', modele: 'claude-haiku-5-5', batch: true, passe: 1,
  tokens: { entree: 4000, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 25000, sortie: 1500 }, images: 1, cout: 0.0007, statut: 'reussi', ...plus
});

function reponse(f: FiltresConsommation) {
  const lignes = [ligne('2026-10-12T08:00:00Z'), ligne('2026-10-13T08:00:00Z', { modele: 'claude-sonnet-5-5', usage: 'escalade', cout: 0.0893, idu: '78650000AE0102', adresse: 'Rue B', audit: 'audit-2' })];
  return {
    format: 'plan-claude-consommation', du: f.du, au: f.au, aujourdhui: '2026-10-14',
    lignes: lignes.filter((l) => !f.modele || l.modele === f.modele), recents: lignes,
    organisations: [{ id: 'admin', jour: 0.9, mois: 1, plafond: { jour: 1, mois: 10 } }],
    choix: { organisations: ['admin'], modeles: ['claude-haiku-5-5', 'claude-sonnet-5-5'], usages: ['analyse', 'escalade', 'renfort', 'immediat'], parcelles: [{ idu: '78650000AE0101', adresse: 'Rue A' }] }
  };
}

describe('l ecran de la consommation de Claude', () => {
  let monte: { racine: Root; hote: HTMLElement } | null = null;
  afterEach(() => { if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); monte = null; } });

  async function monter() {
    history.replaceState(null, '', '/?admin&ecran=consommation');
    const demandes: FiltresConsommation[] = [];
    const telecharges: { nom: string; texte: string }[] = [];
    const tarifsEnvoyes: Tarifs[] = [];
    const props: PropsEcranConsommation = {
      aujourdhui: '2026-10-14',
      charger: async (f) => { demandes.push(f); return reponse(f); },
      lireTarifs: async () => TARIFS,
      enregistrerTarifs: async (t) => { tarifsEnvoyes.push(t); return t; },
      lirePlafonds: async () => PLAFONDS,
      enregistrerPlafonds: async (p) => p,
      telecharger: (nom, texte) => { telecharges.push({ nom, texte }); }
    };
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    await act(async () => { racine.render(createElement(EcranConsommation, props)); });
    monte = { racine, hote };
    return { hote, demandes, telecharges, tarifsEnvoyes };
  }
  const onglet = async (hote: HTMLElement, nom: string) => {
    const b = [...hote.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((e) => e.textContent === nom);
    await act(async () => { b?.click(); });
  };
  const bouton = (hote: HTMLElement, texte: string) => [...hote.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === texte);

  it('s ouvre sur ?admin&ecran=consommation', () => {
    expect(demandeEcranConsommation('?admin&ecran=consommation')).toBe(true);
    expect(demandeEcranConsommation('?admin&ecran=palette')).toBe(false);
  });

  it('demande les trente derniers jours, montre les chiffres cles et les alertes', async () => {
    const { hote, demandes } = await monter();
    expect(demandes).toEqual([{ du: '2026-09-15', au: '2026-10-14' }]);
    const tuiles = [...hote.querySelectorAll('.consTuile')].map((t) => t.textContent);
    expect(tuiles[0]).toMatch(/^Coût0,09 \$2 appels/);
    expect(tuiles[2]).toMatch(/Coût moyen par parcelle0,045 \$Estimation : 0,01 \$ à 0,02 \$ · 2 audits/);
    const alertes = [...hote.querySelectorAll('.consAlertes li')].map((l) => l.textContent);
    expect(alertes).toEqual([
      'Alerte Organisation « admin » : 90 % du plafond du jour (0,90 $ sur 1,00 $).',
      'Alerte Coût moyen par parcelle sur sept jours : 0,045 $, plus de deux fois l’estimation (0,02 $).'
    ]);
    // Le graphique : une couleur par modele, nommee dans la legende.
    expect([...hote.querySelectorAll('.consLegende li')].map((l) => l.textContent)).toEqual(['Claude Haiku 5.5', 'Claude Sonnet 5.5']);
    expect(hote.querySelectorAll('.consAire')).toHaveLength(2);
    expect(hote.querySelector('.consAire')?.parentElement?.getAttribute('class')).toBe('consSerie1');
  });

  it('envoie les filtres au serveur', async () => {
    const { hote, demandes } = await monter();
    const select = hote.querySelector<HTMLSelectElement>('select[name="modele"]');
    await act(async () => {
      if (!select) return;
      select.value = 'claude-sonnet-5-5';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(demandes[demandes.length - 1]).toEqual({ du: '2026-09-15', au: '2026-10-14', modele: 'claude-sonnet-5-5' });
    const periode = hote.querySelector<HTMLSelectElement>('select[name="periode"]');
    await act(async () => {
      if (!periode) return;
      periode.value = '12m';
      periode.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(demandes[demandes.length - 1]).toMatchObject({ du: '2025-11-01', au: '2026-10-14' });
  });

  it('exporte en CSV la vue affichee', async () => {
    const { hote, telecharges } = await monter();
    await act(async () => { bouton(hote, 'Exporter en CSV')?.click(); });
    expect(telecharges[0]?.nom).toBe('consommation-claude-temps-dollars-2026-09-15-2026-10-14.csv');
    await onglet(hote, 'Par parcelle');
    // Trie sur le cout, du plus cher au moins cher, par defaut.
    expect([...hote.querySelectorAll('tbody tr td:nth-child(2)')].map((c) => c.textContent)).toEqual(['78650000AE0102', '78650000AE0101']);
    await act(async () => { [...hote.querySelectorAll<HTMLButtonElement>('.consTri')].find((b) => b.textContent?.startsWith('IDU'))?.click(); });
    expect([...hote.querySelectorAll('tbody tr td:nth-child(2)')].map((c) => c.textContent)).toEqual(['78650000AE0101', '78650000AE0102']);
    await act(async () => { bouton(hote, 'Exporter en CSV')?.click(); });
    expect(telecharges[1]?.nom).toBe('consommation-claude-parcelles-2026-09-15-2026-10-14.csv');
    expect(telecharges[1]?.texte).toContain('Adresse;IDU;Audits;Tokens Claude Haiku 5.5;Tokens Claude Sonnet 5.5');
    await onglet(hote, 'Tarifs et plafonds');
    expect(bouton(hote, 'Exporter en CSV')?.disabled).toBe(true);
  });

  it('ajoute un tarif date et refuse un tarif dans le passe', async () => {
    const { hote, tarifsEnvoyes } = await monter();
    await onglet(hote, 'Tarifs et plafonds');
    expect(hote.querySelectorAll('.consReglages tbody tr')).toHaveLength(2);
    const sortie = hote.querySelector<HTMLInputElement>('#consTarif-sortie');
    const depuis = hote.querySelector<HTMLInputElement>('#consTarifDepuis');
    expect(depuis?.value).toBe('2026-10-14');
    const saisir = async (el: HTMLInputElement | null, v: string) => {
      await act(async () => {
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await saisir(depuis, '2026-10-01');
    await act(async () => { bouton(hote, 'Ajouter ce tarif')?.click(); });
    expect(hote.querySelector('.palMessage--erreur')?.textContent).toMatch(/passé/);
    expect(tarifsEnvoyes).toHaveLength(0);
    await saisir(depuis, '2026-11-01');
    await saisir(sortie, '0,4');
    await act(async () => { bouton(hote, 'Ajouter ce tarif')?.click(); });
    expect(tarifsEnvoyes).toHaveLength(1);
    expect(tarifsEnvoyes[0]?.lignes[2]).toMatchObject({ modele: 'claude-haiku-5-5', depuis: '2026-11-01', sortie: 0.4 });
    expect(hote.querySelectorAll('.consReglages tbody tr')).toHaveLength(3);
  });
});
