// L'identite des choses : la cle d'un objet, l'identifiant d'une cote (spec §6.1).
//
// Cette regle etait ecrite **huit fois** — six pour les objets, deux pour les cotes — en trois
// orthographes differentes, dans quatre fichiers. Elle tient en trois lignes, ce qui explique
// pourquoi personne ne l'a jamais factorisee ; c'est aussi ce qui la rend facile a recopier de
// travers.
//
// Elle porte en plus **les deux seules sources de non-determinisme du programme** : l'horloge et le
// hasard. Tant qu'elles etaient dispersees, aucun scenario qui cree un objet ou une cote ne pouvait
// etre compare a lui-meme. Les voici en un seul endroit, et injectables.

/** De quoi fabriquer une identite. Les vraies sources par defaut, des sources figees pour un test. */
export interface SourcesDIdentite {
  /** `Date.now` par defaut. */
  horloge?: (() => number) | undefined;
  /** `Math.random` par defaut. */
  alea?: (() => number) | undefined;
}

/**
 * La cle d'un objet neuf : le prefixe de son type, l'instant, un compteur.
 *
 * Les trois sont necessaires. L'instant seul se repete quand deux objets naissent dans la meme
 * milliseconde — un double-clic suffit. Le compteur seul repartirait de zero au rechargement et
 * entrerait en collision avec les cles deja enregistrees.
 *
 * **Le compteur est incremente ici** : appeler cette fonction consomme un numero, meme si la cle
 * obtenue n'est finalement pas utilisee.
 */
export function cleObjet(prefixe: string, etat: { newObjCounter: number }, sources: SourcesDIdentite = {}): string {
  const horloge = sources.horloge || Date.now;
  return prefixe + horloge() + '_' + (etat.newObjCounter++);
}

/**
 * L'identifiant d'une cote : l'instant, et cinq caracteres tires au hasard.
 *
 * Les cotes n'ont pas de compteur — elles ne sont pas numerotees dans l'etat — d'ou le tirage, qui
 * joue le meme role : distinguer deux cotes posees dans la meme milliseconde.
 */
export function idMesure(sources: SourcesDIdentite = {}): string {
  const horloge = sources.horloge || Date.now;
  const alea = sources.alea || Math.random;
  return 'm' + horloge() + '_' + alea().toString(36).slice(2, 7);
}
