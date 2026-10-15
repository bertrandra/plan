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

/** Le dossier ou le serveur a range un audit (`audits/<nature>/<classe>/<id>/`), d'apres son index. */
export function dossierRange(dossier: string, id: string): string {
  const index = JSON.parse(fs.readFileSync(path.join(dossier, 'audits', 'index.json'), 'utf8')) as { audits: Record<string, { dossier: string }> };
  const e = index.audits[id];
  if (!e) throw new Error('audit ' + id + ' absent de l index');
  return path.join(dossier, 'audits', e.dossier);
}

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
  // Range dans son dossier, classe par nature et par parcelle : audits/parcelle/<IDU>/<id>/.
  const range = dossierRange(n.dossier, id);
  expect(path.relative(path.join(n.dossier, 'audits'), range)).toBe(path.join('parcelle', '78650000AE0101', id));
  expect(fs.readFileSync(path.join(range, 'audit.json'), 'utf8')).toBe(texte);
  const fiche = JSON.parse(fs.readFileSync(path.join(range, 'fiche.json'), 'utf8')) as Record<string, unknown>;
  expect(fiche).toMatchObject({ id, organisation: ORGANISATION, nature: 'parcelle', idu: '78650000AE0101', adresse: '2 allée des Limites', taille: Buffer.byteLength(texte) });
  expect(JSON.parse(fs.readFileSync(path.join(range, 'decisions.json'), 'utf8'))).toEqual({ format: 'plan-audit-decisions', version: 1, nature: 'parcelle', propositions: [], decisions: [] });
  // Le serveur n'en garde que l'empreinte du secret.
  expect(JSON.stringify(fiche)).not.toContain(retrait);

  // La liste et la lecture sont a l'administrateur seul.
  expect((await n.navigateur('admin/audits')).status).toBe(401);
  expect((await n.navigateur('admin/audits/' + id)).status).toBe(401);

  // Retirer : le secret, et rien d'autre ; un audit retire n'existe plus.
  const retirer = (secret: string, i = id) => n.navigateur('admin/audits/' + i, { method: 'DELETE', headers: { 'X-Plan-Admin': '1', 'X-Plan-Retrait': secret } });
  expect((await retirer('0'.repeat(48))).status).toBe(403);
  expect((await retirer(retrait)).status).toBe(200);
  expect(fs.existsSync(range)).toBe(false);
  expect((await retirer(retrait)).status).toBe(404);

  // La sauvegarde de la capture (15) : marquee a l'envoi, puis remplacee sous le meme identifiant par
  // son secret ; la fiche dit ses photos et sa phase, pour le catalogue de l'administrateur.
  const ficheDe = (i: string) => JSON.parse(fs.readFileSync(path.join(dossierRange(n.dossier, i), 'fiche.json'), 'utf8')) as Record<string, unknown>;
  const enCapture = { ...(fichierAudit() as Record<string, unknown>), finCapture: null, cloture: { photos: [{ type: 'image/jpeg', base64: 'AAAA' }] } };
  const jeton = { ...ECRITURE, Authorization: 'Bearer ' + JETON };
  expect((await poster({ ...jeton, 'X-Plan-Depot': 'brouillon' })).status).toBe(400);
  const s = await poster({ ...jeton, 'X-Plan-Depot': 'sauvegarde' }, JSON.stringify(enCapture));
  expect(s.status).toBe(201);
  const sauve = await s.json() as { id: string; retrait: string };
  expect(ficheDe(sauve.id)).toMatchObject({ id: sauve.id, organisation: ORGANISATION, idu: '78650000AE0101', marque: 'sauvegarde', photos: 1, phase: 'capture', debut: '2026-10-13T08:00:00.000Z' });
  const fini = JSON.stringify({ ...enCapture, finCapture: '2026-10-13T08:30:00.000Z', cloture: { photos: [{ type: 'image/jpeg', base64: 'AAAA' }, { type: 'image/jpeg', base64: 'BBBB' }] } });
  const remplacer = (i: string, entetes: Record<string, string>, corps = fini) => n.navigateur('admin/audits/' + i, { method: 'PUT', headers: entetes, body: corps });
  expect((await remplacer(sauve.id, { ...jeton, 'X-Plan-Retrait': '0'.repeat(48) })).status).toBe(403);
  expect((await remplacer(sauve.id, { ...ECRITURE, 'X-Plan-Retrait': sauve.retrait })).status).toBe(401);
  expect((await remplacer('20990101-000000-00000000', { ...jeton, 'X-Plan-Retrait': sauve.retrait })).status).toBe(404);
  const r2 = await remplacer(sauve.id, { ...jeton, 'X-Plan-Retrait': sauve.retrait });
  expect(r2.status).toBe(200);
  expect(await r2.json()).toEqual({ id: sauve.id, remplace: true });
  expect(fs.readFileSync(path.join(dossierRange(n.dossier, sauve.id), 'audit.json'), 'utf8')).toBe(fini);
  expect(ficheDe(sauve.id)).toMatchObject({ id: sauve.id, organisation: ORGANISATION, marque: 'sauvegarde', photos: 2, phase: 'analyse', taille: Buffer.byteLength(fini) });
  expect(JSON.stringify(ficheDe(sauve.id))).not.toContain(sauve.retrait);
  // Le meme secret retire toujours le depot remplace.
  expect((await retirer(sauve.retrait, sauve.id)).status).toBe(200);

  // L'administrateur : il depose sans jeton, liste, lit et retire sans secret.
  await n.connecter();
  const a = await poster(ECRITURE);
  expect(a.status).toBe(201);
  const { id: idAdmin } = await a.json() as { id: string };
  const liste = await (await n.navigateur('admin/audits')).json() as { audits: Record<string, unknown>[] };
  // Sans marque, un depot est un partage pour le corpus (les pages d'avant la sauvegarde).
  expect(liste.audits).toEqual([expect.objectContaining({ id: idAdmin, organisation: 'admin', idu: '78650000AE0101', marque: 'corpus', photos: 0, phase: 'capture' })]);
  expect(liste.audits[0]).not.toHaveProperty('retrait');
  expect(await (await n.navigateur('admin/audits/' + idAdmin)).text()).toBe(texte);
  // L'administrateur remplace sans secret (un audit rouvert depuis son catalogue) ; la marque reste.
  expect((await remplacer(idAdmin, ECRITURE)).status).toBe(200);
  expect(await (await n.navigateur('admin/audits/' + idAdmin)).text()).toBe(fini);
  expect(((await (await n.navigateur('admin/audits')).json()) as { audits: Record<string, unknown>[] }).audits[0]).toMatchObject({ id: idAdmin, marque: 'corpus', photos: 2, phase: 'analyse' });
  expect((await n.navigateur('admin/audits/' + idAdmin, { method: 'DELETE', headers: { 'X-Plan-Admin': '1' } })).status).toBe(200);
  expect((await (await n.navigateur('admin/audits')).json() as { audits: unknown[] }).audits).toEqual([]);
}
