import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// Une API Message Batches simulee, pour eprouver analyse.php sans
// appeler Anthropic : les memes routes, le meme JSON, des compteurs `usage` choisis.

export const CLE = 'cle-de-test';

/** Ce que chaque requete du batch rend : par identifiant de requete, la ligne de resultats JSONL. */
export type Reponse = (customId: string) => object;

export interface BatchFaux {
  id: string;
  corps: { requests: { custom_id: string; params: Record<string, unknown> }[] };
  etat: 'in_progress' | 'ended';
}

export interface FauxAnthropic {
  url: string;
  batches: BatchFaux[];
  /** Les en-tetes recus, dans l'ordre. */
  entetes: http.IncomingHttpHeaders[];
  /** Le statut de la prochaine creation (200 par defaut) ; 400 pour une erreur. */
  statutCreation: number;
  finLe: string;
  /** Les corps recus par l'API Messages (appel immediat, lot L18), dans l'ordre. */
  messages: Record<string, unknown>[];
  /** Ce que l'API Messages rend au `n`-ieme appel (a partir de 0) : un message reussi par defaut. */
  reponseMessage: (corps: Record<string, unknown>, n: number) => { statut: number; corps: object };
  terminer(id?: string): void;
  fermer(): Promise<void>;
}

/** Un message reussi, avec les compteurs donnes et une sortie JSON minimale. */
export function reussi(customId: string, usage: Record<string, unknown>, sortie: object = { forme: { indices: [], valeur: 'deux-pans' } }): object {
  return {
    custom_id: customId,
    result: {
      type: 'succeeded',
      message: {
        id: 'msg_' + customId, type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn',
        content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(sortie) }],
        usage
      }
    }
  };
}

/**
 * Une sortie de l'analyse (deploy/schema-analyse.json) qui trouve : deux facades et leurs baies, un
 * pignon, deux lucarnes, un element, un ecart. Un `indetermine` ne compte jamais.
 */
export const SORTIE_ANALYSE = {
  forme: { indices: [], valeur: 'deux-pans' },
  profil: { indices: [], valeur: 'indetermine' },
  faitage: { indices: [], sens: 'parallele-rue' },
  bouts: { indices: [], gauche: 'pignon', droite: 'indetermine' },
  lucarnes: { indices: [], nombre: 2, types: ['jacobine'], pan: 'rue' },
  terrasse: { indices: [], presente: 'non', type: 'sans-objet', acrotere: 'indetermine', edicules: 'indetermine' },
  couverture: { indices: [], valeur: 'indetermine' },
  elements: [{ indices: [], element: 'fenetre-de-toit' }],
  facades: [
    { indices: [], facade: 'rue', ouvertures: { niveaux: 2, parNiveau: [3, 4], manquees: 1, enTrop: 'indetermine' } },
    { indices: [], facade: 'jardin', ouvertures: { niveaux: 'indetermine', parNiveau: ['indetermine', 2], manquees: 0, enTrop: 1 } }
  ],
  ecarts: [{ indices: [], sujet: 'lucarnes', modele: 'aucune', observe: 'deux' }],
  contradictions: [],
  confiance: 'moyenne'
};
/** Ses comptes : 3 + 4 + 2 baies, forme, faitage et terrasse determines. */
export const TROUVE_ANALYSE = { ouvertures: 9, manquees: 1, enTrop: 1, bouts: 1, lucarnes: 2, elements: 1, ecarts: 1, coins: 0, determines: 3, vide: false };
/** Une sortie qui ne trouve rien : tout `indetermine`, aucune baie. */
export const SORTIE_VIDE = {
  forme: { indices: [], valeur: 'indetermine' },
  bouts: { indices: [], gauche: 'indetermine', droite: 'sans-objet' },
  lucarnes: { indices: [], nombre: 'indetermine', types: [], pan: 'indetermine' },
  elements: [],
  facades: [{ indices: [], facade: 'rue', ouvertures: { niveaux: 'indetermine', parNiveau: [], manquees: 'indetermine', enTrop: 'indetermine' } }],
  ecarts: [],
  confiance: 'faible'
};
export const TROUVE_VIDE = { ouvertures: 0, manquees: 0, enTrop: 0, bouts: 0, lucarnes: 0, elements: 0, ecarts: 0, coins: 0, determines: 0, vide: true };

