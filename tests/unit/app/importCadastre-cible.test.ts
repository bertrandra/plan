import { describe, it, expect, vi } from 'vitest';
import { creerImportCadastre, type ContexteImportCadastre } from '../../../src/app/importCadastre.js';

// Un projet neuf de la plateforme (document `{}`) se remplit depuis une adresse : l'import y ecrit
// au lieu d'en creer un second, et garde le nom qu'on lui a donne.

function contexte(cible: { id: string; name: string } | null): ContexteImportCadastre {
  return {
    apiSave: vi.fn().mockResolvedValue({ id: 'x' }), appliquerProjetImporte: vi.fn(), withProjectParam: (id) => '/?projet=' + id,
    apiDisponible: true, cleDernierProjet: 'k', projetCible: () => cible
  };
}

describe('l import cadastre et le projet a remplir', () => {
  it('annonce le projet cible et en reprend le nom', () => {
    const i = creerImportCadastre(contexte({ id: 'p9', name: 'Maison Dupont' }), vi.fn());
    expect(i.projetCible()).toEqual({ id: 'p9', name: 'Maison Dupont' });
    expect(i.nomParDefaut()).toBe('Maison Dupont');
  });

  it('sans cible, n en annonce aucune', () => {
    const i = creerImportCadastre(contexte(null), vi.fn());
    expect(i.projetCible()).toBe(null);
  });
});
