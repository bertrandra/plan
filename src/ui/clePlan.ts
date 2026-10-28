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
// Le plan serialise de chaque cle deja donnee, objet par objet : seulement en developpement.
const vus = new Map<string, Map<string, string>>();

/** Le premier champ qui differe entre deux serialisations d'un objet, pour le dire. */
function champQuiDiffere(a: string, b: string): string {
  try {
    const x = JSON.parse(a) as Record<string, unknown>, y = JSON.parse(b) as Record<string, unknown>;
    const differe = (u: Record<string, unknown>, v: Record<string, unknown>) => [...new Set([...Object.keys(u), ...Object.keys(v)])].find((c) => JSON.stringify(u[c]) !== JSON.stringify(v[c]));
    const k = differe(x, y);
    if (!k) return '?';
    const sx = x[k], sy = y[k];
    const sous = sx && sy && typeof sx === 'object' && typeof sy === 'object' && !Array.isArray(sx) ? differe(sx as Record<string, unknown>, sy as Record<string, unknown>) : undefined;
    return sous ? k + '.' + sous : k;
  } catch { return '?'; }
}

/**
 * La cle des objets seule, sans le garde-fou : celle que les zones mettent dans leur cle (zones/composants/abonnement.ts), qui ont
 * le leur (elles comparent leur affichage).
 */
export function cleDesObjets(objets: readonly ObjetPlan[]): string {
  let t = tableaux.get(objets);
  if (t === undefined) { t = ++prochainTableau; tableaux.set(objets, t); }
  return t + ':' + versionEnsemble();
}

/** La cle du plan : la meme tant que rien n'a ete ecrit. */
export function cleDuPlan(objets: readonly ObjetPlan[]): string {
  const cle = cleDesObjets(objets);
  if (verifier()) {
    const plan = new Map(objets.map((o) => [o.key, JSON.stringify(o, grilleParIdentite)]));
    const avant = vus.get(cle);
    if (avant === undefined) { if (vus.size > 50) vus.clear(); vus.set(cle, plan); }
    else {
      const changes = [...plan].filter(([k, j]) => avant.get(k) !== j).map(([k, j]) => {
        const o = objets.find((x) => x.key === k);
        return `« ${o?.name || k} » (${champQuiDiffere(avant.get(k) ?? '{}', j)})`;
      });
      if (changes.length || avant.size !== plan.size) {
        console.error('[cle de version] le plan a change sans que rien ne soit touche : ' + (changes.join(', ') || 'objets ajoutes ou retires')
          + ' ; le chiffrage, les cotes ou les doublons seraient restes ceux d\'avant');
        vus.set(cle, plan);
      }
    }
  }
  return cle;
}