/**
 * Une sortie du run d'une facade (deploy/schema-facade.json, lot F2). SYNTHETIQUE : ecrite a la main pour les tests, ce n'est pas
 * une reponse de Claude. Deux angles, deux pointes, un appentis, une haie, une cheminee, deux baies dont une a petits carreaux.
 */
export const SORTIE_FACADE = {
  calage: {
    angles: { gauche: { x: 0.14, egout: 0.52, sol: 0.88, confiance: 'moyenne' }, droite: { x: 0.86, egout: 0.52, sol: 0.88, confiance: 'forte' } },
    pointes: [{ u: 0.11, v: 3.1, confiance: 'moyenne' }, { u: 0.8, v: 3.2, confiance: 'faible' }],
    appentis: [{ debut: 0.3, fin: 0.62 }],
    corps: [],
    cache: [{ quoi: 'haie', debut: 0.85, fin: 1 }],
  },
  forme: { silhouette: 'plusieurs-sommets', bout: 'pignon' },
  elements: [{ element: 'cheminee', u: 0.45, confiance: 'moyenne' }],
  surface: { principale: 'enduit', zones: [{ type: 'colombage', u0: 0.5, u1: 1, v0: 1.5, v1: 3, confiance: 'moyenne' }], confiance: 'forte' },
  ouvertures: [
    { type: 'fenetre', u0: 0.1, u1: 0.22, v0: 0.4, v1: 0.85, niveau: 0, travee: 0, confiance: 'forte', details: { volets: 'battants', allege: 'pleine', forme: 'rect', menuiserie: { materiau: 'bois', couleur: 'blanc' }, couleurVolets: 'vert', gardeCorps: { type: 'sans-objet', haut: 'indetermine', couleur: 'indetermine' } },
      carreaux: { vantaux: 2, colonnes: 1, rangees: 3, petitsBois: 'fins', imposte: 'aucune', vitrage: 'clair' } },
    { type: 'porte', u0: 0.45, u1: 0.55, v0: 0, v1: 0.85, niveau: 0, travee: 1, confiance: 'moyenne', details: { volets: 'aucun', allege: 'indetermine', forme: 'rect', menuiserie: { materiau: 'indetermine', couleur: 'gris-anthracite' }, couleurVolets: 'sans-objet', gardeCorps: { type: 'sans-objet', haut: 'indetermine', couleur: 'indetermine' } },
      carreaux: { vantaux: 1, colonnes: 'indetermine', rangees: 'indetermine', petitsBois: 'indetermine', imposte: { hauteur: 0.2, colonnes: 3, rangees: 1 }, vitrage: 'indetermine' } },
  ],
  // La facade enrichie (lot L1) : une galerie, une genoise et un bandeau, un store, une fissure signalee.
  saillies: [{ genre: 'galerie', u0: 0.3, u1: 0.62, forme: 'rectangle', niveau: 'rdc', toit: 'pan', haut: 0.45, couverture: 'sans-objet', confiance: 'moyenne' }],
  decroches: [],
  modenature: { egout: 'genoise', rangsGenoise: 2, bandeaux: [0.5], chaines: 'aucune', encadrements: 'indetermine', soubassement: 'aucun', descentes: [] },
  appendices: [{ nature: 'store', u0: 0.6, u1: 0.8, v0: 0.4, v1: 0.45, marches: 'indetermine', confiance: 'moyenne' }],
  etat: [{ nature: 'fissure', u0: 0.7, u1: 0.72, v0: 0.2, v1: 0.6, confiance: 'faible' }],
  confiance: 'moyenne'
};

