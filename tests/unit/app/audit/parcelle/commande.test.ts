import { describe, it, expect, vi, afterEach } from 'vitest';
import { brancherAuditParcelle, parcelleCadastrale, RAISON_SANS_PARCELLE } from '../../../../../src/app/audit/parcelle/commande.js';
import { creerRegistre, PHRASE_PERMISSION, type Droits } from '../../../../../src/app/commandes.js';
import { parcours } from '../../../../../src/app/parcours.js';
import { creerEtat } from '../../../../../src/core/state.js';
import type { ObjetPlan } from '../../../../../src/model/types.js';

// La commande « Auditer la parcelle… » (MD/spec-audit.md §11) : grisee avec sa raison en lecture
// seule ou sans parcelle cadastrale ; elle ouvre la liste de controle, et la meme session a chaque fois.

const parcelle = (cadastre: Record<string, unknown> | null): ObjetPlan => ({ key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], cadastre } as ObjetPlan);
const droits = (ecrire: boolean): Droits => ({ branchee: () => true, aCapacite: () => true, aPermission: (c) => c !== 'projects.write' || ecrire, reste: () => null });

function monter(objets: ObjetPlan[], d?: Droits) {
  const etat = creerEtat({ objects: objets } as never, (o) => o as never);
  const cmd = creerRegistre(d);
  const ouvrir3d = vi.fn();
  const b = brancherAuditParcelle({ etat, ouvrir3d, signaler: () => {}, stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false }, surligner: () => {}, retirerPosition: () => {} }, cmd);
  return { cmd, b, etat };
}

afterEach(() => parcours.fermer());

describe('la commande audit.parcelle', () => {
  it('reconnait une parcelle cadastrale par son calage, et la nomme par son IDU', () => {
    expect(parcelleCadastrale([parcelle({ idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 })])).toBe('78650000AE0101');
    expect(parcelleCadastrale([parcelle({ origineLat: 48.9, origineLon: 2.13 })])).toBe('48.900000,2.130000');
    expect(parcelleCadastrale([parcelle(null)])).toBeNull();
    expect(parcelleCadastrale([])).toBeNull();
  });

  it('est grisee avec sa raison sans parcelle cadastrale', () => {
    const { cmd } = monter([parcelle(null)]);
    expect(cmd.etat('audit.parcelle')).toEqual({ utilisable: false, raison: 'contexte', message: RAISON_SANS_PARCELLE });
    expect(cmd.executer('audit.parcelle')).toBe(false);
    expect(cmd.obtenir('audit.parcelle')).toMatchObject({ libelle: 'Auditer la parcelle…', groupe: 'audit', permission: 'projects.write' });
  });

  it('est grisee avec sa raison en lecture seule', () => {
    const { cmd } = monter([parcelle({ idu: 'X', origineLat: 48.9, origineLon: 2.13 })], droits(false));
    expect(cmd.etat('audit.parcelle')).toEqual({ utilisable: false, raison: 'permission', message: PHRASE_PERMISSION });
  });

  it('ouvre la liste de controle, la meme session a chaque fois', async () => {
    const { cmd, b } = monter([parcelle({ idu: 'X', origineLat: 48.9, origineLon: 2.13 })], droits(true));
    expect(cmd.executer('audit.parcelle')).toBe(true);
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditParcelle'));
    const premiere = b.session();
    parcours.fermer();
    cmd.executer('audit.parcelle');
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditParcelle'));
    expect(b.session()).toBe(premiere);
  });
});
