// Les types de demosAdmin.mjs, pour les tests (tests/unit/buildsg/) : le serveur reste en JavaScript
// pur, sans build, comme app.js.
import type { IncomingMessage, ServerResponse } from 'node:http';

export function creerAdminDemos(options: { dossier: string; motDePasse: string | undefined; maintenant?: () => number }): {
  actif: boolean;
  traiter(req: IncomingMessage, res: ServerResponse, url: URL, base: Record<string, string>): Promise<boolean>;
};
