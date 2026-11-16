// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { createStore } from 'zustand/vanilla';
import { brancherMesProjets } from '../../../src/app/mesProjets.js';
import { signalerLimiteProjets } from '../../../src/app/limiteProjets.js';
import { poserAcces } from '../../../src/app/acces.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { parcours, type ServiceMesProjets } from '../../../src/app/parcours.js';
import { dialogues } from '../../../src/shell/dialogues.js';
import { vitrinePlateforme } from '../../../src/plateforme/config.js';
import { MesProjets } from '../../../src/zones/parcours/MesProjets.js';
import type { Droits } from '../../../src/app/commandes.js';
import type { Magasin } from '../../../src/app/magasin.js';
import type { Session } from '../../../src/plateforme/session.js';
import type { ServiceContexte } from '../../../src/plateforme/contexte.js';

// « Mes projets » (lot 2 de la simplification, 16 novembre 2026) : la liste des projets dans Plan, ouvrir l'un d'eux, partir d'une
// adresse ; limite atteinte, « Voir les offres » mene a la vitrine de la plateforme, comme le dialogue de la limite.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const session = {} as unknown as Session;
const contexte = { courant: () => ({ tenant: { slug: 'acme', name: 'Acme' }, user: {} }) } as unknown as ServiceContexte;
const droits = (reste: number | null = null): Droits => ({ branchee: () => true, aCapacite: () => true, aPermission: () => true, reste: () => reste,
  phraseQuota: () => 'Limite atteinte.' });

beforeEach(() => { poserAcces(session, contexte); parcours.fermer(); });

function magasinDe(projet: Record<string, unknown>): Magasin {
  const store = createStore(() => ({ projet: { apiDisponible: true, courant: null, liste: [], statut: 'propre', enregistreA: '', schemaEnRetard: false, quota: null, ...projet } }));
  return { store } as unknown as Magasin;
}
function monter(service: ServiceMesProjets, magasin: Magasin, reste: number | null = null) {
  const cmd = creerRegistre(droits(reste));
  cmd.declarer({ id: 'projet.depuisAdresse', libelle: 'Depuis une adresse', groupe: 'projet', quota: 'max_projects', executer: vi.fn() });
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const fermer = vi.fn();
  act(() => { createRoot(hote).render(createElement(MesProjets, { service, commandes: cmd, magasin, fermer })); });
  return { hote, fermer, cmd };
}
const service = (): ServiceMesProjets & { ouvrir: ReturnType<typeof vi.fn> } => ({ ouvrir: vi.fn(), offres: () => vitrinePlateforme(), plateforme: () => 'https://p.test/acme/projects' });

describe('la commande projet.mesProjets', () => {
  it('ouvre le dialogue, et passe l ouverture d un projet a projet.ouvrir', () => {
    const cmd = creerRegistre(droits());
    const ouvrir = vi.fn();
    brancherMesProjets(cmd, { apiDisponible: true, ouvrir });
    expect(cmd.executer('projet.mesProjets')).toBe(true);
    const p = parcours.courant();
    expect(p?.type).toBe('mesProjets');
    if (p?.type !== 'mesProjets') return;
    p.service.ouvrir('p2');
    expect(ouvrir).toHaveBeenCalledWith('p2');
    expect(p.service.offres()).toBe(vitrinePlateforme());
    expect(p.service.offres()).toMatch(/\/\?product=/);
  });

  it('se grise hors plateforme', () => {
    const cmd = creerRegistre(droits());
    brancherMesProjets(cmd, { apiDisponible: false, ouvrir: vi.fn() });
    expect(cmd.etat('projet.mesProjets').utilisable).toBe(false);
  });
});

describe('le dialogue Mes projets', () => {
  it('liste les projets, le plus recent d abord, dit celui qui est ouvert et ouvre les autres', () => {
    const s = service();
    const { hote, fermer } = monter(s, magasinDe({
      courant: { id: 'b', name: 'Terrasse du haut' },
      liste: [{ id: 'a', name: 'Allée', updatedAt: '2026-11-01T10:00:00Z' }, { id: 'b', name: 'Terrasse du haut', updatedAt: '2026-11-15T10:00:00Z' }],
      quota: { utilise: 2, limite: 5, illimite: false }
    }));
    const lignes = [...hote.querySelectorAll<HTMLButtonElement>('[data-controle="mesProjets.ouvrir"]')];
    expect(lignes.map((b) => b.querySelector('.nomLigneProjet')!.textContent)).toEqual(['Terrasse du haut', 'Allée']);
    expect(lignes[0]!.disabled).toBe(true);
    expect(lignes[0]!.textContent).toContain('ouvert');
    expect(lignes[1]!.textContent).toMatch(/modifié le 1 novembre 2026/);
    expect(hote.textContent).toContain('2 projets sur 5 autorisés par l’abonnement');
    expect(hote.querySelector('[data-controle="mesProjets.offres"]')).toBeNull();
    act(() => { lignes[1]!.click(); });
    expect(fermer).toHaveBeenCalled();
    expect(s.ouvrir).toHaveBeenCalledWith('a');
    expect(hote.querySelector<HTMLAnchorElement>('[data-controle="mesProjets.plateforme"]')!.href).toBe('https://p.test/acme/projects');
  });

  it('limite atteinte : la phrase, « Voir les offres » vers la vitrine, et « Nouveau depuis une adresse » grise avec la raison', () => {
    const { hote } = monter(service(), magasinDe({ liste: [{ id: 'a', name: 'A' }], quota: { utilise: 1, limite: 1, illimite: false } }), 0);
    expect(hote.textContent).toContain('limite atteinte');
    expect(hote.textContent).toContain('passez à une offre qui en compte davantage');
    const offres = hote.querySelector<HTMLAnchorElement>('[data-controle="mesProjets.offres"]')!;
    expect(offres.getAttribute('href')).toBe(vitrinePlateforme());
    expect(offres.target).toBe('_blank');
    const adresse = hote.querySelector<HTMLButtonElement>('[data-commande="projet.depuisAdresse"]')!;
    expect(adresse.disabled).toBe(true);
    expect(hote.querySelector('.refusAuDoigt')!.textContent).toBe('Limite atteinte.');
  });
});

describe('le dialogue de la limite de projets', () => {
  it('propose « Voir les offres », qui ouvre la vitrine de la plateforme', () => {
    const ouvrir = vi.spyOn(window, 'open').mockReturnValue(null);
    signalerLimiteProjets('Limite atteinte.');
    const d = dialogues.courant();
    expect(d?.type).toBe('choix');
    if (d?.type !== 'choix') return;
    expect(d.principal.libelle).toBe('Voir les offres');
    d.principal.executer();
    expect(ouvrir).toHaveBeenCalledWith(vitrinePlateforme(), '_blank', 'noopener');
    dialogues.fermer?.();
    ouvrir.mockRestore();
  });
});
