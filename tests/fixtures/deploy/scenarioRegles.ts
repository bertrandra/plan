import { expect } from 'vitest';
import { demande, type FauxAnthropic } from './fauxAnthropic.js';

// Le scenario du brouillon des regles et de l'essai (admin/claude/regles, `essai: "brouillon"`), joue contre
// deploy/analyse.php. Ce que le brouillon change
// ne vaut que pour une demande de l'administrateur qui le nomme ; le prompt livre n'est jamais remplace.

export interface HoteRegles {
  navigateur(entree: string, init?: RequestInit): Promise<Response>;
  ecrire(entree: string, methode: string, corps: unknown): Promise<Response>;
  /** Un utilisateur de la plateforme (jeton porteur), pas l'administrateur. */
  utilisateur(entree: string, init?: RequestInit): Promise<Response>;
  connecterAdmin(): Promise<void>;
  faux: FauxAnthropic;
  journal(): Record<string, unknown>[];
}

const CHAMP_FORME = {
  type: 'object', additionalProperties: false, required: ['indices', 'valeur'],
  properties: {
    indices: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['image', 'vu'], properties: { image: { type: 'integer' }, vu: { type: 'string' } } } },
    valeur: { type: 'string', enum: ['deux-pans', 'plat', 'indetermine'] },
  },
};

/** Un brouillon valide : un prompt a repérer dans la requete, et un schema reduit a un seul champ. */
export const BROUILLON = {
  prompt: '---\nversion: 10\nnote: essai\n---\n# Rôle\n\nPROMPT DU BROUILLON : dites la forme du toit.\n',
  schema: JSON.stringify({ format: 'plan-schema-analyse', version: 6, note: 'essai', schema: { type: 'object', additionalProperties: false, required: ['forme'], properties: { forme: CHAMP_FORME } } }, null, 2) + '\n',
  etat: { liste: [{ id: 'formeToit' }], exclus: ['facades'] },
};

const systeme = (faux: FauxAnthropic) => (faux.batches.at(-1)!.corps.requests[0]!.params.system as { text: string }[])[0]!.text;