/**
 * Le run d'une facade tel qu'une reponse SANS sortie structuree peut l'ecrire. SYNTHETIQUE (la vraie reponse du 29 octobre 2026,
 * « Sortie non JSON », n'a pas ete gardee) : une phrase dont les accolades precedent l'objet, un premier jet coupe, le JSON dans un
 * bloc de code, puis une remarque avec des accolades. La lecture d'avant (de la premiere accolade a la derniere) n'en lisait rien.
 */
export const TEXTE_FACADE_SANS_FORMAT = 'Je lis la façade {scène de synthèse} : deux pignons, une haie à droite.\n'
  + 'Premier jet : {"calage": {"angles": \n'
  + '```json\n' + JSON.stringify(SORTIE_FACADE, null, 2) + '\n```\n'
  + 'Remarque : les boîtes {u0, u1, v0, v1} sont en part du mur.';

/**
 * Ce que Haiku a ecrit sur la vraie API quand le schema partait en texte a la suite du prompt (run 40896695970 : « {"type":"object",
 * "additionalProperties":false,"required":["calage",…],"properties":{"calage":{…"gauche":{"x":0.22,"egout":0.29,"sol… ») : le schema
 * recopie, ses valeurs logees dedans, et une fois `egout: 258` (des pixels). SYNTHETIQUE a partir de cet extrait.
 */
/**
 * La sortie de la lecture du jardin (deploy/schema-jardin.json, lot L3). SYNTHETIQUE : ecrite a la main sur l'orthophoto de synthese
 * (tests/fixtures/jardin-ia/), ce n'est pas une reponse de Claude.
 */
export const SORTIE_JARDIN = (JSON.parse(fs.readFileSync(new URL('../jardin-ia/reponse-synthetique.json', import.meta.url), 'utf8')) as { sortie: { objets: unknown[]; confiance: string } }).sortie;

/** Le schema du run d'une facade, tel que le serveur le lit (deploy/schema-facade.json). */
export const schemaFacade = (): Record<string, unknown> =>
  (JSON.parse(fs.readFileSync(new URL('../../../deploy/schema-facade.json', import.meta.url), 'utf8')) as { schema: Record<string, unknown> }).schema;

export function texteSqueletteDuSchema(schema: Record<string, unknown>): string {
  const copie = JSON.parse(JSON.stringify(schema)) as { properties: { calage: { properties: { angles: { properties: Record<string, unknown> } } } } };
  copie.properties.calage.properties.angles.properties = { gauche: { x: 0.22, egout: 0.29, sol: 0.81, confiance: 'forte' }, droite: { x: 0.91, egout: 258, sol: 0.8, confiance: 'moyenne' } };
  return JSON.stringify(copie);
}

/**
 * L'API Messages pour le run d'une facade, au plus pres de ce qu'elle fait : la sortie structuree demandee (`output_config.format`),
 * l'objet JSON seul ; sans elle, le texte ci-dessus. `refuserFormat` : l'API refuse le schema (400), comme elle refusait celui de
 * l'analyse d'une maison (« The compiled grammar is too large »).
 */
