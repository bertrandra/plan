// Le dossier des donnees (`data/`, deploy/donnees.php), le rangement des
// audits et les traces des analyses et rejeux (MD/spec-audit.md 15.4 et 15.5), joues contre
// le serveur : un ancien `plan-demos/` deplace dans data/ au premier passage, un
// ancien audit a plat range dans son dossier, une promenade deposee, un rejeu garde entree et sortie.
// Le serveur n'ecrit rien hors de data/ (sauf la note laissee dans l'ancien dossier).

import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { fichierAudit, JETON } from './contextePlateforme.js';
import { SORTIE_ANALYSE, TROUVE_ANALYSE, type FauxAnthropic } from './fauxAnthropic.js';
import { mesureEssai } from './scenarioConformite.js';

export const ID_ANCIEN = '20261001-090000-0000abcd';
export const IDU = '78650000AE0101';
/** Une image de 4 octets, en base64 : ce que la page envoie, reduit a l'extreme. */
const IMAGE = 'QUJDRA==';

export interface ServeurDonnees {
  navigateur(entree: string, init?: RequestInit): Promise<Response>;
  /** La meme requete, sans le cookie de la session admin. */
  sansSession(entree: string, init?: RequestInit): Promise<Response>;
  connecter(): Promise<void>;
  /** Le dossier qui contient la configuration, plan-demos/ et data/. */
  racine: string;
  faux: FauxAnthropic;
  /** Les fichiers que le harnais ecrit lui-meme hors de data/ (sessions PHP) : ignores par la verification. */
  ignorer: (relatif: string) => boolean;
}

/** L'ancien dossier, tel qu'une configuration `dossierDemos` l'a rempli : demos, reglages, journal, audit a plat. */
export function poserAncienDossier(racine: string): void {
  const a = path.join(racine, 'plan-demos');
  fs.mkdirSync(path.join(a, 'claude'), { recursive: true });
  fs.mkdirSync(path.join(a, 'audits'), { recursive: true });
  fs.mkdirSync(path.join(a, 'conformite'), { recursive: true });
  fs.writeFileSync(path.join(a, '1.json'), JSON.stringify({ meta: { id: '1', name: 'Ma démo' }, objects: [], measures: [] }));
  fs.writeFileSync(path.join(a, '1.json.bak'), '{}');
  fs.writeFileSync(path.join(a, '.palette.json'), JSON.stringify({ format: 'plan-palette', couleurs: { clair: { accent: '#112233' } } }));
  fs.writeFileSync(path.join(a, 'claude', 'plafonds.json'), JSON.stringify({ format: 'plan-claude-plafonds', defaut: { jour: 5, mois: 50 }, organisations: {}, requetesParBatch: 60, estimationRequete: 0.005 }));
  fs.writeFileSync(path.join(a, 'conformite', 'mesures.json'), JSON.stringify({ format: 'plan-conformite', version: 1, mesures: [] }));
  const texte = JSON.stringify(fichierAudit(IDU));
  fs.writeFileSync(path.join(a, 'audits', ID_ANCIEN + '.json'), texte);
  fs.writeFileSync(path.join(a, 'audits', ID_ANCIEN + '.fiche.json'), JSON.stringify({ id: ID_ANCIEN, recuLe: '2026-10-01T09:00:00Z', organisation: 'admin', idu: IDU, adresse: '2 allée des Limites', taille: texte.length, marque: 'corpus', retrait: '0'.repeat(64) }));
}

/** Tous les fichiers sous `d`, chemins relatifs, avec leur date de modification. */
function inventaire(d: string, base = d): Map<string, number> {
  const m = new Map<string, number>();
  if (!fs.existsSync(d)) return m;
  for (const n of fs.readdirSync(d)) {
    const f = path.join(d, n);
    const st = fs.statSync(f);
    if (st.isDirectory()) for (const [k, v] of inventaire(f, base)) m.set(k, v);
    else m.set(path.relative(base, f), st.mtimeMs);
  }
  return m;
}

const ECRITURE = { 'X-Plan-Admin': '1', 'Content-Type': 'application/json' };

