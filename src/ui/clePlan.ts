// La cle du plan : un calcul qui ne depend que du plan (le chiffrage, les cotes, la recherche des doublons) se reprend tel quel tant
// qu'elle n'a pas change.
//
// Elle a ete le plan serialise : a 600 objets, 800 Ko et 78 ms au telephone, a chaque rendu, plus que les calculs qu'elle evitait.
// Puis un jeton par tache : exact, mais chaque rendu refaisait tout. C'est maintenant la version de l'ensemble que tient le
// controleur des objets (core/controleurObjets.ts, MD/spec-ouvrages.md etape 6.5) : elle change a chaque ecriture, quel que soit
// l'objet, et un tableau d'objets remplace (ouverture, import) en fait une autre.
//
// Le garde-fou : en developpement, une cle reprise est verifiee contre le plan serialise du calcul qu'elle reprend ; un ecart
// (une ecriture qui n'aurait pas touche son objet) s'ecrit `[cle de version]` dans la console, et la fumee echoue.

import type { ObjetPlan } from '../model/types.js';
import { versionEnsemble } from '../core/controleurObjets.js';

const tableaux = new WeakMap<readonly ObjetPlan[], number>();
let prochainTableau = 0;

// Les grilles d'altitudes entrent dans la serialisation de verification par leur identite : jamais modifiees sur place, seulement
// remplacees.
const grilles = new WeakMap<object, number>();
let prochaineGrille = 0;
const grilleParIdentite = (k: string, v: unknown): unknown => {
  if (k !== 'z' || !Array.isArray(v)) return v;
  let n = grilles.get(v);
  if (n === undefined) { n = ++prochaineGrille; grilles.set(v, n); }
  return 'grille#' + n;
};

const verifier = (): boolean => import.meta.env.DEV && !(globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles;
// Le plan serialise de chaque cle deja donnee : seulement en developpement.
const vus = new Map<string, string>();

/** La cle du plan : la meme tant que rien n'a ete ecrit. */
export function cleDuPlan(objets: readonly ObjetPlan[]): string {
  let t = tableaux.get(objets);
  if (t === undefined) { t = ++prochainTableau; tableaux.set(objets, t); }
  const cle = t + ':' + versionEnsemble();
  if (verifier()) {
    const plan = JSON.stringify(objets, grilleParIdentite);
    const avant = vus.get(cle);
    if (avant === undefined) { if (vus.size > 50) vus.clear(); vus.set(cle, plan); }
    else if (avant !== plan) {
      console.error('[cle de version] le plan a change sans que rien ne soit touche : le chiffrage, les cotes ou les doublons seraient restes ceux d\'avant');
      vus.set(cle, plan);
    }
  }
  return cle;
}