export function messageFacade(corps: Record<string, unknown>, refuserFormat = false): { statut: number; corps: object } {
  const format = (corps.output_config as { format?: unknown } | undefined)?.format;
  if (format && refuserFormat) return { statut: 400, corps: { type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format: The compiled grammar is too large' } } };
  const m = messageReussi(USAGE_P1, SORTIE_FACADE) as { content: unknown[] };
  // Sans format : le schema en texte dans le prompt, Haiku le recopie ; un exemple a la place, il repond (du texte autour).
  const systeme = JSON.stringify(corps.system ?? '');
  const schemaEnTexte = /conforme à ce schéma JSON/.test(systeme);
  if (!format) m.content = [{ type: 'thinking', thinking: '' }, { type: 'text', text: schemaEnTexte ? texteSqueletteDuSchema(schemaFacade()) : TEXTE_FACADE_SANS_FORMAT }];
  return { statut: 200, corps: m };
}

/** Ses comptes au journal : deux baies, deux angles, deux pointes, une cheminee, la silhouette et le bout dits. */
export const TROUVE_FACADE = { ouvertures: 2, manquees: 0, enTrop: 0, bouts: 2, lucarnes: 0, elements: 1, ecarts: 0, coins: 2, determines: 2, vide: false };

/** Un message de l'API Messages, tel que l'appel immediat le recoit. */
export function messageReussi(usage: Record<string, unknown>, sortie: object): object {
  return { id: 'msg_immediat', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(sortie) }], usage };
}

export function demarrerFauxAnthropic(reponse: Reponse): Promise<FauxAnthropic> {
  const faux: FauxAnthropic = {
    url: '',
    batches: [],
    entetes: [],
    statutCreation: 200,
    finLe: '2026-10-14T10:00:00Z',
    messages: [],
    reponseMessage: () => ({ statut: 200, corps: messageReussi(USAGE_P2, SORTIE_FACADE) }),
    terminer(id) { for (const b of faux.batches) if (!id || b.id === id) b.etat = 'ended'; },
    fermer: () => new Promise((ok) => serveur.close(() => ok()))
  };
  const vue = (b: BatchFaux) => ({
    id: b.id, type: 'message_batch', processing_status: b.etat,
    request_counts: { processing: b.etat === 'ended' ? 0 : b.corps.requests.length, succeeded: b.etat === 'ended' ? b.corps.requests.length : 0, errored: 0, canceled: 0, expired: 0 },
    created_at: '2026-10-14T09:00:00Z', ended_at: b.etat === 'ended' ? faux.finLe : null, expires_at: '2026-10-15T09:00:00Z'
  });
  const serveur = http.createServer((req, res) => {
    faux.entetes.push(req.headers);
    const json = (statut: number, corps: unknown) => { res.writeHead(statut, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corps)); };
    if (req.headers['x-api-key'] !== CLE || req.headers['anthropic-version'] !== '2023-06-01') return json(401, { type: 'error', error: { type: 'authentication_error', message: 'cle' } });
    const morceaux: Buffer[] = [];
    req.on('data', (m: Buffer) => morceaux.push(m));
    req.on('end', () => {
      const url = req.url || '';
      if (req.method === 'POST' && url === '/v1/messages') {
        const corps = JSON.parse(Buffer.concat(morceaux).toString('utf8')) as Record<string, unknown>;
        faux.messages.push(corps);
        const r = faux.reponseMessage(corps, faux.messages.length - 1);
        return json(r.statut, r.corps);
      }
      if (req.method === 'POST' && url === '/v1/messages/batches') {
        if (faux.statutCreation !== 200) return json(faux.statutCreation, { type: 'error', error: { type: 'invalid_request_error', message: 'requete refusee' } });
        const b: BatchFaux = { id: 'msgbatch_' + (faux.batches.length + 1), corps: JSON.parse(Buffer.concat(morceaux).toString('utf8')), etat: 'in_progress' };
        faux.batches.push(b);
        return json(200, vue(b));
      }
      const m = /^\/v1\/messages\/batches\/([^/]+)(\/results)?$/.exec(url);
      const b = m ? faux.batches.find((x) => x.id === m[1]) : undefined;
      if (!m || !b) return json(404, { type: 'error', error: { type: 'not_found_error', message: 'batch' } });
      if (!m[2]) return json(200, vue(b));
      if (b.etat !== 'ended') return json(400, { type: 'error', error: { type: 'invalid_request_error', message: 'pas fini' } });
      res.writeHead(200, { 'Content-Type': 'application/binary' });
      // Dans le desordre, comme l'API : la page range par identifiant, jamais par position.
      res.end([...b.corps.requests].reverse().map((r) => JSON.stringify(reponse(r.custom_id))).join('\n') + '\n');
    });
  });
  return new Promise((ok) => {
    serveur.listen(0, '127.0.0.1', () => {
      faux.url = 'http://127.0.0.1:' + (serveur.address() as AddressInfo).port;
      ok(faux);
    });
  });
}

