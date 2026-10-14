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

describe('la commande audit.importerParcelle', () => {
  /** Un fichier d'audit minimal de cette parcelle : une capture vide, rien a proposer. */
  const fichier = (idu: string) => JSON.stringify({
    format: 'plan-audit-parcelle', version: 1, parcelle: { idu, adresse: null, origine: null }, code: { version: '2.2.0', commit: null },
    regles: { lectureToits: 1, lectureMurs: 2 }, debut: '2026-10-13T08:00:00.000Z', finCapture: '2026-10-13T08:30:00.000Z', ecritLe: '2026-10-13T09:00:00.000Z',
    batiments: [], cloture: { photos: [] }, portail: { photos: [] }, propositions: [], decisions: [],
  });

  function monterImport(objets: ObjetPlan[], texte: string) {
    const etat = creerEtat({ objects: objets } as never, (o) => o as never);
    const cmd = creerRegistre(droits(true));
    const messages: string[] = [];
    brancherAuditParcelle({
      etat, ouvrir3d: vi.fn(), signaler: (m) => messages.push(m), stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false },
      surligner: () => {}, retirerPosition: () => {}, choisirFichier: (f) => f(texte),
    }, cmd);
    return { cmd, messages };
  }

  it('est grisee avec sa raison sans parcelle cadastrale', () => {
    const { cmd } = monterImport([parcelle(null)], fichier('X'));
    expect(cmd.etat('audit.importerParcelle')).toEqual({ utilisable: false, raison: 'contexte', message: RAISON_SANS_PARCELLE });
    expect(cmd.obtenir('audit.importerParcelle')).toMatchObject({ libelle: 'Importer un audit de parcelle…', groupe: 'audit', permission: 'projects.write' });
  });

  it('refuse le fichier d une autre parcelle, sans rien ouvrir', () => {
    const { cmd, messages } = monterImport([parcelle({ idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 })], fichier('78650000AE0103'));
    cmd.executer('audit.importerParcelle');
    expect(messages).toEqual(['Import refusé : Ce fichier est l’audit de la parcelle 78650000AE0103, ce projet est sur la parcelle 78650000AE0101 : ouvrez le projet de cette parcelle.']);
    expect(parcours.courant()).toBeNull();
  });

  it('reprend le fichier de la meme parcelle sur ses propositions', async () => {
    const { cmd, messages } = monterImport([parcelle({ idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 })], fichier('78650000AE0101'));
    cmd.executer('audit.importerParcelle');
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditParcelle'));
    const p = parcours.courant();
    expect(p?.type === 'auditParcelle' ? p.session.ecran() : null).toBe('propositions');
    expect(messages.at(-1)).toBe('Audit de la parcelle importé. Vérifiez les cases, puis « Valider ».');
  });
});
