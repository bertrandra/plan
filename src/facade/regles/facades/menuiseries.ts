// Les regles des menuiseries (lot L1 de MD/spec-lecture-ia-elargie.md §5.1, point 3) : ce que le moteur decide des details d'une baie
// lus par le run d'une facade (la menuiserie, la couleur des volets, le garde-corps). Claude dit des mots ; ces regles les traduisent :
// - une couleur n'est retenue que dite par la majorite des passes (le vote, voteEnrichi.ts), puis traduite par la palette des facades
//   (regles/facades/reglages.json) : un mot hors de la palette ne se traduit pas ;
// - un garde-corps ne se pose que sur une ouverture au-dessus du sol (une baie d'etage) ; lu sans allege, il en donne une
//   (`garde-corps`), puisqu'il est devant la baie ; sa hauteur vient de la part lue par le calage du mur (decision 4), bornee ;
// - les details ne vont qu'a une ouverture retenue : l'accord avec la detection (ia.ts, `accorderOuvertures`) les porte sur les
//   ouvertures qu'elle retrouve, une boite seule de Claude reste decochee avec eux. Pur.

import { couleurDuMot } from '../../../regles/facades/palette.js';
import type { DetailsOuverture } from '../../../model/types.js';
import type { DetailsLus } from '../../../regles/facades/observations.js';

/** Une baie dont l'appui est plus bas que cela est au sol (une porte, une porte-fenetre de plain-pied) : pas de garde-corps. */
export const APPUI_GARDE_CORPS_MIN_M = 0.25;
/** Un garde-corps lu plus bas ou plus haut que cela n'est pas cru : la hauteur est omise, le type reste (le dessin courant, 1 m). */
export const HAUTEUR_GARDE_CORPS_M = { min: 0.4, max: 1.5 } as const;

const cm = (v: number) => Math.round(v * 100) / 100;

/**
 * Les details d'une baie de `y` (appui) a `y + h` metres, sur un mur de `egoutM` metres a l'egout, d'apres ce que le run en a lu ; vide
 * quand il n'en dit rien de traduisible. `allege` : celle que la baie a deja (la lecture ne la remplace pas).
 */
export function detailsDeLIa(lus: DetailsLus | undefined, baie: { y: number }, egoutM: number, allege?: DetailsOuverture['allege']): DetailsOuverture {
  if (!lus) return {};
  const out: DetailsOuverture = {};
  const couleur = couleurDuMot(lus.menuiserie.couleur);
  if (lus.menuiserie.materiau || couleur) out.menuiserie = { ...(lus.menuiserie.materiau ? { materiau: lus.menuiserie.materiau } : {}), ...(couleur ? { couleur } : {}), source: 'ia' };
  const volets = lus.couleurVolets === 'sans-objet' ? null : couleurDuMot(lus.couleurVolets);
  if (volets) out.couleurVolets = volets;
  const g = lus.gardeCorps;
  if (g.type && g.type !== 'sans-objet' && baie.y >= APPUI_GARDE_CORPS_MIN_M) {
    const haut = g.haut !== null ? cm(g.haut * egoutM - baie.y) : null;
    const gc = couleurDuMot(g.couleur);
    out.gardeCorps = { type: g.type, ...(haut !== null && haut >= HAUTEUR_GARDE_CORPS_M.min && haut <= HAUTEUR_GARDE_CORPS_M.max ? { hauteurM: haut } : {}), ...(gc ? { couleur: gc } : {}), source: 'ia' };
    if (!allege) out.allege = 'garde-corps';
  }
  return out;
}

const MATIERES: Readonly<Record<string, string>> = { bois: 'bois', pvc: 'PVC', alu: 'aluminium', acier: 'acier' };
const GARDE_CORPS: Readonly<Record<string, string>> = { barreaux: 'à barreaux', 'fer-forge': 'en fer forgé', verre: 'en verre', plein: 'plein' };

/** Ce que les details lus d'une facade disent, en clair, pour l'ecran : « menuiseries en bois, garde-corps en fer forgé ». */
export function direDetailsLus(details: readonly DetailsOuverture[]): string | null {
  const matieres = [...new Set(details.map((d) => d.menuiserie?.materiau).filter((x): x is NonNullable<typeof x> => !!x))];
  const couleurs = details.filter((d) => d.menuiserie?.couleur).length;
  const gardes = [...new Set(details.map((d) => d.gardeCorps?.type).filter((x): x is NonNullable<typeof x> => !!x))];
  const bouts: string[] = [];
  if (matieres.length) bouts.push('menuiseries en ' + matieres.map((m) => MATIERES[m] ?? m).join(' et '));
  if (couleurs) bouts.push(couleurs + (couleurs > 1 ? ' couleurs de menuiserie lues' : ' couleur de menuiserie lue'));
  if (gardes.length) bouts.push('garde-corps ' + gardes.map((g) => GARDE_CORPS[g] ?? g).join(', '));
  return bouts.length ? bouts.join(', ') : null;
}
