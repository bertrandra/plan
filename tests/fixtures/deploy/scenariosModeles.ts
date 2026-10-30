import fs from 'node:fs';
import { expect } from 'vitest';
import { SORTIE_ANALYSE, SORTIE_FACADE, SORTIE_VIDE, TROUVE_ANALYSE, TROUVE_FACADE, TROUVE_VIDE, demande, type FauxAnthropic } from './fauxAnthropic.js';

// Le modele de chaque usage (`admin/claude/modeles`) et les comptes de ce que les reponses
// contiennent (champ `trouve` du journal), joues contre deploy/analyse.php.

export const RAPIDE = 'claude-haiku-5-5';
export const FIN = 'claude-sonnet-5-5';
/** Les modeles admis, et celui de chaque usage tant que l'administrateur n'a rien regle. */
const MODELES = [RAPIDE, FIN];
const MODELE_PAR_USAGE = { analyse: RAPIDE, escalade: FIN, immediat: RAPIDE, candidats: RAPIDE, rejeu: RAPIDE, facade: RAPIDE, 'facade-enrichie': RAPIDE, plu: RAPIDE, jardin: RAPIDE };

export interface Serveur {
  navigateur: (entree: string, init?: RequestInit) => Promise<Response>;
  ecrire: (entree: string, methode: string, corps: unknown) => Promise<Response>;
  journal: () => Record<string, unknown>[];
  /** Le fichier du reglage, dans le dossier `claude/` du serveur. */
  fichier: string;
  faux: FauxAnthropic;
  /** Les sorties rendues par l'API simulee, par identifiant de requete. */
  sorties: Record<string, object>;
}

/** Une requete du run d'une facade, dans le batch de l'analyse (l'audit, lot F3). */
export const requeteFacade = (id: string) => ({
  id, passe: 1, usage: 'facade', facades: 0,
  contenu: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJDRA==' } }, { type: 'text', text: 'Façade : sud de Maison.' }]
});

const avecFacade = () => ({ ...demande(['p1']), requetes: [...(demande(['p1']) as { requetes: object[] }).requetes, requeteFacade('r1')] });
const modelesEnvoyes = (s: Serveur, n: number) => Object.fromEntries((s.faux.batches[n]?.corps.requests ?? []).map((r) => [r.custom_id, r.params.model]));

