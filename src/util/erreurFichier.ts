// Les erreurs d'un fichier fait ou lu sur l'appareil, dites en clair (lot 4 de la simplification de l'IHM, 16 novembre 2026).
//
// La personne lisait « Erreur export DXF: Cannot read properties of undefined (reading 'x') » ou « Echec de l'import JSON :
// Unexpected token < in JSON at position 0 » : le message du moteur, en anglais, qui ne dit ni ce qui se passe ni quoi faire.
// Comme les erreurs du reseau (util/erreurReseau.ts, #714), une erreur de fichier a quelques formes seulement, chacune avec sa
// phrase : la bibliotheque qui fabrique le fichier ne s'est pas chargee, l'appareil manque de memoire, le navigateur a bloque le
// telechargement ou refuse le dessin, le fichier choisi ne se lit pas ou n'est pas du bon format. Le reste, imprevu, se dit tel :
// le fichier n'a pas pu etre fait, reessayer, et le detail a transmettre. Le message d'origine reste a cote, le detail technique
// a copier du bandeau d'erreur (shell/dialogs.ts::showErreur). Pur : ni DOM, ni horloge.

import { detailTechnique, natureErreurReseau } from './erreurReseau.js';

export type NatureErreurFichier = 'bibliotheque' | 'memoire' | 'blocage' | 'dessin' | 'lecture' | 'format' | 'autre';

const MEMOIRE = /out of memory|allocation failed|invalid array length|invalid string length|array buffer|maximum call stack|too much recursion|quotaexceeded/i;
const BLOCAGE = /notallowederror|securityerror|not allowed|permission|denied|blocked|bloqu/i;
const DESSIN = /webgl|canvas|getcontext|toblob|conversion en image|contexte 3d|dessin sur canvas/i;
const LECTURE = /notreadableerror|notfounderror|could not be read|ne peut pas etre lu|lecture du fichier/i;
const FORMAT = /syntaxerror|unexpected token|unexpected end of json|is not valid json|json\.parse|mal forme|malformed|invalide|invalid/i;

type ErreurLue = { name?: unknown } | null | undefined;

/** La nature d'une erreur de fichier. Une erreur de reseau (le chargement de la bibliotheque) passe avant tout. */
export function natureErreurFichier(e: unknown): NatureErreurFichier {
  if (natureErreurReseau(e)) return 'bibliotheque';
  const nom = (e as ErreurLue) && typeof (e as { name?: unknown }).name === 'string' ? String((e as { name: string }).name) : '';
  const texte = nom + ' ' + detailTechnique(e);
  if (nom === 'RangeError' || MEMOIRE.test(texte)) return 'memoire';
  if (BLOCAGE.test(texte)) return 'blocage';
  if (DESSIN.test(texte)) return 'dessin';
  if (LECTURE.test(texte)) return 'lecture';
  if (nom === 'SyntaxError' || FORMAT.test(texte)) return 'format';
  return 'autre';
}

/**
 * Un export qui a echoue : `quoi` est le sujet de la phrase, avec son article (« Le plan en DXF », « Le dossier PDF »,
 * « La scène 3D (GLB) ») ; `genre` accorde la phrase (« préparée » pour une note). Rend la phrase (ce qui se passe, quoi faire)
 * et le detail technique.
 */
export function erreurExport(e: unknown, quoi: string, genre: 'm' | 'f' = 'm'): { texte: string; detail: string } {
  const detail = detailTechnique(e);
  const a = genre === 'f' ? 'e' : '';
  switch (natureErreurFichier(e)) {
    case 'bibliotheque': return { texte: quoi + ' n’a pas pu être préparé' + a + ' : la bibliothèque qui le fabrique ne s’est pas chargée. Vérifiez votre connexion, puis réessayez.', detail };
    case 'memoire': return { texte: quoi + ' est trop lourd' + a + ' pour la mémoire de cet appareil. Fermez d’autres onglets, puis réessayez ; à défaut, faites-le depuis un ordinateur.', detail };
    case 'blocage': return { texte: 'Le navigateur a bloqué le téléchargement. Autorisez les téléchargements pour ce site, puis réessayez.', detail };
    case 'dessin': return { texte: quoi + ' n’a pas pu être dessiné' + a + ' : le navigateur refuse l’accélération graphique (désactivée, ou trop de vues 3D ouvertes). Fermez d’autres onglets 3D ou réactivez l’accélération matérielle, puis réessayez.', detail };
    default: return { texte: quoi + ' n’a pas pu être produit' + a + '. Réessayez ; si l’erreur revient, copiez le détail technique et transmettez-le au support.', detail };
  }
}

/**
 * Un fichier choisi qui ne s'ouvre pas : `format` est ce que la personne a voulu ouvrir (« projet Plan (JSON) », « SVG »,
 * « modèle 3D (GLB) »), `attendu` ce qu'il faut choisir a la place ; `nature`, quand l'appelant la sait (un refus de la
 * validation du projet est un mauvais format, quel que soit son message). Rend la phrase et le detail technique.
 */
export function erreurImport(e: unknown, format: string, attendu: string, nature: NatureErreurFichier = natureErreurFichier(e)): { texte: string; detail: string } {
  const detail = detailTechnique(e);
  switch (nature) {
    case 'bibliotheque': return { texte: 'Le fichier ' + format + ' n’a pas pu être ouvert : la bibliothèque qui le lit ne s’est pas chargée. Vérifiez votre connexion, puis réessayez.', detail };
    case 'memoire': return { texte: 'Le fichier ' + format + ' est trop lourd pour la mémoire de cet appareil. Fermez d’autres onglets, puis réessayez.', detail };
    case 'lecture': case 'blocage': return { texte: 'Le fichier n’a pas pu être lu sur l’appareil. Vérifiez qu’il est toujours à sa place, puis choisissez-le de nouveau.', detail };
    case 'format': return { texte: 'Ce fichier n’est pas un ' + format + ' lisible. ' + attendu, detail };
    default: return { texte: 'Le fichier ' + format + ' n’a pas pu être ouvert. Réessayez ; si l’erreur revient, copiez le détail technique et transmettez-le au support.', detail };
  }
}
