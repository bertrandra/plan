// Le scenario des mesures de conformite (`admin/conformite`, MD/spec-regles-toits.md 13.5, lot G3),
// joue tel quel contre deploy/analyse.php et buildsg/analyseAdmin.mjs : les deux serveurs tiennent le
// meme contrat, et la page (io/depotDemos.ts) ne sait pas lequel lui repond.

import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { enregistrerMesureConformite, lireMesuresConformiteServeur } from '../../../src/io/depotDemos.js';
import { lireMesuresConformite, mesureConformite, type VerdictCas } from '../../../src/model/conformite.js';

export interface NavigationConformite {
  navigateur(entree: string, init?: RequestInit): Promise<Response>;
  connecter(): Promise<void>;
  dossier: string;
}

const verdict = (etat: VerdictCas['etat']): VerdictCas => ({
  source: 'corpus', fichier: 'audit.json', id: 'c1', cle: 'b', statut: 'valide', etat, forme: 'deux-pans', region: '78', problemes: [], assertions: [], nonVerifiees: [],
});

/** Une mesure comme l'ecran l'envoie, le jour `t`. */
export const mesureEssai = (t: string, etats: VerdictCas['etat'][] = ['conforme', 'non-conforme']) => mesureConformite({
  t: new Date(t), code: { version: '2.2.0', commit: 'abc1234' }, lecture: { toits: 1, reglages: '3b9b6b2c', faits: 'e27f2638' },
  corpus: etats.map(verdict), audits: [], auditsLus: 0,
});

export async function jouerScenarioConformite(n: NavigationConformite): Promise<void> {
  const f = (e: string, i?: RequestInit) => n.navigateur(e, i);
  const poster = (corps: unknown, entetes: Record<string, string> = { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }) =>
    n.navigateur('admin/conformite', { method: 'POST', headers: entetes, body: JSON.stringify(corps) });

  // Sans session : ni lecture ni ecriture.
  expect((await n.navigateur('admin/conformite')).status).toBe(401);
  expect((await poster(mesureEssai('2026-10-14T10:00:00Z'))).status).toBe(401);

  await n.connecter();
  // Rien encore : un historique vide, pas une erreur.
  expect(lireMesuresConformite(await lireMesuresConformiteServeur(f))).toEqual([]);
  // L'en-tete d'ecriture, et une mesure qui en a la forme.
  expect((await poster(mesureEssai('2026-10-14T10:00:00Z'), { 'Content-Type': 'application/json' })).status).toBe(403);
  expect((await poster({ format: 'plan-conformite-mesure', version: 2 })).status).toBe(400);
  expect((await poster({ ...mesureEssai('2026-10-14T10:00:00Z'), toits: { total: -1 } })).status).toBe(400);
  expect((await poster({ ...mesureEssai('2026-10-14T10:00:00Z'), cas: 'tous' })).status).toBe(400);
  expect((await n.navigateur('admin/conformite', { method: 'DELETE', headers: { 'X-Plan-Admin': '1' } })).status).toBe(405);
  expect(fs.existsSync(path.join(n.dossier, 'conformite', 'mesures.json'))).toBe(false);

  // Deux mesures, par le client de la page : l'historique les garde dans l'ordre, avec l'heure de reception.
  await enregistrerMesureConformite(f, mesureEssai('2026-10-01T09:00:00Z', ['non-conforme', 'non-conforme']));
  const r = await enregistrerMesureConformite(f, mesureEssai('2026-10-14T10:00:00Z'));
  expect(r).toMatchObject({ mesures: 2 });
  const lu = lireMesuresConformite(await lireMesuresConformiteServeur(f));
  expect(lu?.map((m) => [m.t, m.toits.taux])).toEqual([['2026-10-01T09:00:00.000Z', 0], ['2026-10-14T10:00:00.000Z', 0.5]]);
  expect(lu?.[1]?.recuLe).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  const fichier = JSON.parse(fs.readFileSync(path.join(n.dossier, 'conformite', 'mesures.json'), 'utf8')) as { format: string; mesures: { cas: unknown[]; facades: unknown }[] };
  expect(fichier.format).toBe('plan-conformite');
  expect(fichier.mesures[1]?.cas).toHaveLength(2);
  expect(fichier.mesures[1]?.facades).toBeNull();
}
