import { expect } from 'vitest';
import { demande, type FauxAnthropic } from './fauxAnthropic.js';

// L'escalade (D20 de MD/plan-vague-3-generaliser.md) cote serveur, la meme pour buildsg/analyseAdmin.mjs (Node) et
// deploy/analyse.php (PHP) : l'usage `escalade` part par l'appel immediat, avec le prompt et le schema de l'analyse
// d'une maison (pas ceux du renfort), au modele demande, et se journalise sous son usage.

export interface HoteEscalade {
  ecrire(entree: string, methode: string, corps: unknown): Promise<Response>;
  faux: FauxAnthropic;
  journal(): Record<string, unknown>[];
}

export async function verifierEscalade(h: HoteEscalade): Promise<void> {
  const base = demande(['e1']) as { requetes: object[] };
  const corps = { ...demande(['e1']), usage: 'escalade', modele: 'claude-sonnet-5-5', requetes: base.requetes.map((r) => ({ ...r, passe: 1, facades: 0 })) };
  const r = await h.ecrire('admin/claude/messages', 'POST', corps);
  expect(r.status).toBe(200);
  const lu = await r.json();
  expect(h.faux.messages).toHaveLength(1);
  // Le modele fin demande, et le prompt de l'analyse d'une maison (le renfort a le sien).
  expect(h.faux.messages[0]).toMatchObject({ model: 'claude-sonnet-5-5' });
  const systeme = (h.faux.messages[0]!.system as { text: string }[])[0]!.text;
  expect(systeme).toMatch(/Vous observez une maison/);
  expect(systeme).not.toMatch(/relever une façade photographiée/);
  expect(lu).toMatchObject({ modele: 'claude-sonnet-5-5', prompt: 9, schema: 5 });
  expect(lu.resultats.map((x: { id: string; statut: string; passe: number; usage: string }) => [x.id, x.statut, x.passe, x.usage])).toEqual([['e1', 'reussi', 1, 'escalade']]);
  // La reponse revient dans la forme du schema de l'analyse (toutes ses tetes de chapitre).
  expect(Object.keys(lu.resultats[0].sortie)).toEqual(expect.arrayContaining(['forme', 'couverture', 'cheminees', 'facades', 'confiance']));
  expect(h.journal()).toHaveLength(1);
  expect(h.journal()[0]).toMatchObject({ usage: 'escalade', modele: 'claude-sonnet-5-5', batch: false, idBatch: null, requete: 'e1', facades: 0, statut: 'reussi', prompt: 9 });
  // Un usage inconnu reste refuse ; un modele hors liste aussi.
  expect((await h.ecrire('admin/claude/messages', 'POST', { ...corps, usage: 'escalade-fine' })).status).toBe(400);
  expect((await h.ecrire('admin/claude/messages', 'POST', { ...corps, modele: 'claude-fable-5-1' })).status).toBe(400);
}
