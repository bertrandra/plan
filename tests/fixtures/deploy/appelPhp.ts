import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Les fonctions d'analyse.php appelees depuis les tests (tests/fixtures/deploy/appel-analyse.php) :
// le calcul du serveur se teste fonction par fonction, comme on teste un module, sans requete HTTP.

export const phpPresent = spawnSync('php', ['-v']).status === 0;

const banc = path.resolve(__dirname, 'appel-analyse.php');

type Appel = { f: string; a: unknown[]; objets?: boolean } | { c: string };
type Resultat = { v: unknown } | { refus: string; statut: number };

/** Plusieurs appels dans un seul processus PHP : chacun rend sa valeur ou son refus. */
export function appelsPhp(appels: Appel[]): Resultat[] {
  const r = spawnSync('php', [banc], { input: JSON.stringify(appels), encoding: 'utf8' });
  if (r.status !== 0) throw new Error('php : ' + r.stderr + r.stdout);
  return JSON.parse(r.stdout) as Resultat[];
}

/** Un appel ; un refus du serveur (Refus, erreur()) devient une exception qui porte son message. */
export function php<T = unknown>(f: string, ...a: unknown[]): T {
  const [r] = appelsPhp([{ f, a }]);
  if (!r) throw new Error('php : aucune reponse');
  if ('refus' in r) throw new Error(r.refus);
  return r.v as T;
}

/** Un appel dont les objets JSON arrivent en objets PHP, comme un schema lu par promptEtSchema. */
export function phpObjets<T = unknown>(f: string, ...a: unknown[]): T {
  const [r] = appelsPhp([{ f, a, objets: true }]);
  if (!r) throw new Error('php : aucune reponse');
  if ('refus' in r) throw new Error(r.refus);
  return r.v as T;
}

/** Une constante d'analyse-fonctions.php (MODELES, PLAFONDS_DEFAUT…). */
export function constantePhp<T = unknown>(nom: string): T {
  const [r] = appelsPhp([{ c: nom }]);
  if (!r || !('v' in r)) throw new Error('php : constante ' + nom);
  return r.v as T;
}
