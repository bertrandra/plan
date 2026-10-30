// Chercher les coins d'une photo d'une facade (calage fin, lot L7) sans geler l'ecran, apres l'avoir corrigee de la distorsion du
// grand-angle s'il le faut (lot L8) : la chaine de l'audit (app/audit/parcelle/etapesSession.ts) l'appelle pour chaque photo.
//
// Dans le navigateur, le calcul part dans un worker (calageFin.worker.ts), cree une fois et garde pour
// les photos suivantes. La ou il n'y a pas de worker (tests, vieux navigateur) ou s'il echoue, le
// calcul se fait sur le fil principal, apres que l'ecran a ete peint : c'est plus lent a l'oeil, jamais
// faux.

import { rechercher, type EntreeRecherche, type ResultatRecherche } from '../../facade/releve/serie.js';

type Reponse = { id: number; resultat?: ResultatRecherche; erreur?: string };

let travailleur: Promise<Worker | null> | null = null;
let suivant = 1;
const enAttente = new Map<number, { resoudre: (r: ResultatRecherche) => void; entree: EntreeRecherche }>();

/** Le calcul sur le fil principal, apres une peinture de l'ecran. */
function surLeFil(e: EntreeRecherche): Promise<ResultatRecherche> {
  return new Promise((resoudre) => {
    setTimeout(() => {
      resoudre(rechercher(e));
    }, 30);
  });
}

/** Le worker, charge a la premiere recherche ; `null` s'il n'y en a pas. */
function obtenirTravailleur(): Promise<Worker | null> {
  if (travailleur) return travailleur;
  if (typeof Worker === 'undefined') return (travailleur = Promise.resolve(null));
  travailleur = import('./calageFin.worker.js?worker&inline')
    .then(({ default: Travailleur }) => {
      const w = new Travailleur();
      w.onmessage = (ev: MessageEvent<Reponse>) => {
        const a = enAttente.get(ev.data.id);
        if (!a) return;
        enAttente.delete(ev.data.id);
        if (ev.data.resultat) a.resoudre(ev.data.resultat);
        else surLeFil(a.entree).then(a.resoudre, () => undefined);
      };
      w.onerror = () => {
        // Un worker qui tombe ne doit pas laisser l'ecran attendre : on finit sur le fil principal,
        // et les recherches suivantes s'y feront aussi.
        travailleur = Promise.resolve(null);
        for (const [id, a] of enAttente) {
          enAttente.delete(id);
          surLeFil(a.entree).then(a.resoudre, () => undefined);
        }
      };
      return w;
    })
    .catch(() => null);
  return travailleur;
}

/** La photo preparee (distorsion) et les coins de la photo, trouves ou predits, avec ce que le calage fin a lu. */
export async function chercherCoins(e: EntreeRecherche): Promise<ResultatRecherche> {
  const w = await obtenirTravailleur();
  if (!w) return surLeFil(e);
  return new Promise((resoudre) => {
    const id = suivant++;
    enAttente.set(id, { resoudre, entree: e });
    w.postMessage({ id, entree: e });
  });
}
