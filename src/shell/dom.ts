// Acces au DOM, types (spec §7.1).
//
// `document.getElementById()` est appele 246 fois dans le fichier d'origine, et rend
// `HTMLElement | null` : au barreau 3 de l'echelle de rigueur (strictNullChecks), chacun de ces
// appels devient une erreur de compilation. Deux helpers evitent d'avoir a ecrire 246 fois la
// meme garde :
//
//   el('undoBtn')      -> l'element, ou une exception immediate s'il manque. Pour tout ce que
//                         index.html declare : si l'element n'est pas la, c'est un bug de
//                         structure, et echouer bruyamment au demarrage vaut mieux qu'un
//                         `if (!x) return;` qui rend la fonction silencieusement inerte.
//   elOpt('id')        -> l'element ou null, pour ce qui n'est pas toujours dans la page.
//
// Les 246 sites migreront progressivement ; ce module est en place pour que le code neuf n'en
// ajoute pas de nouveau.

/** L'element attendu, ou une exception nommant l'identifiant manquant. */
export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const noeud = document.getElementById(id);
  if (!noeud) throw new Error("Element introuvable dans la page : #" + id);
  return noeud as T;
}

/** L'element s'il existe, sinon null - pour ce qui n'est pas toujours dans la page. */
export function elOpt<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Abonnement type : evite les `as` a chaque addEventListener sur un evenement connu. */
export function on<K extends keyof HTMLElementEventMap>(
  cible: HTMLElement,
  evenement: K,
  gestionnaire: (e: HTMLElementEventMap[K]) => void
): () => void {
  cible.addEventListener(evenement, gestionnaire as EventListener);
  return () => cible.removeEventListener(evenement, gestionnaire as EventListener);
}
