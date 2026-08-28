// Encres du plan dessine en SVG (spec §3.2, render/).
//
// Le plan est dessine a la main en SVG : il ne beneficie pas des variables CSS de la page, et ses
// couleurs doivent donc etre choisies en JavaScript. Elles suivent le theme du systeme, comme le
// reste de l'interface - un plan a l'encre sombre sur fond sombre serait illisible.
//
// Le choix est fait UNE fois au chargement : le plan ne se redessine pas tout seul quand le theme
// du systeme change en cours de session, et c'est un compromis assume - basculer le theme demande
// un rechargement.

// Hors navigateur (tests unitaires en environnement Node), il n'y a pas de theme : on prend
// l'encre claire. Sans cette garde, importer n'importe quel module de rendu pour tester sa
// geometrie ferait echouer le chargement sur un `window` absent.
export const themeSombre =
  typeof window !== 'undefined' &&
  !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

export const SVG_INK = themeSombre ? '#EFE4C8' : '#3B2E1F';
export const SVG_GRID_MAJOR = themeSombre ? '#6b5a41' : '#C9B98C';
export const SVG_GRID_MINOR = themeSombre ? '#3a3020' : '#EDE5D0';
/** Halo pose derriere les etiquettes pour qu'elles restent lisibles au-dessus d'un objet. */
export const SVG_LABEL_HALO = themeSombre ? '#241C13cc' : '#FBF7EEcc';
export const SVG_MEASURE_LINE = themeSombre ? '#8FC7DE' : '#1E6B8C';
export const SVG_MEASURE_LINE_SOFT = themeSombre ? '#5C93A8' : '#6B9CB0';
export const SVG_MEASURE_TEXT = themeSombre ? '#B8E4F7' : '#0F4C63';
