import { describe, it, expect, vi } from 'vitest';
import { creerDepotPlateforme } from '../../../src/io/depotPlateforme.js';
import { EchecPlateforme, type Session } from '../../../src/plateforme/session.js';
import type { ObjetBrut } from '../../../src/model/types.js';

// Le numero de schema est le seul contrat de forme avec la plateforme : c'est lui que ce fichier
// verifie, dans les deux sens, et ce qu'on dit quand elle le refuse.

function session(reponse: (id: string, options: Record<string, unknown>) => unknown) {
  const appeler = vi.fn(async (id: string, options: Record<string, unknown> = {}) => reponse(id, options));
  return { s: { appeler } as unknown as Session, appeler };
}

const plan: ObjetBrut[] = [{ key: 'b', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } as ObjetBrut];
const avecReleve: ObjetBrut[] = [{ ...plan[0], facades: [{ cote: 0 }] } as unknown as ObjetBrut];
const RESUME = { id: 'p1', name: 'Jardin', updated_at: '2026-09-29T10:00:00Z', deleted_at: null };

const corps = (appeler: ReturnType<typeof vi.fn>) => (appeler.mock.calls[0]?.[1] as { corps: Record<string, unknown> }).corps;

describe('le schema ecrit', () => {
  it('est le plus petit qui decrit le document quand l appelant ne le dit pas (la demonstration)', async () => {
    const { s, appeler } = session(() => RESUME);
    await creerDepotPlateforme(s).enregistrer({ name: 'Parcelle AE 101', objects: plan });
    expect(appeler.mock.calls[0]?.[0]).toBe('createProject');
    expect(corps(appeler).schema_version).toBe(1);
  });

  it('monte a 2 pour un document qui porte un releve', async () => {
    const { s, appeler } = session(() => RESUME);
    await creerDepotPlateforme(s).enregistrer({ name: 'Maison', objects: avecReleve });
    expect(corps(appeler).schema_version).toBe(2);
  });

  it('est celui que l appelant declare, quand il le declare (un projet mis a jour)', async () => {
    const { s, appeler } = session(() => RESUME);
    await creerDepotPlateforme(s).enregistrer({ id: 'p1', name: 'Jardin', objects: plan, schemaVersion: 2 } as never);
    expect(appeler.mock.calls[0]?.[0]).toBe('updateProject');
    expect(corps(appeler).schema_version).toBe(2);
  });
});

describe('le schema lu', () => {
  it('rend la colonne schema_version avec le document', async () => {
    const { s } = session(() => ({ ...RESUME, schema_version: 1, document: { objects: plan } }));
    const p = await creerDepotPlateforme(s).ouvrir('p1');
    expect(p.schemaVersion).toBe(1);
    expect(p.objects).toEqual(plan);
  });

  it('vaut 1 quand la plateforme ne la rend pas', async () => {
    const { s } = session(() => ({ ...RESUME, document: { objects: plan } }));
    expect((await creerDepotPlateforme(s).ouvrir('p1')).schemaVersion).toBe(1);
  });
});

describe('un schema que la plateforme ne connait pas encore', () => {
  const refus = new EchecPlateforme({
    code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'Unsupported schema version.', statut: 422,
    details: { schema_version: 2, supported: [1] }, requestId: 'req-42'
  });

  it('se dit en clair : quel schema, lesquels sont acceptes, et qui peut y remedier', async () => {
    const { s } = session(() => { throw refus; });
    const e = await creerDepotPlateforme(s).enregistrer({ id: 'p1', objects: avecReleve }).catch((x) => x);
    expect(e.reason).toBe('server');
    expect(e.message).toMatch(/schéma 2/);
    expect(e.message).toMatch(/acceptés : 1/);
    expect(e.message).toMatch(/project_schema_versions/);
    expect(e.message).toMatch(/req-42/);
    expect(e.message).not.toMatch(/^.*UNSUPPORTED_SCHEMA_VERSION/);
  });

  it('les autres refus gardent leur code brut', async () => {
    const autre = new EchecPlateforme({ code: 'VALIDATION_FAILED', message: 'x', statut: 422, details: {}, requestId: '' });
    const { s } = session(() => { throw autre; });
    const e = await creerDepotPlateforme(s).enregistrer({ id: 'p1', objects: plan }).catch((x) => x);
    expect(e.message).toMatch(/VALIDATION_FAILED/);
  });
});

describe('un projet neuf, au document vide', () => {
  it('s ouvre en plan vide, marque nouveau, avec le nom de la plateforme', async () => {
    const { s } = session(() => ({ ...RESUME, document: {} }));
    const p = await creerDepotPlateforme(s).ouvrir('p1');
    expect(p.nouveau).toBe(true);
    expect(p.objects).toEqual([]);
    expect(p.meta).toEqual({ id: 'p1', name: 'Jardin', updatedAt: RESUME.updated_at });
  });

  it('de meme sans document du tout', async () => {
    const { s } = session(() => ({ ...RESUME, document: null }));
    expect((await creerDepotPlateforme(s).ouvrir('p1')).nouveau).toBe(true);
  });

  it('mais un document d un autre produit reste refuse', async () => {
    const { s } = session(() => ({ ...RESUME, document: { walls: [] } }));
    await expect(creerDepotPlateforme(s).ouvrir('p1')).rejects.toMatchObject({ reason: 'badjson' });
  });

  it('un plan ouvert normalement n est pas marque nouveau', async () => {
    const { s } = session(() => ({ ...RESUME, document: { objects: plan } }));
    expect((await creerDepotPlateforme(s).ouvrir('p1')).nouveau).toBeUndefined();
  });
});

describe('la limite de projets, vue de la plateforme', () => {
  it('traduit QUOTA_EXCEEDED en phrase, avec ses nombres', async () => {
    const refus = new EchecPlateforme({ code: 'QUOTA_EXCEEDED', message: 'The tenant has used all of this allowance.', statut: 403,
      details: { capability: 'max_projects', limit: 1, used: 1 }, requestId: 'req-7' });
    const { s } = session(() => { throw refus; });
    const e = await creerDepotPlateforme(s).enregistrer({ name: 'Copie', objects: plan }).catch((x: Error) => x) as Error;
    expect(e.message).toContain('1 projet pour 1 autorisé');
    expect(e.message).not.toContain('QUOTA_EXCEEDED');
  });
});

describe('un contenu embarque, refuse par la plateforme', () => {
  it('nomme le champ refuse et sa taille, et garde le code et la reference', async () => {
    const refus = new EchecPlateforme({ code: 'EMBEDDED_ASSET_REJECTED', message: 'Project documents may not embed assets.', statut: 422,
      details: { path: 'objects/0/relief/zCode', reason: 'string longer than the limit', limit_bytes: 65536, size_bytes: 109000 }, requestId: '44c4cae8' });
    const { s } = session(() => { throw refus; });
    const e = await creerDepotPlateforme(s).enregistrer({ name: 'Parcelle', objects: plan }).catch((x: Error) => x) as Error & { reason: string };
    expect(e.reason).toBe('server');
    expect(e.message).toContain('champ « objects/0/relief/zCode » (106 Kio)');
    expect(e.message).toContain('EMBEDDED_ASSET_REJECTED (44c4cae8)');
  });
});
