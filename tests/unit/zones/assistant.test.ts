// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Assistant } from '../../../src/zones/parcours/Assistant.js';
import { creerServiceAssistant } from '../../../src/app/assistant/service.js';
import { declarerCommandesAssistant } from '../../../src/app/assistant/branchement.js';
import { parcours } from '../../../src/app/parcours.js';
import { planDeReference } from '../../fixtures/assistant/plan.js';
import type { ClientAnalyse } from '../../../src/io/analyseClaude.js';

// Z8, l'assistant (lot L6) : la demande, la liste d'etapes relue contre le registre (une etape refusee grisee avec sa raison ecrite
// sous elle), et les deux boutons, commandes du registre.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SORTIE = { etapes: [
  { genre: 'champ', commande: '', objet: 'terrasse', champ: 'lames.essenceBois', valeur: 'douglas', pourquoi: 'Les lames passent en douglas.' },
  { genre: 'commande', commande: 'objet.terrassePiscine', objet: '', champ: '', valeur: '', pourquoi: 'Une plage autour de la piscine.' },
], questions: ['Faut-il aussi des rives ?'] };

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); parcours.fermer(); });

function monter(client: ClientAnalyse | null) {
  const p = planDeReference({ selection: 'terrasse' });
  const service = creerServiceAssistant({ client: () => client, identite: () => ({ projet: null, idu: null, adresse: null }), source: () => p.source(), application: p.application });
  declarerCommandesAssistant(p.commandes, service);
  const fermer = () => {};
  const rendre = () => act(() => racine.render(createElement(Assistant, { service, commandes: p.commandes, fermer })));
  rendre();
  return { p, service, rendre };
}
const bouton = (id: string) => hote.querySelector<HTMLButtonElement>('[data-commande="' + id + '"]');

describe('le dialogue de l assistant', () => {
  it('grise l envoi sans demande, puis montre la liste, l etape refusee grisee avec sa raison, et applique', async () => {
    const client = { immediat: async () => ({ modele: 'm', prompt: 1, schema: 1, resultats: [{ id: 'assistant', statut: 'reussi', passe: 1, sortie: SORTIE, erreur: null, cout: 0.0011, synthetique: true }] }) } as unknown as ClientAnalyse;
    const { p, service } = monter(client);
    expect(bouton('assistant.envoyer')?.disabled).toBe(true);
    expect(bouton('assistant.appliquer')).toBeNull();
    act(() => service.saisir('Lames en douglas et une plage autour de la piscine.'));
    expect(bouton('assistant.envoyer')?.disabled).toBe(false);
    await act(async () => { bouton('assistant.envoyer')?.click(); await new Promise((r) => setTimeout(r, 0)); });
    const lignes = [...hote.querySelectorAll('.etapesAssistant > li')];
    expect(lignes.map((l) => l.querySelector('.libelleEtape')?.textContent)).toEqual(['3. Lames et sens de pose › Essence de bois : Douglas', 'Terrasse autour de la piscine']);
    expect(lignes.map((l) => l.classList.contains('refusee'))).toEqual([false, true]);
    expect(lignes[1]?.getAttribute('aria-disabled')).toBe('true');
    expect(lignes[1]?.querySelector('.raisonEtape')?.textContent).toBe('Indisponible dans l’état actuel du plan.');
    expect(hote.querySelector('.questionsAssistant')?.textContent).toBe('Faut-il aussi des rives ?');
    expect(hote.querySelector('.sourceAssistant')?.textContent).toBe('Réponse synthétique (pas Claude), 0,0011 $.');
    expect(bouton('assistant.appliquer')?.disabled).toBe(false);
    act(() => { bouton('assistant.appliquer')?.click(); });
    expect(p.etat.objects.find((o) => o.key === 'terrasse')?.construction?.essenceBois).toBe('douglas');
    expect(p.historique.pile.taille).toBe(1);
  });

  it('dit, sous le bouton, pourquoi l envoi est impossible hors de l organisation', () => {
    const { service } = monter(null);
    act(() => service.saisir('Affichez la grille.'));
    expect(bouton('assistant.envoyer')?.disabled).toBe(true);
    expect(hote.querySelector('.actionsAssistant .refusAssistant')?.textContent).toBe('L’assistant passe par le serveur de Plan : connectez-vous à votre organisation.');
  });
});
