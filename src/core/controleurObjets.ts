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

//
// Deux finesses, pour qu'une ecriture ne refasse que ce qui lit ce qu'elle a change (etape 6.5) :
// - une ecriture qui ne change que la forme d'un objet (le glisser : ses sommets, son centre, son rayon, et ce qui les suit en
//   coordonnees absolues) le dit par `toucherForme` : ce qui ne lit que les attributs des objets (leur nom, leur fonction, leur
//   affichage, ce que l'explorateur et les barres montrent) garde sa cle (`cleDesAttributs`) ;
// - ce qui ne lit que certains objets (une terrasse lit ce qui la perce, le calque des parasols les parasols et les terrasses) se
//   garde sur leur seule version (`cleDesLus`), pas sur celle de l'ensemble.
// Ajouter ou retirer un objet passe toujours par `toucherTout()` (l'historique, sans objet nomme) ou par un tableau remplace.

const versions = new WeakMap<object, number>();
let compteur = 0;
let generale = 0;
// Le compteur des ecritures qui ont pu changer autre chose que la forme : tout `toucher`, pas `toucherForme`.
let attributs = 0;

/** Cet objet a change : ce qui le lit le refera. */
export function toucher(o: object | null | undefined): void {
  if (!o) return;
  versions.set(o, ++compteur);
  attributs++;
}

/**
 * Seule la forme de cet objet a change (ses sommets, son centre, son rayon, et ce qui les suit en coordonnees absolues), ou ce qui
 * s'en calcule et qu'il garde (la nomenclature d'une terrasse) : ce qui le dessine ou le mesure le refera, ce qui ne lit que les
 * attributs des objets non (`cleDesAttributs`).
 */
export function toucherForme(o: object | null | undefined): void {
  if (!o) return;
  versions.set(o, ++compteur);
}

/**
 * Les cotes : une ecriture qui ne change qu'elles (ajouter, modifier, retirer une cote) le dit en touchant ce repere plutot qu'un
 * objet. Rien de ce qui lit les objets ne se refait ; ce qui lit les cotes les a dans sa cle.
 */
export const LES_COTES: object = Object.freeze({});

/** On ne sait pas quel objet a change : tous sont neufs. Le repli de toute ecriture qui ne nomme pas son objet. */
export function toucherTout(): void {
  generale++;
  compteur++;
  attributs++;
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

function numeroDuTableau(objets: readonly object[]): number {
  let t = tableaux.get(objets);
  if (t === undefined) { t = ++prochainTableau; tableaux.set(objets, t); }
  return t;
}

/** La cle des objets : le tableau qui les tient et la version de l'ensemble ; la meme tant que rien n'a ete ecrit. */
export function cleDesObjets(objets: readonly object[]): string {
  return numeroDuTableau(objets) + ':' + versionEnsemble();
}

/**
 * La cle des attributs des objets : la meme tant qu'aucune ecriture n'a change autre chose que la forme d'un objet (un glisser la
 * garde). Pour ce qui lit des objets leur nom, leur fonction, leur affichage, jamais leurs sommets.
 */
export function cleDesAttributs(objets: readonly object[]): string {
  return numeroDuTableau(objets) + ':' + generale + '.' + attributs;
}

// Ce que `cleDesLus` a deja compose, par tableau et par lecteur, pour la version de l'ensemble ou il l'a fait.
const lus = new WeakMap<readonly object[], WeakMap<(o: never) => boolean, { ensemble: string; cle: string }>>();

/**
 * La cle de ce que lit un calcul qui ne lit que certains objets (`lit`) : leur cle et leur version, dans l'ordre du plan. Elle ne
 * change que si l'un d'eux change, ou si un objet entre dans le lot ou en sort. Recomposee une fois par ecriture et par lecteur
 * (un lecteur est une fonction gardee, pas recreee a chaque appel, ou rien n'est repris).
 */
export function cleDesLus<O extends { key?: string }>(objets: readonly O[], lit: (o: O) => boolean): string {
  const ensemble = versionEnsemble();
  let parLecteur = lus.get(objets);
  if (!parLecteur) { parLecteur = new WeakMap(); lus.set(objets, parLecteur); }
  const m = parLecteur.get(lit as (o: never) => boolean);
  if (m && m.ensemble === ensemble) return m.cle;
  let cle = numeroDuTableau(objets) + ':' + generale;
  for (const o of objets) if (lit(o)) cle += '|' + o.key + '@' + versionObjet(o);
  parLecteur.set(lit as (o: never) => boolean, { ensemble, cle });
  return cle;
}
