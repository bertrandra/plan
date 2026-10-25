import http from 'node:http';
import type { AddressInfo } from 'node:net';

// La plateforme simulee, reduite a `GET /api/v1/me/context` (spec-connexion-plateforme 3.4) : ce
// qu'analyse.php lui demande pour verifier le jeton d'un utilisateur
// (plan D1, lot L17). Deux jetons connus : un qui ecrit les projets, un qui ne fait que les lire.

export const JETON_ORGA = 'jeton-de-test-organisation-un';
export const JETON_LECTEUR = 'jeton-de-test-lecteur-seul';
/** L'identifiant du locataire : un uuid, comme la plateforme les donne. */
export const ORGA = '3f0a6b2e-7c41-4d8a-9e21-5b7c0d9e1f23';

export interface FauxPlateforme {
  url: string;
  /** Les jetons recus, dans l'ordre. */
  jetons: string[];
  fermer(): Promise<void>;
}

function contexte(permissions: string[]): object {
  return {
    user: { id: 'u-1', email: 'test@example.org', display_name: 'Test', locale: 'fr' },
    tenant: { id: ORGA, slug: 'orga-un', name: 'Organisation Un' },
    product: { id: 'p-1', code: 'plan', name: 'Plan', app_url: 'https://plan.example.org' },
    roles: ['USER'], permissions, capabilities: ['plan.access'], entitlements: [], usage: [], token_expires_at: null
  };
}

export function demarrerFauxePlateforme(): Promise<FauxPlateforme> {
  const faux: FauxPlateforme = { url: '', jetons: [], fermer: () => new Promise((ok) => serveur.close(() => ok())) };
  const serveur = http.createServer((req, res) => {
    const json = (statut: number, corps: unknown) => { res.writeHead(statut, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corps)); };
    if (req.url !== '/api/v1/me/context' || req.headers['x-product'] !== 'plan') return json(404, { code: 'NOT_FOUND', message: 'route' });
    const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
    const jeton = m ? m[1]! : '';
    faux.jetons.push(jeton);
    if (jeton === JETON_ORGA) return json(200, contexte(['projects.read', 'projects.write']));
    if (jeton === JETON_LECTEUR) return json(200, contexte(['projects.read']));
    return json(401, { code: 'UNAUTHENTICATED', message: 'jeton' });
  });
  return new Promise((ok) => {
    serveur.listen(0, '127.0.0.1', () => { faux.url = 'http://127.0.0.1:' + (serveur.address() as AddressInfo).port; ok(faux); });
  });
}
