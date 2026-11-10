import { describe, it, expect, vi } from 'vitest';
import { creerCorpus, texteDuPartage } from '../../../../../src/app/audit/parcelle/corpus.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import type { ClientAudits } from '../../../../../src/io/auditsServeur.js';
import type { FichierAuditParcelle } from '../../../../../src/model/fichierAuditParcelle.js';

// « Partager cet audit pour améliorer Plan » (MD/spec-audit.md §15, decision D7) : cochee par defaut,
// rien ne part avant une validation, chaque envoi remplace le precedent, decocher retire le fichier
// du serveur ; un retrait qui echoue laisse la case cochee. Sans client, la case n'existe pas.

const FICHIER = { format: 'plan-audit-parcelle' } as unknown as FichierAuditParcelle;

function monter(client: ClientAudits | null = null) {
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  const messages: string[] = [];
  const c = creerCorpus({ capture, client: () => client, fichier: async () => FICHIER, signaler: (m) => messages.push(m), maintenant: () => new Date('2026-10-13T09:05:00Z') });
  const valider = () => capture.noterDecision({ t: '2026-10-13T09:00:00Z', acceptees: ['a'], refusees: [], verifies: [] });
  return { c, capture, messages, valider };
}

function faux() {
  let n = 0;
  const client = {
    envoyer: vi.fn(async () => ({ id: 'a' + ++n, retrait: 'r' + n })), retirer: vi.fn(async () => {}),
    remplacer: vi.fn(async (id: string, retrait: string) => ({ id, retrait })), lister: vi.fn(async () => []), lire: vi.fn(async () => ''),
  };
  return client;
}

describe('le partage pour le corpus', () => {
  it('est coche par defaut, et n existe pas sans quelqu un pour envoyer', () => {
    expect(monter().c.etat()).toEqual({ accord: true, envoi: null, disponible: false, enCours: false });
    expect(monter(faux()).c.etat().disponible).toBe(true);
  });

  it('n envoie rien avant une validation, puis remplace le fichier precedent', async () => {
    const client = faux();
    const t = monter(client);
    await t.c.envoyer();
    expect(client.envoyer).not.toHaveBeenCalled();
    t.valider();
    await t.c.envoyer();
    expect(client.envoyer).toHaveBeenCalledWith(FICHIER);
    expect(t.c.etat().envoi).toEqual({ id: 'a1', retrait: 'r1', t: '2026-10-13T09:05:00.000Z' });
    expect(t.messages.at(-1)).toBe('Audit partagé pour améliorer Plan : merci.');
    expect(texteDuPartage(t.c.etat())).toMatch(/^Partagé le 13\/10\/2026, photos comprises\. Décochez pour le retirer/);
    t.valider();
    await t.c.envoyer();
    expect(client.retirer).toHaveBeenCalledWith('a1', 'r1');
    expect(t.c.etat().envoi?.id).toBe('a2');
  });

  it('decocher retire le fichier du serveur ; recocher le renvoie', async () => {
    const client = faux();
    const t = monter(client);
    t.valider();
    await t.c.envoyer();
    t.c.basculer();
    await vi.waitFor(() => expect(t.c.etat()).toMatchObject({ accord: false, envoi: null, enCours: false }));
    expect(client.retirer).toHaveBeenCalledWith('a1', 'r1');
    expect(t.messages.at(-1)).toBe('Audit retiré du serveur de Plan.');
    expect(texteDuPartage(t.c.etat())).toBe('Rien ne quitte cet appareil.');
    // Une validation ne renvoie rien tant que la case est decochee.
    t.valider();
    await t.c.envoyer();
    expect(client.envoyer).toHaveBeenCalledOnce();
    t.c.basculer();
    await vi.waitFor(() => expect(t.c.etat().envoi?.id).toBe('a2'));
  });

  it('un retrait qui echoue laisse la case cochee, un envoi qui echoue le dit', async () => {
    const client = faux();
    const t = monter(client);
    t.valider();
    await t.c.envoyer();
    client.retirer.mockRejectedValueOnce(new Error('réseau'));
    t.c.basculer();
    await vi.waitFor(() => expect(t.c.etat().enCours).toBe(false));
    expect(t.c.etat()).toMatchObject({ accord: true, envoi: { id: 'a1' } });
    expect(t.messages.at(-1)).toMatch(/^Le retrait de l’audit n’a pas abouti/);
    client.envoyer.mockRejectedValueOnce(new Error('partage de l’audit : HTTP 502'));
    await t.c.envoyer();
    expect(t.messages.at(-1)).toBe('Le partage de l’audit n’a pas abouti (partage de l’audit : HTTP 502) : il repartira à la prochaine validation.');
    expect(t.c.etat().envoi?.id).toBe('a1');
  });
});
