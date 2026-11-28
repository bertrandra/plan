import { describe, it, expect, vi } from 'vitest';

const toasts: string[] = [];
vi.mock('../../../src/shell/dialogs.js', () => ({ showToast: (m: string) => { toasts.push(m); }, showErrBanner: () => {}, showErreur: () => {}, showConfirm: () => {} }));

import {
  poserAcces, droitsCourants, capacitesForceesSansDroit, avertissementCapacitesForcees, prevenirAdminDesCapacitesForcees, ligneAdminCapacitesForcees,
  entrerEnAdmin, CAPACITES_FORCEES
} from '../../../src/app/acces.js';
import type { ServiceContexte } from '../../../src/plateforme/contexte.js';
import type { Session } from '../../../src/plateforme/session.js';

// `plan.relief` est accordee en dur a tous les comptes (decision du 7 octobre 2026) tant que la
// plateforme ne l'attribue pas ; l'admin, lui, en est prevenu a l'ouverture.

function brancher(capacites: string[], roles: string[]): void {
  const contexte = {
    courant: () => ({ roles, capabilities: capacites }),
    aCapacite: (c: string) => capacites.includes(c),
    aPermission: () => true,
    quota: () => null
  } as unknown as ServiceContexte;
  poserAcces({} as Session, contexte);
}

describe('les capacites forcees en dur', () => {
  it('accordent plan.relief a tout compte, sans toucher aux autres capacites', () => {
    expect(CAPACITES_FORCEES).toEqual(['plan.relief']);
    brancher(['plan.cadastre'], ['member']);
    const d = droitsCourants();
    expect(d.aCapacite('plan.relief')).toBe(true);
    expect(d.aCapacite('plan.cadastre')).toBe(true);
    expect(d.aCapacite('plan.export.dossier')).toBe(false);
    expect(capacitesForceesSansDroit()).toEqual(['plan.relief']);
  });

  it('ne previennent pas un membre, previennent un administrateur du locataire', () => {
    brancher([], ['member']);
    expect(avertissementCapacitesForcees()).toBeNull();
    brancher([], ['tenant_admin']);
    const texte = avertissementCapacitesForcees()!;
    expect(texte).toContain('Avertissement administrateur');
    expect(texte).toContain('plan.relief');
    expect(texte).toContain('backprod');
    // Plus de toast a l'ouverture (audit UX de la 5.45.0, constat 1) : la console, et une ligne en tete du menu Admin.
    toasts.length = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    prevenirAdminDesCapacitesForcees();
    expect(toasts).toEqual([]);
    expect(warn).toHaveBeenCalledWith(texte);
    warn.mockRestore();
    const ligne = ligneAdminCapacitesForcees()!;
    expect(ligne).toBe('Relief du terrain (IGN) est ouvert à tous les comptes, sans attendre la plateforme, qui ne l’attribue pas encore à ce compte.');
    expect(ligne).not.toMatch(/acces\.ts|CAPACITES_FORCEES|backprod/);
  });

  it('se taisent quand la plateforme attribue deja la capacite', () => {
    brancher(['plan.relief'], ['tenant_admin']);
    expect(capacitesForceesSansDroit()).toEqual([]);
    expect(avertissementCapacitesForcees()).toBeNull();
    expect(ligneAdminCapacitesForcees()).toBeNull();
  });

  it('previennent l admin des demos', () => {
    brancher([], ['member']);
    entrerEnAdmin();
    expect(avertissementCapacitesForcees()).toContain('plan.relief');
  });
});
