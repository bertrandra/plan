// Les etiquettes du plan qui se chevauchent (audit UX de la 5.45.0, constat 7) : la moins prioritaire se masque, a l'ecran seulement.
//
// Sur la demonstration, les noms, les longueurs des cotes et les mesures s'empilaient en un paquet illisible pres de la terrasse. Un
// ordre unique dit laquelle garder : ce qui touche l'objet choisi, puis les noms, puis les cotes (longueurs et noms des cotes, noms
// des coins), puis les mesures. Une etiquette masquee l'est par un attribut (`data-chevauche`, `visibility:hidden` dans la feuille de
// style), jamais par son `display`, que le rendu des objets tient pour lui : elle revient des qu'elle a de nouveau la place. Les
// exports dessinent leurs propres etiquettes et n'en savent rien.

/** Les sortes d'etiquettes posees sur le plan (`data-etiquette`), de la plus a la moins prioritaire. */
export const ORDRE_DES_ETIQUETTES = ['nom', 'cote', 'mesure'] as const;
export type SorteEtiquette = typeof ORDRE_DES_ETIQUETTES[number];

export interface Boite { gauche: number; haut: number; droite: number; bas: number }

/** Le rang d'une etiquette : 0 pour celles de l'objet choisi, puis l'ordre des sortes. */
export function rangEtiquette(sorte: string | undefined, de: string | undefined, choisi: string | null): number {
  if (choisi !== null && de === choisi) return 0;
  const i = ORDRE_DES_ETIQUETTES.indexOf(sorte as SorteEtiquette);
  return 1 + (i < 0 ? ORDRE_DES_ETIQUETTES.length : i);
}

const seCoupent = (a: Boite, b: Boite, marge: number) =>
  a.gauche < b.droite - marge && b.gauche < a.droite - marge && a.haut < b.bas - marge && b.haut < a.bas - marge;

/**
 * Les etiquettes gardees, dans l'ordre recu : une a une par rang (a rang egal, dans l'ordre du plan), chacune gardee si elle ne coupe
 * aucune etiquette deja gardee. Une boite vide (etiquette non affichee) ne compte pas et reste « gardee ».
 */
export function etiquettesGardees(etiquettes: readonly { boite: Boite; rang: number }[], marge = 1): boolean[] {
  const ordre = etiquettes.map((_, i) => i).sort((a, b) => (etiquettes[a]?.rang ?? 0) - (etiquettes[b]?.rang ?? 0) || a - b);
  const gardees: Boite[] = [];
  const garde = new Array<boolean>(etiquettes.length).fill(true);
  for (const i of ordre) {
    const b = etiquettes[i]?.boite;
    if (!b || b.droite - b.gauche <= 0 || b.bas - b.haut <= 0) continue;
    if (gardees.some((g) => seCoupent(g, b, marge))) { garde[i] = false; continue; }
    gardees.push(b);
  }
  return garde;
}

/**
 * Applique la regle aux etiquettes d'un plan SVG, une fois par image au plus (plusieurs rendus dans la meme image n'en font
 * qu'une passe). `choisi` : la cle de l'objet choisi, lue au moment de la passe.
 */
export function creerChevauchements(svg: SVGSVGElement, choisi: () => string | null): () => void {
  let prevu = false;
  const passer = () => {
    prevu = false;
    const els = [...svg.querySelectorAll<SVGTextElement>('text[data-etiquette]')];
    for (const e of els) e.removeAttribute('data-chevauche');
    const cle = choisi();
    const etiquettes = els.map((e) => {
      const r = e.textContent ? e.getBoundingClientRect() : null;
      return { boite: r ? { gauche: r.left, haut: r.top, droite: r.right, bas: r.bottom } : { gauche: 0, haut: 0, droite: 0, bas: 0 }, rang: rangEtiquette(e.dataset.etiquette, e.dataset.de, cle) };
    });
    etiquettesGardees(etiquettes).forEach((g, i) => { if (!g) els[i]?.setAttribute('data-chevauche', ''); });
  };
  return () => {
    if (prevu) return;
    prevu = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(passer); else passer();
  };
}
