// Chercher les coins d'une photo du releve (calage fin, lot L7) sans geler l'ecran.
//
// Dans le navigateur, le calcul part dans un worker (calageFin.worker.ts), cree une fois et garde pour
// les photos suivantes. La ou il n'y a pas de worker (tests, vieux navigateur) ou s'il echoue, le
// calcul se fait sur le fil principal, apres que l'ecran a ete peint : c'est plus lent a l'oeil, jamais
// faux.

import { calageFinDuReleve } from '../../facade/calageFin.js';
import { appliquerRecherche, sansDetail, type EntreeRecherche, type Morceau, type ResultatCoins } from './serie.js';

type Reponse = { id: number; resultat?: ResultatCoins; erreur?: string };

let travailleur: Promise<Worker | null> | null = null;
let suivant = 1;
const enAttente = new Map<number, { resoudre: (r: ResultatCoins) => void; entree: EntreeRecherche }>();

/** Le calcul sur le fil principal, apres une peinture de l'ecran. */
function surLeFil(e: EntreeRecherche): Promise<ResultatCoins> {
  return new Promise((resoudre) => {
    setTimeout(() => {
      resoudre(sansDetail(calageFinDuReleve(e.image, e.largeur, e.hauteur, e.prise, e.distance)));
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

/**
 * Lance la recherche des coins d'une prise et range le resultat dans son morceau quand il arrive
 * (`maj` recoit une fonction des morceaux, comme le `setState` de React). Le morceau est reconnu a sa
 * prise : une photo retiree ou reprise entre-temps ne recoit rien.
 */
export function lancerRecherche(prise: Morceau['prise'], e: EntreeRecherche, maj: (f: (ms: Morceau[]) => Morceau[]) => void): void {
  chercherCoins(e).then(
    (r) => maj((ms) => ms.map((x) => (x.prise === prise ? appliquerRecherche(x, r) : x))),
    () => maj((ms) => ms.map((x) => (x.prise === prise ? { ...x, recherche: false } : x))),
  );
}

/** Les coins de la photo, trouves ou predits, et ce que le calage fin a lu. */
export async function chercherCoins(e: EntreeRecherche): Promise<ResultatCoins> {
  const w = await obtenirTravailleur();
  if (!w) return surLeFil(e);
  return new Promise((resoudre) => {
    const id = suivant++;
    enAttente.set(id, { resoudre, entree: e });
    w.postMessage({ id, entree: e });
  });
}
