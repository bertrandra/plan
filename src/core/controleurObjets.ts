// Le controleur des objets : le seul a dire « cet objet a change » (MD/spec-ouvrages.md, etape 6.1).
//
// Les objets du plan sont modifies sur place, depuis une soixantaine d'endroits (gestes, inspecteur, commandes, taches de fond) :
// rien ne disait lequel avait change, et le plan redessinait ses 600 objets a chaque image alors qu'en conception un seul bouge.
// Chaque objet porte ici une version ; ce qui l'ecrit la fait monter (`toucher`). Le dessin du plan, et les calculs qui le
// voudront, gardent ce qu'ils ont fait d'un objet tant que sa version n'a pas bouge.
//
// Le repli est sur : une ecriture qui ne sait pas nommer son objet appelle `toucherTout()` (c'est ce que fait l'historique quand
// on ne lui passe rien), et tout est neuf. Un objet recree (annulation, ouverture, import) n'a pas de version : il est neuf aussi.
// Un objet oublie par un chemin d'ecriture resterait dessine a son ancienne place : en developpement, le plan redessine quand meme
// les objets inchanges et signale tout ecart (`[cle de version]`, render/pipeline.ts), ce que la fumee fait echouer.

const versions = new WeakMap<object, number>();
let compteur = 0;
let generale = 0;

/** Cet objet a change : ce qui le lit le refera. */
export function toucher(o: object | null | undefined): void {
  if (!o) return;
  versions.set(o, ++compteur);
}

/** On ne sait pas quel objet a change : tous sont neufs. Le repli de toute ecriture qui ne nomme pas son objet. */
export function toucherTout(): void {
  generale++;
  compteur++;
}

/** La version de cet objet : elle change quand il est touche, ou quand tout l'est. */
export function versionObjet(o: object): string {
  let v = versions.get(o);
  if (v === undefined) { v = ++compteur; versions.set(o, v); }
  return generale + '.' + v;
}

/**
 * La version de l'ensemble : elle change a chaque ecriture, quel que soit l'objet. Ce qui depend d'autres objets que le sien la
 * lit (une terrasse est percee par les bassins et les tremies qui la chevauchent) : peu d'objets, donc le repli le plus simple.
 */
export function versionEnsemble(): string {
  return generale + '.' + compteur;
}

// Un tableau d'objets remplace (ouverture, import, annulation) est un autre plan, meme si aucun objet n'a ete touche.
const tableaux = new WeakMap<readonly object[], number>();
let prochainTableau = 0;

/** La cle des objets : le tableau qui les tient et la version de l'ensemble ; la meme tant que rien n'a ete ecrit. */
export function cleDesObjets(objets: readonly object[]): string {
  let t = tableaux.get(objets);
  if (t === undefined) { t = ++prochainTableau; tableaux.set(objets, t); }
  return t + ':' + versionEnsemble();
}