/** Les compteurs des deux passes simulees : la premiere ecrit le cache, la seconde le lit. */
export const USAGE_P1 = { input_tokens: 4000, cache_creation_input_tokens: 25000, cache_read_input_tokens: 0, output_tokens: 1500, cache_creation: { ephemeral_5m_input_tokens: 25000, ephemeral_1h_input_tokens: 0 } };
export const USAGE_P2 = { input_tokens: 4000, cache_creation_input_tokens: 0, cache_read_input_tokens: 25000, output_tokens: 1500 };
/** Leur cout au tarif Batch de Claude Haiku 5.5 (0,05 $ / 0,25 $ par MTok, cache a moitie prix). */
export const COUT_P1 = 0.0021375;
export const COUT_P2 = 0.0007;
/** Les comptes de la sortie par defaut (`forme` seule, determinee) : une reponse qui n'est pas vide. */
export const TROUVE_DEFAUT = { ouvertures: 0, manquees: 0, enTrop: 0, bouts: 0, lucarnes: 0, elements: 0, ecarts: 0, coins: 0, determines: 1, vide: false };

/**
 * Une reponse comme Claude l'ecrit sans sortie structuree : du texte autour, un bloc de code, des
 * accents et des majuscules, un nombre en texte, un terme hors vocabulaire, des champs absents.
 */
export const TEXTE_DESORDONNE = 'Voici mon observation :\n```json\n' + JSON.stringify({
  forme: { valeur: 'Deux pans', indices: [{ image: '2', vu: 'pignon sur rue' }, { vu: 'sans image' }] },
  lucarnes: { nombre: 'indéterminé', types: ['jacobine', 'inconnue'] },
  bouts: { gauche: 'Pignon' },
  elements: [{ element: 'cheminee' }, { element: 'verrière', indices: [] }],
  facades: [{ facade: 'sud', ouvertures: { niveaux: 2, parNiveau: [3, '4', 'x'] }, materiau: 'Meulière' }],
  confiance: 'Forte',
  enTrop: 'hors schema'
}) + '\n```\nFin.';

/** Un message reussi dont le texte est donne tel quel. */
export function reussiTexte(customId: string, usage: Record<string, unknown>, texte: string): object {
  const r = reussi(customId, usage) as { result: { message: { content: unknown[] } } };
  r.result.message.content = [{ type: 'thinking', thinking: '' }, { type: 'text', text: texte }];
  return r;
}

/** La reponse par defaut : p1 et p2 reussies, p3 reussie en texte desordonne, `rate` en erreur. */
export const reponseParDefaut: Reponse = (id) => {
  if (id === 'p1') return reussi(id, USAGE_P1);
  if (id === 'p2') return reussi(id, USAGE_P2);
  if (id === 'p3') return reussiTexte(id, USAGE_P2, TEXTE_DESORDONNE);
  return { custom_id: id, result: { type: 'errored', error: { type: 'error', error: { type: 'overloaded_error', message: 'Surcharge' } } } };
};

/** Une demande d'analyse comme L17 l'envoie : deux passes, une image et un texte chacune, deux facades. */
export function demande(ids: string[] = ['p1', 'p2']): object {
  return {
    projet: 'projet-1', idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet', audit: 'audit-1', usage: 'analyse',
    requetes: ids.map((id, i) => ({
      id, passe: i + 1, facades: 2,
      contenu: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJDRA==' } },
        { type: 'text', text: 'Image 1 : photo de rue, prise à 12 m, vers 245°.' }
      ]
    }))
  };
}
