import http from 'node:http';
import type { AddressInfo } from 'node:net';

// Une API Message Batches simulee, pour eprouver analyse.php et buildsg/analyseAdmin.mjs sans
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

export function demarrerFauxAnthropic(reponse: Reponse): Promise<FauxAnthropic> {
  const faux: FauxAnthropic = {
    url: '',
    batches: [],
    entetes: [],
    statutCreation: 200,
    finLe: '2026-10-14T10:00:00Z',
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

/** La reponse par defaut : p1 et p2 reussies, `rate` en erreur. */
export const reponseParDefaut: Reponse = (id) => {
  if (id === 'p1') return reussi(id, USAGE_P1);
  if (id === 'p2') return reussi(id, USAGE_P2);
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
