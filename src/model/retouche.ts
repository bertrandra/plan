// La retouche a la main d'un objet venu du cadastre ou de l'IGN (decision du 27 octobre 2026, MD/spec-ouvrages.md).
//
// Un tel objet est pose sur le terrain reel (model/fonctions.ts::estPoseSurLeTerrain) : il ne se deplace ni ne tourne. Sa forme,
// elle, peut etre fausse a l'IGN : la personne peut la retoucher (tirer un sommet ou un cote, en ajouter, en retirer, saisir un
// angle ou une longueur), apres un avertissement. L'accepter pose un marque persistant (`retoucheMain`) : plus de question
// ensuite, et l'actualisation IGN garde l'objet tel quel, sauf si la personne demande de reprendre la version de l'IGN.

import { estPoseSurLeTerrain } from './fonctions.js';
import type { RetoucheMain } from './types.js';

/** Ce que ce module lit d'un objet : sa source, son nom, son marque. */
interface ObjetRetouchable { name?: string; cadastre?: unknown; bdtopo?: unknown; retoucheMain?: RetoucheMain | null }

/** Le jour, au format du marque (`AAAA-MM-JJ`), dans le fuseau de la personne. */
export function jourDuMarque(d: Date = new Date()): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate());
}

/** L'objet a-t-il ete retouche a la main ? */
export const estRetoucheMain = (o: ObjetRetouchable): boolean => !!o.retoucheMain;

/** Retoucher sa forme demande-t-il d'abord l'accord de la personne ? Venu du cadastre ou de l'IGN, et pas encore retouche. */
export const retoucheADemander = (o: ObjetRetouchable): boolean => estPoseSurLeTerrain(o) && !estRetoucheMain(o);

/** Pose le marque (l'appelant dit au controleur des objets que l'objet a change). */
export function marquerRetouche(o: ObjetRetouchable, jour: string = jourDuMarque()): void {
  o.retoucheMain = { date: jour };
}

/** Retire le marque : l'objet reprend la version de sa source. */
export function oublierRetouche(o: ObjetRetouchable): void {
  delete o.retoucheMain;
}

/** Le nom de l'objet dans une question, entre guillemets. */
const nomCite = (o: ObjetRetouchable): string => '« ' + (o.name || 'Objet') + ' »';

/** La source dite a la personne : le cadastre pour une parcelle, l'IGN sinon. */
const source = (o: ObjetRetouchable): string => (o.cadastre && !o.bdtopo ? 'du cadastre' : 'de l’IGN');

/** L'avertissement avant la premiere retouche. */
export function questionRetouche(o: ObjetRetouchable): string {
  return nomCite(o) + ' vient ' + source(o) + '. La retoucher à la main la détache de l’IGN : à la prochaine actualisation, '
    + 'vous choisirez entre garder votre version et reprendre celle de l’IGN. Continuer ?';
}

/** Le jour du marque, lisible (`JJ/MM/AAAA`), ou vide s'il est mal forme. */
export function dateRetoucheLisible(r: RetoucheMain | null | undefined): string {
  const [a, m, j] = (r?.date ?? '').split('-');
  return a && m && j ? j + '/' + m + '/' + a : '';
}

/** Le libelle de la case de l'actualisation IGN, pour un objet retouche. */
export function libelleReprendre(o: ObjetRetouchable): string {
  const date = dateRetoucheLisible(o.retoucheMain);
  return 'Reprendre la version de l’IGN pour ' + nomCite(o) + ', retouché à la main' + (date ? ' le ' + date : '');
}