export async function verifierBrouillonDesRegles(h: HoteRegles): Promise<void> {
  const { faux } = h;
  // Sans session, rien ; avec le jeton d'un utilisateur de la plateforme, rien non plus : le brouillon est a l'administrateur.
  expect((await h.navigateur('admin/claude/regles')).status).toBe(401);
  expect((await h.utilisateur('admin/claude/regles')).status).toBe(403);
  expect((await h.utilisateur('admin/claude/batches', { method: 'POST', headers: { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...demande(), essai: 'brouillon' }) })).status).toBe(403);
  await h.connecterAdmin();

  // Aucun brouillon au depart ; l'etat le dit.
  expect(await (await h.navigateur('admin/claude/regles')).json()).toEqual({ brouillon: null });
  expect((await (await h.navigateur('admin/claude/etat')).json()).brouillon).toBeNull();
  // Un essai sans brouillon est refuse, avec la raison.
  const sans = await h.ecrire('admin/claude/batches', 'POST', { ...demande(), essai: 'brouillon' });
  expect(sans.status).toBe(400);
  expect((await sans.json()).error.message).toMatch(/Aucun brouillon/);
  expect(faux.batches).toHaveLength(0);

  // Ce que le serveur refuse d'enregistrer : l'en-tete admin, un prompt sans version, un schema illisible, un etat absent.
  expect((await h.navigateur('admin/claude/regles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(BROUILLON) })).status).toBe(403);
  expect((await h.ecrire('admin/claude/regles', 'PUT', { ...BROUILLON, prompt: '# Rôle sans en-tête' })).status).toBe(400);
  expect((await h.ecrire('admin/claude/regles', 'PUT', { ...BROUILLON, schema: '{ pas du json' })).status).toBe(400);
  expect((await h.ecrire('admin/claude/regles', 'PUT', { ...BROUILLON, schema: JSON.stringify({ version: 5 }) })).status).toBe(400);
  expect((await h.ecrire('admin/claude/regles', 'PUT', { prompt: BROUILLON.prompt, schema: BROUILLON.schema })).status).toBe(400);
  expect((await h.ecrire('admin/claude/regles', 'POST', BROUILLON)).status).toBe(405);

  // L'enregistrement rend les versions ; l'etat les dit sans le texte ; la lecture rend tout, etat de l'editeur compris.
  const ecrit = await h.ecrire('admin/claude/regles', 'PUT', BROUILLON);
  expect(ecrit.status).toBe(200);
  expect((await ecrit.json()).brouillon).toMatchObject({ prompt: 10, schema: 6 });
  expect((await (await h.navigateur('admin/claude/etat')).json()).brouillon).toMatchObject({ prompt: 10, schema: 6 });
  expect((await (await h.navigateur('admin/claude/etat')).json()).prompt).not.toBe(10);
  expect((await (await h.navigateur('admin/claude/regles')).json()).brouillon).toMatchObject({ prompt: 10, schema: 6, prompt_texte: BROUILLON.prompt, schema_texte: BROUILLON.schema, etat: BROUILLON.etat });

  // Sans `essai`, l'analyse part avec le prompt LIVRE : le brouillon n'y est pour rien.
  const livre = await h.ecrire('admin/claude/batches', 'POST', demande());
  expect(livre.status).toBe(201);
  expect(systeme(faux)).toMatch(/^# Rôle/);
  expect(systeme(faux)).not.toContain('PROMPT DU BROUILLON');
  expect((await livre.json()).essai).toBe(false);

  // Avec `essai`, elle part avec le texte et le schema du brouillon.
  const essai = await h.ecrire('admin/claude/batches', 'POST', { ...demande(), essai: 'brouillon' });
  expect(essai.status).toBe(201);
  expect(await essai.json()).toMatchObject({ prompt: 10, schema: 6, essai: true, batch: { id: 'msgbatch_2' } });
  expect(systeme(faux)).toContain('PROMPT DU BROUILLON');
  expect(systeme(faux)).toContain('"forme"');
  expect(systeme(faux)).not.toContain('"chassis-eclairage"');
  // Un `essai` que le serveur ne connait pas, ou sur l'appel immediat : refuse.
  expect((await h.ecrire('admin/claude/batches', 'POST', { ...demande(), essai: 'autre' })).status).toBe(400);
  const immediat = await h.ecrire('admin/claude/messages', 'POST', { ...demande(['p1']), usage: 'renfort', essai: 'brouillon' });
  expect(immediat.status).toBe(400);

  // Le brouillon retire apres l'envoi : la reponse se ramene quand meme au schema qui est PARTI (la copie du batch).
  expect(await (await h.ecrire('admin/claude/regles', 'DELETE', {})).json()).toEqual({ brouillon: null });
  expect((await (await h.navigateur('admin/claude/etat')).json()).brouillon).toBeNull();
  faux.terminer();
  const lu = await (await h.navigateur('admin/claude/batches/msgbatch_2/resultats')).json();
  expect(lu).toMatchObject({ prompt: 10, schema: 6, essai: true });
  expect(Object.keys(lu.resultats[0].sortie)).toEqual(['forme']);
  expect(h.journal().filter((l) => l.idBatch === 'msgbatch_2').every((l) => l.essai === true && l.prompt === 10)).toBe(true);
  // Le batch du prompt livre, lui, garde sa forme entiere et ne porte pas la marque d'essai.
  const normal = await (await h.navigateur('admin/claude/batches/msgbatch_1/resultats')).json();
  expect(normal.essai).toBe(false);
  expect(Object.keys(normal.resultats[0].sortie).length).toBeGreaterThan(5);
  expect(h.journal().filter((l) => l.idBatch === 'msgbatch_1').some((l) => 'essai' in l)).toBe(false);
}
