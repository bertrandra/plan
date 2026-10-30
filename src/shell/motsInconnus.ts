// Un mot lu dans un fichier de projet (ou une reponse du serveur) qui n'est pas dans la table qui le connait : un fichier ecrit
// par une version plus recente, ou corrompu. Indexer la table par ce mot faisait planter l'ecran (Plan 2.2.0, « fAe[e] is not a
// function ») ou ecrivait « undefined » dans un export. Decision du 30 octobre 2026 : chaque table a son repli, et Plan le dit,
// une fois par mot et par session, par le toast de l'application. La donnee, elle, ne change jamais (ni migration, ni
// « projet modifie », ni historique) : ce module ne fait que reconnaitre et dire.

import { showToast } from './dialogs.js';

/**
 * Le mot est-il une clef propre de la table ? `in` ne suffit pas : « constructor » ou « toString » sont dans tout objet, par
 * son prototype, et la table rendrait une fonction a la place d'une valeur.
 */
export function motConnu<T extends object>(table: T, mot: unknown): mot is keyof T & string {
  return typeof mot === 'string' && Object.prototype.hasOwnProperty.call(table, mot);
}

/** Les signaux deja donnes (le message entier) : une fois par mot et par session, pas a chaque rendu. */
const deja = new Set<string>();
// Sans document (tests, export sans page), le toast n'a nulle part ou s'afficher : rien ne doit lever pour un signal.
const toast = (message: string): void => { if (typeof document !== 'undefined') showToast(message); };
let avertir: (message: string) => void = toast;

/** Dit une fois par session ce que Plan a fait d'un mot inconnu (le message le nomme, et dit le repli). */
export function signalerMotInconnu(message: string): void {
  if (deja.has(message)) return;
  deja.add(message);
  avertir(message);
}

/** Le mot tel qu'on l'ecrit dans un message : guillemets francais, et rien qui puisse lever. */
export const citer = (mot: unknown): string => '« ' + String(mot) + ' »';

/**
 * Le libelle d'un mot pour un texte ou un export : celui de la table (mis en forme par `forme`, par exemple en minuscules), ou
 * le mot lu lui-meme, tel quel, s'il est hors catalogue. Jamais « undefined », jamais le libelle d'un repli.
 */
export function libelleOuMot(libelles: object, mot: unknown, forme: (libelle: string) => string = (l) => l): string {
  return motConnu(libelles, mot) ? forme(String((libelles as Record<string, unknown>)[mot])) : String(mot);
}

/** Pour les tests : qui recoit les signaux (par defaut le toast de l'application), et l'oubli de ceux deja donnes. */
export function poserAvertissementMotsInconnus(f: ((message: string) => void) | null): void {
  avertir = f ?? toast;
  deja.clear();
}
