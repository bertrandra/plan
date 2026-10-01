// Creation d'elements SVG, typee (spec §7.2).
//
// `document.createElementNS(svgNS, 'line')` est appele 55 fois dans le fichier d'origine et rend
// un `SVGElement` generique : ni `x1` ni `points` ne sont connus du compilateur, et une faute de
// frappe dans un nom d'attribut ne se voit qu'a l'ecran. `creerSvg('line')` rend un
// `SVGLineElement`, et `attrs()` accepte des nombres sans conversion manuelle.

export const svgNS = 'http://www.w3.org/2000/svg';

/** Cree un element SVG du bon type, avec ses attributs. */
export function creerSvg<K extends keyof SVGElementTagNameMap>(
  nom: K,
  attributs?: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(svgNS, nom);
  if (attributs) attrs(el, attributs);
  return el;
}

/** Pose des attributs, en convertissant les nombres - le cas courant pour des coordonnees. */
export function attrs(el: Element, attributs: Record<string, string | number>): void {
  for (const [nom, valeur] of Object.entries(attributs)) el.setAttribute(nom, String(valeur));
}
