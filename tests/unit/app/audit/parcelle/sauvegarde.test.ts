import { describe, it, expect, vi } from 'vitest';
import { creerSauvegarde, heureDe, octetsUtf8, texteDeLaSauvegarde, type DependancesSauvegarde } from '../../../../../src/app/audit/parcelle/sauvegarde.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { creerSessionAuditParcelle, type ContexteAuditParcelle } from '../../../../../src/app/audit/parcelle/controleur.js';
import { creerEtat } from '../../../../../src/core/state.js';
import { EchecPartageAudit, type ClientAudits } from '../../../../../src/io/auditsServeur.js';
import type { FichierAuditParcelle } from '../../../../../src/model/fichierAuditParcelle.js';
import type { ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La sauvegarde de l'audit de la parcelle sur le serveur de Plan pendant la capture (MD/spec-audit.md
// §15) : un envoi regroupe quelques secondes apres les photos, a « Lancer l'analyse » et a la demande ;
// le meme depot remplace a chaque fois ; hors ligne, un nouvel essai plus tard sans bloquer la capture.

const PHOTO = { type: 'image/jpeg' as const, base64: 'AAAA' };
const MAINTENANT = new Date('2026-10-13T15:42:00Z');

/** Une horloge a la main : les rappels attendent qu'on les fasse partir. */
function horloge() {
  const rappels: { f: () => void; ms: number }[] = [];
  return {
    planifier: (f: () => void, ms: number) => { const r = { f, ms }; rappels.push(r); return () => { const i = rappels.indexOf(r); if (i >= 0) rappels.splice(i, 1); }; },
    rappels,
    async courir() { rappels.splice(0).forEach((r) => r.f()); await vi.waitFor(() => new Promise((ok) => setTimeout(ok, 0))); await new Promise((ok) => setTimeout(ok, 0)); },
  };
}

function faux() {
  let n = 0;
  return {
    envoyer: vi.fn<(f: FichierAuditParcelle | string, m?: string) => Promise<{ id: string; retrait: string }>>(async () => ({ id: 'd' + ++n, retrait: 'r' + n })),
    remplacer: vi.fn<(id: string, retrait: string, f: FichierAuditParcelle | string, m?: string) => Promise<{ id: string; retrait: string }>>(async (id, retrait) => ({ id, retrait })),
    retirer: vi.fn(async () => {}), lister: vi.fn(async () => []), lire: vi.fn(async () => ''),
  };
}

function monter(client: ClientAudits | null, plus: Partial<DependancesSauvegarde> = {}) {
  const capture = creerCapture('78650000AE0101', () => MAINTENANT);
  const h = horloge();
  let reseau: (() => void) | null = null;
  const s = creerSauvegarde({
    capture, client: () => client, fichier: async () => ({ format: 'plan-audit-parcelle', photos: capture.lire().cloture.photos.length } as unknown as FichierAuditParcelle),
    automatique: () => true, maintenant: () => MAINTENANT, planifier: h.planifier, surReseau: (f) => { reseau = f; return () => {}; }, ...plus,
  });
  return { s, capture, h, reseau: () => reseau?.() };
}

describe('la sauvegarde sur le serveur', () => {
  it('n existe pas sans quelqu un pour envoyer', async () => {
    const t = monter(null);
    expect(t.s.etat()).toMatchObject({ etat: 'repos', disponible: false });
    t.s.planifier();
    expect(t.h.rappels).toHaveLength(0);
    expect(await t.s.envoyer()).toBe(false);
  });

  it('regroupe les photos d une rafale en un seul envoi, marque sauvegarde, puis remplace le meme depot', async () => {
    const client = faux();
    const t = monter(client, { delaiMs: 5000 });
    t.s.planifier(); t.s.planifier(); t.s.planifier();
    expect(t.h.rappels.map((r) => r.ms)).toEqual([5000]);
    expect(t.s.etat().etat).toBe('attente');
    expect(texteDeLaSauvegarde(t.s.etat(), MAINTENANT)).toBe('Envoi au serveur dans quelques secondes…');
    await t.h.courir();
    expect(client.envoyer).toHaveBeenCalledOnce();
    expect(client.envoyer.mock.calls[0]?.[1]).toBe('sauvegarde');
    expect(t.capture.lire().sauvegarde).toEqual({ id: 'd1', retrait: 'r1', t: MAINTENANT.toISOString() });
    expect(t.s.etat()).toMatchObject({ etat: 'envoye', t: MAINTENANT.toISOString(), dernier: MAINTENANT.toISOString() });
    expect(texteDeLaSauvegarde(t.s.etat(), MAINTENANT)).toBe('Envoyé à ' + heureDe(MAINTENANT.toISOString()) + '. Chaque photo y part aussi, quelques secondes après.');
    // L'envoi suivant remplace le meme depot, par son identifiant et son secret.
    expect(await t.s.envoyer()).toBe(true);
    expect(client.envoyer).toHaveBeenCalledOnce();
    expect(client.remplacer).toHaveBeenCalledWith('d1', 'r1', expect.any(String), 'sauvegarde');
  });

  it('refait un depot quand l ancien a ete retire du serveur', async () => {
    const client = faux();
    const t = monter(client);
    t.capture.noterSauvegarde({ id: 'ancien', retrait: 'r0', t: '2026-10-12T10:00:00.000Z' });
    client.remplacer.mockRejectedValueOnce(new EchecPartageAudit('envoi de l’audit : Aucun audit', 404));
    expect(await t.s.envoyer()).toBe(true);
    expect(t.capture.lire().sauvegarde?.id).toBe('d1');
  });

  it('hors ligne, attend le reseau et reessaie plus tard, sans bloquer la capture', async () => {
    const client = faux();
    const t = monter(client, { reessaisMs: [15000, 60000] });
    client.envoyer.mockRejectedValueOnce(new EchecPartageAudit('partage de l’audit : Failed to fetch')).mockRejectedValueOnce(new EchecPartageAudit('partage de l’audit : Failed to fetch'));
    expect(await t.s.envoyer()).toBe(false);
    const e = t.s.etat();
    expect(e).toMatchObject({ etat: 'reessai', horsLigne: true, essai: new Date(MAINTENANT.getTime() + 15000).toISOString() });
    expect(texteDeLaSauvegarde(e, MAINTENANT)).toBe('En attente de réseau, nouvel essai à ' + heureDe(new Date(MAINTENANT.getTime() + 15000).toISOString()) + '.');
    // La capture continue pendant ce temps.
    expect(t.capture.ajouterPhotoCloture(PHOTO)).toBe(true);
    expect(t.h.rappels.map((r) => r.ms)).toEqual([15000]);
    await t.h.courir();
    // Le deuxieme essai echoue aussi : le suivant est plus espace.
    expect(t.h.rappels.map((r) => r.ms)).toEqual([60000]);
    // Le reseau revient : l'essai part sans attendre son heure.
    t.reseau();
    await vi.waitFor(() => expect(t.s.etat().etat).toBe('envoye'));
    expect(client.envoyer).toHaveBeenCalledTimes(3);
    expect(t.h.rappels).toHaveLength(0);
  });

  it('un serveur indisponible se reessaie, un refus se dit sans insister', async () => {
    const client = faux();
    const t = monter(client);
    client.envoyer.mockRejectedValueOnce(new EchecPartageAudit('partage de l’audit : HTTP 502', 502));
    await t.s.envoyer();
    expect(t.s.etat()).toMatchObject({ etat: 'reessai', horsLigne: false, message: 'HTTP 502' });
    expect(texteDeLaSauvegarde(t.s.etat(), MAINTENANT)).toMatch(/^Le serveur n’a pas répondu \(HTTP 502\), nouvel essai à /);
    t.h.rappels.splice(0);
    client.envoyer.mockRejectedValueOnce(new EchecPartageAudit('partage de l’audit : Jeton de la plateforme refusé.', 401));
    await t.s.envoyer();
    expect(t.s.etat()).toMatchObject({ etat: 'erreur', message: 'Jeton de la plateforme refusé.' });
    expect(texteDeLaSauvegarde(t.s.etat(), MAINTENANT)).toBe('L’envoi n’a pas abouti : Jeton de la plateforme refusé.');
    expect(t.h.rappels).toHaveLength(0);
  });

  it('dit la taille quand l audit depasse ce que le serveur accepte, sans rien envoyer', async () => {
    const client = faux();
    const t = monter(client, { tailleMax: 10 });
    expect(await t.s.envoyer()).toBe(false);
    expect(client.envoyer).not.toHaveBeenCalled();
    expect(t.s.etat()).toMatchObject({ etat: 'tropGros', max: 10 });
    expect(texteDeLaSauvegarde({ ...t.s.etat(), etat: 'tropGros', octets: 52 * 1024 * 1024, max: 48 * 1024 * 1024 } as never, MAINTENANT))
      .toBe('L’audit pèse 52 Mo : le serveur de Plan en accepte 48 Mo au plus. Retirez quelques photos pour qu’il puisse partir.');
    // Le refus d'un hebergement plus strict (post_max_size) est montre tel quel.
    const t2 = monter(client);
    client.envoyer.mockRejectedValueOnce(new EchecPartageAudit('partage de l’audit : Fichier d’audit trop gros pour ce serveur (9 Mo ; post_max_size = 8M…)', 413));
    await t2.s.envoyer();
    expect(texteDeLaSauvegarde(t2.s.etat(), MAINTENANT)).toMatch(/^L’envoi n’a pas abouti : le serveur le refuse, trop gros \(Fichier d’audit trop gros pour ce serveur \(9 Mo ; post_max_size = 8M/);
  });

  it('sans envoi automatique, rien ne part sans le bouton', async () => {
    const client = faux();
    const t = monter(client, { automatique: () => false });
    t.s.planifier();
    expect(t.h.rappels).toHaveLength(0);
    expect(texteDeLaSauvegarde(t.s.etat(), MAINTENANT)).toBe('Rien n’est encore parti : l’envoi met l’audit à l’abri sur le serveur de Plan.');
    expect(await t.s.envoyer()).toBe(true);
  });

  it('un envoi pendant un autre repart juste apres, avec ce qui a change', async () => {
    const client = faux();
    const attente: { finir?: () => void } = {};
    client.envoyer.mockImplementationOnce(() => new Promise((ok) => { attente.finir = () => ok({ id: 'd1', retrait: 'r1' }); }));
    const t = monter(client);
    const premier = t.s.envoyer();
    await vi.waitFor(() => expect(attente.finir).toBeDefined());
    t.s.planifier();
    expect(t.s.etat().etat).toBe('envoi');
    attente.finir?.();
    await premier;
    expect(t.h.rappels.map((r) => r.ms)).toEqual([0]);
    await t.h.courir();
    expect(client.remplacer).toHaveBeenCalledWith('d1', 'r1', expect.any(String), 'sauvegarde');
  });

  it('retire le depot du serveur', async () => {
    const client = faux();
    const t = monter(client);
    await t.s.envoyer();
    await t.s.retirer();
    expect(client.retirer).toHaveBeenCalledWith('d1', 'r1');
    expect(t.capture.lire().sauvegarde).toBeNull();
    expect(t.s.etat().etat).toBe('repos');
  });

  it('compte les octets comme le serveur', () => {
    expect(octetsUtf8('abc')).toBe(3);
    expect(octetsUtf8('allée')).toBe(6);
    expect(octetsUtf8('’')).toBe(3);
    expect(octetsUtf8('😀')).toBe(4);
  });
});

// ---- Dans la session de l'audit : les photos, « Lancer l'analyse », le partage decoche -----------

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);

function session(client: ClientAudits, plus: Partial<ContexteAuditParcelle> = {}) {
  const etat = creerEtat({ objects: [
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', adresse: '2 allée des Limites', origineLat: 48.9, origineLon: 2.13 } }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 20), elevation: 6 }),
  ] } as never, (o) => o as never);
  const h = horloge();
  const lireGrille = vi.fn(async () => null);
  const s = creerSessionAuditParcelle({
    etat, idu: '78650000AE0101', ouvrir3d: vi.fn(), signaler: () => {}, stockage: null, suivre: () => () => {},
    boussole: { suivre: () => () => {}, autoriser: async () => false }, surligner: () => {}, retirerPosition: () => {},
    maintenant: () => MAINTENANT, audits: () => client, lireGrille, sauvegarde: { planifier: h.planifier, surReseau: () => () => {}, delaiMs: 5000 },
    ...plus,
  });
  return { s, h, lireGrille };
}

const fichierEnvoye = (c: ReturnType<typeof faux>, i: number, quoi: 'envoyer' | 'remplacer' = 'envoyer') => {
  const appel = c[quoi].mock.calls[i] as unknown[] | undefined;
  return JSON.parse(String(quoi === 'envoyer' ? appel?.[0] : appel?.[2])) as FichierAuditParcelle;
};

describe('la sauvegarde dans la session de l audit', () => {
  it('part quelques secondes apres les photos, une fois pour la rafale, puis remplace le meme depot', async () => {
    const client = faux();
    const t = session(client);
    t.s.capture.ajouterPhotoFacade('maison', 0, PHOTO);
    t.s.capture.ajouterPhotoFacade('maison', 0, PHOTO);
    // Une note tapee n'est pas une photo : elle ne fait rien partir.
    t.s.capture.noterVu('maison', { forme: 'deux-pans' });
    expect(t.h.rappels.map((r) => r.ms)).toEqual([5000]);
    await t.h.courir();
    await vi.waitFor(() => expect(t.s.capture.lire().sauvegarde).toBeTruthy());
    expect(client.envoyer).toHaveBeenCalledOnce();
    const f = fichierEnvoye(client, 0);
    expect(f).toMatchObject({ format: 'plan-audit-parcelle', finCapture: null, parcelle: { idu: '78650000AE0101' } });
    expect(f.batiments.find((b) => b.cle === 'maison')?.facades.find((x) => x.cote === 0)?.photos).toHaveLength(2);
    expect(client.envoyer.mock.calls[0]?.[1]).toBe('sauvegarde');
    // Le secret reste avec la capture, sur l'appareil ; le fichier ne le recopie pas.
    expect(t.s.capture.lire().sauvegarde).toMatchObject({ id: 'd1', retrait: 'r1' });
    expect(JSON.stringify(f)).not.toContain('r1');
    t.s.capture.ajouterPhotoFacade('maison', 1, PHOTO);
    await t.h.courir();
    await vi.waitFor(() => expect(client.remplacer).toHaveBeenCalledOnce());
    expect(client.remplacer.mock.calls[0]?.slice(0, 2)).toEqual(['d1', 'r1']);
    expect(client.envoyer).toHaveBeenCalledOnce();
    // La grille LiDAR de la maison n'est demandee qu'une fois : elle n'avait rien rendu, elle est redemandee.
    expect(t.lireGrille).toHaveBeenCalledTimes(2);
  });

  it('part a « Lancer l analyse », la capture terminee', async () => {
    const client = faux();
    const t = session(client);
    t.s.capture.ajouterPhotoFacade('maison', 0, PHOTO);
    t.s.lancerAnalyse();
    // L'envoi regroupe en attente est remplace par l'envoi immediat.
    await vi.waitFor(() => expect(client.envoyer).toHaveBeenCalledOnce());
    expect(fichierEnvoye(client, 0).finCapture).toBe(MAINTENANT.toISOString());
    expect(t.h.rappels).toHaveLength(0);
  });

  it('hors ligne, la capture continue et l envoi repart plus tard', async () => {
    const client = faux();
    client.envoyer.mockRejectedValueOnce(new EchecPartageAudit('partage de l’audit : Failed to fetch'));
    const t = session(client);
    t.s.capture.ajouterPhotoFacade('maison', 0, PHOTO);
    await t.h.courir();
    await vi.waitFor(() => expect(t.s.sauvegarde.etat().etat).toBe('reessai'));
    expect(t.s.capture.ajouterPhotoFacade('maison', 1, PHOTO)).toBe(true);
    await t.h.courir();
    await vi.waitFor(() => expect(t.s.sauvegarde.etat().etat).toBe('envoye'));
    expect(fichierEnvoye(client, 1).batiments.find((b) => b.cle === 'maison')?.facades.filter((x) => x.photos.length)).toHaveLength(2);
  });

  it('un utilisateur qui decoche le partage reprend aussi sa sauvegarde ; l administrateur la garde', async () => {
    const client = faux();
    const t = session(client);
    await t.s.sauvegarde.envoyer();
    t.s.corpus.basculer();
    await vi.waitFor(() => expect(client.retirer).toHaveBeenCalledWith('d1', 'r1'));
    expect(t.s.capture.lire().sauvegarde).toBeNull();
    // Sans l'accord, rien ne part de lui-meme.
    t.s.capture.ajouterPhotoFacade('maison', 0, PHOTO);
    expect(t.h.rappels).toHaveLength(0);
    const admin = faux();
    const a = session(admin, { admin: () => true });
    await a.s.sauvegarde.envoyer();
    a.s.corpus.basculer();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(admin.retirer).not.toHaveBeenCalled();
    a.s.capture.ajouterPhotoFacade('maison', 0, PHOTO);
    expect(a.h.rappels).toHaveLength(1);
  });
});
