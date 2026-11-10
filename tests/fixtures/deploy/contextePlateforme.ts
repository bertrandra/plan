// Une plateforme simulee, reduite a `GET /api/v1/me/context` : ce que deploy/analyse.php
// demande pour reconnaitre un utilisateur par son jeton (audits partages,
// lot L21). Un seul jeton vaut ; les autres sont refuses (401).

import http from 'node:http';
import type net from 'node:net';
import { fichierAuditParcelle } from '../../../src/model/fichierAuditParcelle.js';
import { captureVide } from '../../../src/model/auditParcelle.js';

export const JETON = 'jeton-de-test-0123456789';
export const ORGANISATION = 'org-test';

export interface ContextePlateforme {
  url: string;
  /** Les en-tetes recus, dans l'ordre. */
  entetes: http.IncomingHttpHeaders[];
  fermer(): Promise<void>;
}

export function demarrerContextePlateforme(): Promise<ContextePlateforme> {
  const entetes: http.IncomingHttpHeaders[] = [];
  const serveur = http.createServer((req, res) => {
    entetes.push(req.headers);
    if (req.url !== '/api/v1/me/context') { res.writeHead(404).end(); return; }
    if (req.headers.authorization !== 'Bearer ' + JETON) { res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":{"code":"UNAUTHENTICATED"}}'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ tenant: { id: ORGANISATION }, permissions: ['projects.read', 'projects.write'] }));
  });
  return new Promise((ok) => {
    serveur.listen(0, '127.0.0.1', () => {
      const port = (serveur.address() as net.AddressInfo).port;
      ok({ url: 'http://127.0.0.1:' + port, entetes, fermer: () => new Promise((fin) => serveur.close(() => fin())) });
    });
  });
}

/** Un fichier d'audit de parcelle valide, sans photo : ce que la page envoie. */
export function fichierAudit(idu = '78650000AE0101'): object {
  return fichierAuditParcelle({
    parcelle: { idu, adresse: '2 allée des Limites', origine: { lat: 48.9, lon: 2.13 } },
    code: { version: '2.2.0', commit: null }, regles: { lectureToits: 1, lectureMurs: 2 },
    capture: captureVide(idu, new Date('2026-10-13T08:00:00Z')), batiments: [], mesures: new Map(), propositions: [],
    ecritLe: new Date('2026-10-13T09:00:00Z'),
  });
}
