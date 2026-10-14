// Le scenario des audits partages (`admin/audits`, MD/spec-audit.md 15, lot L21), joue tel quel
// contre deploy/analyse.php et buildsg/analyseAdmin.mjs : les deux serveurs tiennent le meme contrat.

import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { fichierAudit, JETON, ORGANISATION, type ContextePlateforme } from './contextePlateforme.js';

export interface NavigationAudits {
  /** Une requete du navigateur, avec le cookie de la session admin quand elle est ouverte. */
  navigateur(entree: string, init?: RequestInit): Promise<Response>;
  /** Ouvre la session admin. */
  connecter(): Promise<void>;
  /** Le dossier des donnees de l'admin. */
  dossier: string;
}

const ECRITURE = { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' };

export async function jouerScenarioAudits(n: NavigationAudits, plateforme: ContextePlateforme): Promise<void> {
  const texte = JSON.stringify(fichierAudit());
  const poster = (entetes: Record<string, string>, corps = texte) => n.navigateur('admin/audits', { method: 'POST', headers: entetes, body: corps });

  // Ni session ni jeton, un jeton refuse, ou sans l'en-tete d'ecriture : rien n'est range.
  expect((await poster(ECRITURE)).status).toBe(401);
  const refuse = await poster({ ...ECRITURE, Authorization: 'Bearer jeton-inconnu-0123456789' });
  expect(refuse.status).toBe(401);
  expect((await refuse.json() as { error: { message: string } }).error.message).toBe('Jeton de la plateforme refusé.');
  expect((await poster({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + JETON })).status).toBe(403);
  expect((await poster({ ...ECRITURE, Authorization: 'Bearer ' + JETON }, '{"format":"plan-promenade"}')).status).toBe(400);
  expect(fs.existsSync(path.join(n.dossier, 'audits')) ? fs.readdirSync(path.join(n.dossier, 'audits')).filter((x) => !x.startsWith('.')) : []).toEqual([]);

  // Un utilisateur, par son jeton : le fichier est range tel qu'il est arrive, avec son organisation.
  const r = await poster({ ...ECRITURE, Authorization: 'Bearer ' + JETON });
  expect(r.status).toBe(201);
  const { id, retrait } = await r.json() as { id: string; retrait: string };
  expect(id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{8}$/);
  expect(retrait).toMatch(/^[0-9a-f]{48}$/);
  expect(plateforme.entetes.at(-1)).toMatchObject({ authorization: 'Bearer ' + JETON, 'x-product': 'plan' });
  expect(fs.readFileSync(path.join(n.dossier, 'audits', id + '.json'), 'utf8')).toBe(texte);
  const fiche = JSON.parse(fs.readFileSync(path.join(n.dossier, 'audits', id + '.fiche.json'), 'utf8')) as Record<string, unknown>;
  expect(fiche).toMatchObject({ id, organisation: ORGANISATION, idu: '78650000AE0101', adresse: '2 allée des Limites', taille: Buffer.byteLength(texte) });
  // Le serveur n'en garde que l'empreinte du secret.
  expect(JSON.stringify(fiche)).not.toContain(retrait);

  // La liste et la lecture sont a l'administrateur seul.
  expect((await n.navigateur('admin/audits')).status).toBe(401);
  expect((await n.navigateur('admin/audits/' + id)).status).toBe(401);

  // Retirer : le secret, et rien d'autre ; un audit retire n'existe plus.
  const retirer = (secret: string) => n.navigateur('admin/audits/' + id, { method: 'DELETE', headers: { 'X-Plan-Admin': '1', 'X-Plan-Retrait': secret } });
  expect((await retirer('0'.repeat(48))).status).toBe(403);
  expect((await retirer(retrait)).status).toBe(200);
  expect(fs.existsSync(path.join(n.dossier, 'audits', id + '.json'))).toBe(false);
  expect((await retirer(retrait)).status).toBe(404);

  // L'administrateur : il depose sans jeton, liste, lit et retire sans secret.
  await n.connecter();
  const a = await poster(ECRITURE);
  expect(a.status).toBe(201);
  const { id: idAdmin } = await a.json() as { id: string };
  const liste = await (await n.navigateur('admin/audits')).json() as { audits: Record<string, unknown>[] };
  expect(liste.audits).toEqual([expect.objectContaining({ id: idAdmin, organisation: 'admin', idu: '78650000AE0101' })]);
  expect(liste.audits[0]).not.toHaveProperty('retrait');
  expect(await (await n.navigateur('admin/audits/' + idAdmin)).text()).toBe(texte);
  expect((await n.navigateur('admin/audits/' + idAdmin, { method: 'DELETE', headers: { 'X-Plan-Admin': '1' } })).status).toBe(200);
  expect((await (await n.navigateur('admin/audits')).json() as { audits: unknown[] }).audits).toEqual([]);
}