export async function jouerScenarioDonnees(s: ServeurDonnees): Promise<void> {
  const data = path.join(s.racine, 'data');
  const avant = inventaire(s.racine);
  const json = async (r: Response) => { const t = await r.text(); try { return JSON.parse(t); } catch { throw new Error(r.status + ' ' + t.slice(0, 300)); } };

  // Le premier passage : plan-demos/ est deplace dans data/, rubrique par rubrique.
  await s.connecter();
  const demos = await json(await s.navigateur('admin/demos'));
  expect(demos.demos.map((x: { id: string; name: string }) => [x.id, x.name])).toEqual([['1', 'Ma démo']]);
  expect(fs.existsSync(path.join(data, 'demo', '1.json'))).toBe(true);
  expect(fs.existsSync(path.join(data, 'demo', '1.json.bak'))).toBe(true);
  expect(fs.existsSync(path.join(data, 'admin', 'palette.json'))).toBe(true);
  expect((await s.navigateur('admin/palette')).status).toBe(200);
  expect(fs.existsSync(path.join(data, 'claude', 'plafonds.json'))).toBe(true);
  expect(fs.existsSync(path.join(data, 'conformite', 'mesures.json'))).toBe(true);
  const migration = JSON.parse(fs.readFileSync(path.join(data, 'migration.json'), 'utf8'));
  expect(migration).toMatchObject({ format: 'plan-migration-donnees', version: 1, depuis: path.join(s.racine, 'plan-demos'), laisses: [] });
  expect([...migration.deplaces].sort()).toEqual(['.palette.json', '1.json', '1.json.bak', 'audits', 'claude', 'conformite']);
  expect(fs.readdirSync(path.join(s.racine, 'plan-demos'))).toEqual(['DEPLACE-VERS-DATA.txt']);
  expect((await json(await s.navigateur('admin/claude/etat'))).donnees).toMatchObject({ disposition: 'data', racine: data, migration: { deplaces: migration.deplaces } });
  // Chaque ecriture de l'admin va dans data/ : demo, palette, controleurs, conformite, echec de connexion.
  expect((await s.sansSession('admin/session', { method: 'POST', headers: ECRITURE, body: JSON.stringify({ motDePasse: 'faux' }) })).status).toBe(401);
  expect((await s.navigateur('admin/demos', { method: 'POST', headers: ECRITURE, body: JSON.stringify({ meta: { name: 'Deux' }, objects: [], measures: [] }) })).status).toBe(201);
  expect(fs.existsSync(path.join(data, 'demo', '2.json'))).toBe(true);
  expect((await s.navigateur('admin/palette', { method: 'PUT', headers: ECRITURE, body: JSON.stringify({ format: 'plan-palette', couleurs: { clair: { accent: '#445566' } } }) })).status).toBe(200);
  expect(JSON.parse(fs.readFileSync(path.join(data, 'admin', 'palette.json'), 'utf8')).couleurs.clair.accent).toBe('#445566');
  expect((await s.navigateur('admin/controleurs', { method: 'PUT', headers: ECRITURE, body: JSON.stringify({ format: 'plan-controleurs', arbre: {}, decouvertLe: '2026-10-15' }) })).status).toBe(200);
  expect(fs.existsSync(path.join(data, 'admin', 'controleurs.json'))).toBe(true);
  expect((await s.navigateur('admin/conformite', { method: 'POST', headers: ECRITURE, body: JSON.stringify(mesureEssai('2026-10-15T10:00:00Z')) })).status).toBe(201);
  expect(JSON.parse(fs.readFileSync(path.join(data, 'conformite', 'mesures.json'), 'utf8')).mesures).toHaveLength(1);
  // Les plafonds deplaces sont ceux qui valent.
  expect((await json(await s.navigateur('admin/claude/plafonds'))).defaut).toEqual({ jour: 5, mois: 50 });

  // L'ancien audit a plat est range dans son dossier, a la premiere lecture de la liste.
  const liste = await json(await s.navigateur('admin/audits'));
  expect(liste.audits).toEqual([expect.objectContaining({ id: ID_ANCIEN, nature: 'parcelle', idu: IDU, dossier: 'parcelle/' + IDU + '/' + ID_ANCIEN })]);
  expect(liste.audits[0]).not.toHaveProperty('retrait');
  const dirAncien = path.join(data, 'audits', 'parcelle', IDU, ID_ANCIEN);
  expect(fs.readdirSync(dirAncien).sort()).toEqual(['audit.json', 'decisions.json', 'fiche.json']);
  expect(fs.readdirSync(path.join(data, 'audits')).filter((n) => n.endsWith('.json')).sort()).toEqual(['index.json']);
  expect(await (await s.navigateur('admin/audits/' + ID_ANCIEN)).text()).toBe(JSON.stringify(fichierAudit(IDU)));
  // L'index supprime se reconstruit en relisant l'arborescence.
  fs.rmSync(path.join(data, 'audits', 'index.json'));
  expect((await json(await s.navigateur('admin/audits'))).audits.map((a: { id: string }) => a.id)).toEqual([ID_ANCIEN]);

  // Une promenade des toits, deposee par l'administrateur : rangee par commune.
  const promenade = { format: 'plan-audit', version: 2, promenade: { debut: '2026-10-10T08:00:00.000Z', fin: '2026-10-10T09:00:00.000Z', commune: 'Le Vésinet' },
    cas: [{ id: 'c1', cle: 'b1', statut: 'a_corriger', identite: { cleBdtopo: 'BATIMENT1', idu: null, adresse: null }, constat: { categorie: 'toit', problemes: ['toit.forme'], note: 'croupe', t: '', position: { x: 0, y: 0, precisionM: null }, photos: [{ type: 'image/jpeg', base64: 'AAAA' }] } }] };
  expect((await s.sansSession('admin/audits', { method: 'POST', headers: { ...ECRITURE, Authorization: 'Bearer ' + JETON }, body: JSON.stringify(promenade) })).status).toBe(403);
  const p = await s.navigateur('admin/audits', { method: 'POST', headers: ECRITURE, body: JSON.stringify(promenade) });
  expect(p.status).toBe(201);
  const idPromenade = (await json(p)).id as string;
  const dirPromenade = path.join(data, 'audits', 'promenade', 'le-vesinet', idPromenade);
  expect(JSON.parse(fs.readFileSync(path.join(dirPromenade, 'fiche.json'), 'utf8'))).toMatchObject({ nature: 'promenade', commune: 'Le Vésinet', photos: 1, cas: 1, statuts: { a_corriger: 1 } });
  expect(JSON.parse(fs.readFileSync(path.join(dirPromenade, 'decisions.json'), 'utf8')).cas).toEqual([
    { id: 'c1', cle: 'b1', cleBdtopo: 'BATIMENT1', adresse: null, statut: 'a_corriger', categorie: 'toit', problemes: ['toit.forme'], note: 'croupe', photos: 1 }]);

  // Le rejeu : l'administrateur seul, un audit range, le modele choisi ; deux passes d'un batiment.
  const rejeu = (plus: Record<string, unknown> = {}) => ({
    projet: null, idu: IDU, adresse: null, audit: ID_ANCIEN, depot: ID_ANCIEN, usage: 'rejeu', modele: 'claude-sonnet-5-5',
    requetes: [1, 2].map((passe) => ({ id: 'b0-p' + passe, passe, facades: 1, contenu: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE } }, { type: 'text', text: 'Image 1 : photo de la façade sud.' }, { type: 'text', text: 'Bâtiment : Maison.' }] })),
    ...plus,
  });
  const poster = (corps: unknown) => s.navigateur('admin/claude/batches', { method: 'POST', headers: ECRITURE, body: JSON.stringify(corps) });
  expect((await poster(rejeu({ depot: null }))).status).toBe(400);
  expect((await poster(rejeu({ depot: '20990101-000000-00000000' }))).status).toBe(404);
  expect((await poster(rejeu({ requetes: [{ ...rejeu().requetes[0], usage: 'facade' }] }))).status).toBe(400);
  // L'analyse de la session dont le depot a ete retire part quand meme ; sa trace se range sans depot, sous l'organisation (lot L0).
  const orpheline = await poster({ ...rejeu({ usage: 'analyse', depot: '20990101-000000-00000000' }) });
  expect(orpheline.status).toBe(201);
  const sansDepot = await json(orpheline) as { trace: string; depot: string | null };
  expect(sansDepot.depot).toBe(null);
  const moisTrace = sansDepot.trace.slice(0, 4) + '-' + sansDepot.trace.slice(4, 6);
  expect(fs.existsSync(path.join(data, 'claude', 'analyses', 'sans-depot', 'admin', moisTrace, sansDepot.trace, 'entrant.json'))).toBe(true);
  const cree = await poster(rejeu());
  expect(cree.status).toBe(201);
  const { trace } = await json(cree) as { trace: string };
  expect(trace).toMatch(/^\d{8}-\d{6}-claude-sonnet-5-5-[0-9a-f]{4}$/);
  expect(s.faux.batches.at(-1)?.corps.requests.map((r) => r.params.model)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5-5']);
  const dt = path.join(dirAncien, 'analyses', trace);
  const entrant = JSON.parse(fs.readFileSync(path.join(dt, 'entrant.json'), 'utf8'));
  const nomImage = 'e12e115acf4552b2568b55e93cbd39394c4ef81c82447fafc997882a02d23677.jpg';
  expect(entrant).toMatchObject({ format: 'plan-audit-entrant', version: 1, max_tokens: 16000, effort: 'low', usages: { rejeu: { prompt: expect.any(Number), schema: expect.any(Number) } } });
  expect(entrant.usages.rejeu.systeme).toContain('# Forme de la réponse');
  expect(entrant.requetes[0]).toEqual({ id: 'b0-p1', passe: 1, usage: 'rejeu', modele: 'claude-sonnet-5-5', facades: 1, images: 1,
    contenu: [{ type: 'image', media_type: 'image/jpeg', image: nomImage, octets: 4 }, { type: 'text', text: 'Image 1 : photo de la façade sud.' }, { type: 'text', text: 'Bâtiment : Maison.' }] });
  // L'image une seule fois pour l'audit, meme envoyee deux fois.
  expect(fs.readdirSync(path.join(dirAncien, 'images'))).toEqual([nomImage]);
  const enCours = (await json(await s.navigateur('admin/audits/' + ID_ANCIEN + '/analyses'))).analyses;
  expect(enCours).toEqual([expect.objectContaining({ id: trace, audit: ID_ANCIEN, nature: 'rejeu', etat: 'en_cours', modele: 'claude-sonnet-5-5', requetes: 2, images: 2, resultats: null })]);

  // La fin du batch : chaque reponse brute et remise en forme, les comptes, le cout.
  s.faux.terminer();
  expect((await s.navigateur('admin/claude/batches/' + s.faux.batches.at(-1)?.id + '/resultats')).status).toBe(200);
  const complete = await json(await s.navigateur('admin/audits/' + ID_ANCIEN + '/analyses/' + trace));
  expect(complete).toMatchObject({ format: 'plan-audit-analyse-complete', audit: ID_ANCIEN, resume: { etat: 'termine', nature: 'rejeu' }, entrant: { requetes: expect.any(Array) } });
  const sortant = complete.sortant as { resultats: { id: string; texte: string | null; sortie: unknown; trouve: unknown; statut: string }[] };
  expect(sortant.resultats.map((r) => r.id)).toEqual(['b0-p1', 'b0-p2']);
  expect(sortant.resultats[0]?.statut).toBe('reussi');
  expect(JSON.parse(sortant.resultats[0]?.texte ?? 'null')).toEqual(SORTIE_ANALYSE);
  expect(sortant.resultats[0]?.trouve).toEqual(TROUVE_ANALYSE);
  expect(complete.resume.resultats[0]).not.toHaveProperty('texte');
  expect(complete.resume.tokens.sortie).toBeGreaterThan(0);
  const image = await s.navigateur('admin/audits/' + ID_ANCIEN + '/images/' + nomImage);
  expect(image.headers.get('content-type')).toBe('image/jpeg');
  expect(Buffer.from(await image.arrayBuffer()).toString('base64')).toBe(IMAGE);
  expect((await s.navigateur('admin/audits/' + ID_ANCIEN + '/images/../fiche.json')).status).toBe(404);

  // Un utilisateur de la plateforme ne rejoue pas, et ne lit pas les traces.
  expect((await s.sansSession('admin/claude/batches', { method: 'POST', headers: { ...ECRITURE, Authorization: 'Bearer ' + JETON }, body: JSON.stringify(rejeu()) })).status).toBe(403);
  expect((await s.sansSession('admin/audits/' + ID_ANCIEN + '/analyses', { headers: { Authorization: 'Bearer ' + JETON } })).status).toBe(401);

  // Retirer emporte le dossier de l'audit, analyses et images comprises.
  expect((await s.navigateur('admin/audits/' + ID_ANCIEN, { method: 'DELETE', headers: { 'X-Plan-Admin': '1' } })).status).toBe(200);
  expect(fs.existsSync(dirAncien)).toBe(false);
  expect((await json(await s.navigateur('admin/audits'))).audits.map((a: { id: string }) => a.id)).toEqual([idPromenade]);

  // Rien n'a ete ecrit hors de data/, sauf la note laissee dans l'ancien dossier.
  const apres = inventaire(s.racine);
  const dehors = [...apres].filter(([f, t]) => !f.startsWith('data' + path.sep) && !s.ignorer(f) && avant.get(f) !== t).map(([f]) => f);
  expect(dehors.filter((f) => f !== path.join('plan-demos', 'DEPLACE-VERS-DATA.txt'))).toEqual([]);
  expect(fs.existsSync(path.join(s.racine, 'plan-demos', 'DEPLACE-VERS-DATA.txt'))).toBe(true);
}
