// Encres du plan dessine en SVG (spec §3.2, render/).
//
// Le plan est dessine a la main en SVG : il ne beneficie pas des variables CSS de la page, et ses
// couleurs doivent donc etre choisies en JavaScript. Elles suivent le theme du systeme, comme le
// reste de l'interface - un plan a l'encre sombre sur fond sombre serait illisible.
//
// Le choix est fait UNE fois au chargement : le plan ne se redessine pas tout seul quand le theme
// du systeme change en cours de session, et c'est un compromis assume - basculer le theme demande
// un rechargement.
//
// Les encres suivent les jetons de l'interface (src/styles/jetons.ts, spec-ihm-mobile §5.1) : le
// trait sur `--ink`, la grille sur `--rule`, le halo sur `--paper`. Les couleurs des objets, elles,
// sont celles du projet et ne changent pas avec le theme ; les exports gardent leurs propres encres.

// Hors navigateur (tests unitaires en environnement Node), il n'y a pas de theme : on prend
// l'encre claire. Sans cette garde, importer n'importe quel module de rendu pour tester sa
// geometrie ferait echouer le chargement sur un `window` absent.
export const themeSombre =
  typeof window !== 'undefined' &&
  !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

export const SVG_INK = themeSombre ? '#F1E7D0' : '#2B2117';
export const SVG_GRID_MAJOR = themeSombre ? '#4A3F30' : '#D9CDB2';
/** Halo pose derriere les etiquettes pour qu'elles restent lisibles au-dessus d'un objet. */
export const SVG_LABEL_HALO = themeSombre ? '#1C1610cc' : '#F7F2E7cc';
export const SVG_MEASURE_LINE = themeSombre ? '#8FC7DE' : '#1E6B8C';
export const SVG_MEASURE_TEXT = themeSombre ? '#B8E4F7' : '#0F4C63';
/** Les poignees d'un objet selectionne : un anneau a l'accent sur fond clair (maquette, 2.1.1). */
export const SVG_POIGNEE = themeSombre ? '#E0B564' : '#7A5C31';
export const SVG_POIGNEE_FOND = themeSombre ? '#262017' : '#FFFDF8';
/** Les longueurs des cotes d'un objet selectionne : texte clair dans une pastille d'encre. */
export const SVG_PASTILLE = themeSombre ? '#F1E7D0' : '#2B2117';
export const SVG_PASTILLE_TEXTE = themeSombre ? '#1C1610' : '#FFFDF8';
/** Les decimales a l'ecran s'ecrivent a la francaise ; les exports gardent le point (empreintes). */
export const aLaVirgule = (texte: string) => texte.replace(/(\d)\.(\d)/g, '$1,$2');