/** Le defaut, un reglage pose puis remplace (`.bak`), les refus, et ce que les batches envoient. */
export async function reglerLesModeles(s: Serveur): Promise<void> {
  const lu = await (await s.navigateur('admin/claude/modeles')).json();
  expect(lu).toEqual({ format: 'plan-claude-modeles', usages: { ...MODELE_PAR_USAGE }, defaut: { ...MODELE_PAR_USAGE }, admis: MODELES, regle: false });
  // Par defaut, le modele rapide pour tous les usages, sauf l'escalade, au modele fin (decision du 29 octobre 2026).
  expect(lu.usages).toEqual({ analyse: RAPIDE, immediat: RAPIDE, escalade: FIN, candidats: RAPIDE, rejeu: RAPIDE, facade: RAPIDE, 'facade-enrichie': RAPIDE, plu: RAPIDE, jardin: RAPIDE });
  expect((await s.ecrire('admin/claude/batches', 'POST', avecFacade())).status).toBe(201);
  expect(modelesEnvoyes(s, 0)).toEqual({ p1: RAPIDE, r1: RAPIDE });

  // L'administrateur passe l'analyse au modele plus fin.
  const pose = await s.ecrire('admin/claude/modeles', 'PUT', { format: 'plan-claude-modeles', usages: { analyse: FIN } });
  expect(pose.status).toBe(200);
  expect(await pose.json()).toMatchObject({ usages: { ...MODELE_PAR_USAGE, analyse: FIN }, regle: true });
  expect(JSON.parse(fs.readFileSync(s.fichier, 'utf8'))).toEqual({ format: 'plan-claude-modeles', usages: { analyse: FIN } });
  expect((await (await s.navigateur('admin/claude/etat')).json()).modelesParUsage).toEqual({ ...MODELE_PAR_USAGE, analyse: FIN });
  // Le reglage vaut pour l'envoi suivant ; chaque requete garde le modele de son usage.
  expect((await s.ecrire('admin/claude/batches', 'POST', avecFacade())).status).toBe(201);
  expect(modelesEnvoyes(s, 1)).toEqual({ p1: FIN, r1: RAPIDE });
  // Un modele demande explicitement reste admis, pour toutes les requetes de la demande.
  expect((await s.ecrire('admin/claude/batches', 'POST', { ...avecFacade(), modele: RAPIDE })).status).toBe(201);
  expect(modelesEnvoyes(s, 2)).toEqual({ p1: RAPIDE, r1: RAPIDE });

  // Le remplacer garde la version precedente en `.bak`.
  expect((await s.ecrire('admin/claude/modeles', 'PUT', { format: 'plan-claude-modeles', usages: { analyse: FIN, facade: FIN } })).status).toBe(200);
  expect(JSON.parse(fs.readFileSync(s.fichier + '.bak', 'utf8'))).toEqual({ format: 'plan-claude-modeles', usages: { analyse: FIN } });

  // Les refus : un modele hors de la liste, un usage inconnu, un autre format. Rien n'est ecrit.
  const avant = fs.readFileSync(s.fichier, 'utf8');
  for (const corps of [
    { format: 'plan-claude-modeles', usages: { analyse: 'claude-fable-5-1' } },
    { format: 'plan-claude-modeles', usages: { autre: RAPIDE } },
    // Le renfort (lot L18) est parti au lot F3 : son usage ne se regle plus.
    { format: 'plan-claude-modeles', usages: { renfort: RAPIDE } },
    { format: 'plan-claude-modeles', usages: [RAPIDE] },
    { format: 'plan-claude-tarifs', usages: {} }
  ]) {
    const r = await s.ecrire('admin/claude/modeles', 'PUT', corps);
    expect(r.status, JSON.stringify(corps)).toBe(400);
    expect((await r.json()).error.code).toBe('BAD_REQUEST');
  }
  expect(fs.readFileSync(s.fichier, 'utf8')).toBe(avant);
  expect((await s.ecrire('admin/claude/modeles', 'POST', {})).status).toBe(405);

  // Un modele regle puis retire de la liste (un deploiement plus recent) retombe sur le defaut.
  // Un reglage d'avant le lot F3 garde son `renfort` : il est ignore, sans tomber.
  fs.writeFileSync(s.fichier, JSON.stringify({ format: 'plan-claude-modeles', usages: { analyse: 'claude-ancien-1', facade: FIN, renfort: FIN } }));
  expect((await (await s.navigateur('admin/claude/modeles')).json()).usages).toEqual({ ...MODELE_PAR_USAGE, facade: FIN });
}

/** Ce que les reponses contiennent, au journal ; une ligne d'avant les comptes reste lisible. */
export async function compterCeQuiEstTrouve(s: Serveur): Promise<void> {
  Object.assign(s.sorties, { p1: SORTIE_ANALYSE, p2: SORTIE_VIDE, r1: SORTIE_FACADE });
  const d = demande(['p1', 'p2', 'rate']) as { requetes: object[] };
  expect((await s.ecrire('admin/claude/batches', 'POST', { ...d, requetes: [...d.requetes, requeteFacade('r1')] })).status).toBe(201);
  s.faux.terminer();
  const lu = await (await s.navigateur('admin/claude/batches/msgbatch_1/resultats')).json();
  // La page ne recoit pas les comptes : ils ne servent qu'au tableau de bord.
  for (const r of lu.resultats) expect(r).not.toHaveProperty('trouve');
  const parRequete = Object.fromEntries(s.journal().map((l) => [l.requete, l.trouve]));
  expect(parRequete).toEqual({ p1: TROUVE_ANALYSE, p2: TROUVE_VIDE, r1: TROUVE_FACADE, rate: null });
  // Ni la reponse ni ses mots : des nombres seulement.
  expect(JSON.stringify(s.journal())).not.toMatch(/deux-pans|jacobine|fenetre-de-toit/);

  const conso = await (await s.navigateur('admin/consommation')).json();
  const p1 = conso.lignes.find((l: { trouve: { ouvertures: number } | null }) => l.trouve?.ouvertures === 9);
  expect(p1).toMatchObject({ idBatch: 'msgbatch_1', modele: RAPIDE, trouve: TROUVE_ANALYSE });
  expect(conso.lignes.filter((l: { trouve: unknown }) => l.trouve === null)).toHaveLength(1);
}
