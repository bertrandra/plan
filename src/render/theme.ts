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
// trait et les pastilles sur `--ink` et `--on-ink`, la grille sur `--rule`, le halo sur `--paper`,
// les poignees sur `--accent` et `--panel-bg`. Quand la palette du serveur arrive
// (app/paletteServeur.ts), `poserEncres` les reprend et le plan se redessine : d'ou des liaisons
// `let`, que les modules de rendu relisent a chaque dessin. Les cotes gardent leur bleu, qui n'est
// pas un jeton. Les couleurs des objets sont celles du projet et ne changent pas avec le theme ; les
// exports gardent leurs propres encres (ils n'importent d'ici que la geometrie des cotes).

// Hors navigateur (tests unitaires en environnement Node), il n'y a pas de theme : on prend
// l'encre claire. Sans cette garde, importer n'importe quel module de rendu pour tester sa
// geometrie ferait echouer le chargement sur un `window` absent.
export const themeSombre =
  typeof window !== 'undefined' &&
  !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

/** Les encres d'origine, par theme : les valeurs de `styles/jetons.ts`. */
const ORIGINE = themeSombre
  ? { ink: '#F1E7D0', rule: '#4A3F30', paper: '#1C1610', accent: '#E0B564', panel: '#262017', onInk: '#1C1610', relief: '#C9A97A' }
  : { ink: '#2B2117', rule: '#D9CDB2', paper: '#F7F2E7', accent: '#7A5C31', panel: '#FFFDF8', onInk: '#FFFDF8', relief: '#8C6B3F' };

export let SVG_INK = ORIGINE.ink;
export let SVG_GRID_MAJOR = ORIGINE.rule;
/** Halo pose derriere les etiquettes pour qu'elles restent lisibles au-dessus d'un objet. */
export let SVG_LABEL_HALO = ORIGINE.paper + 'cc';
export const SVG_MEASURE_LINE = themeSombre ? '#8FC7DE' : '#1E6B8C';
export const SVG_MEASURE_TEXT = themeSombre ? '#B8E4F7' : '#0F4C63';
/** Les poignees d'un objet selectionne : un anneau a l'accent sur fond clair (maquette, 2.1.1). */
export let SVG_POIGNEE = ORIGINE.accent;
export let SVG_POIGNEE_FOND = ORIGINE.panel;
/** Les longueurs des cotes d'un objet selectionne : texte clair dans une pastille d'encre. */
export let SVG_PASTILLE = ORIGINE.ink;
export let SVG_PASTILLE_TEXTE = ORIGINE.onInk;
/** Les courbes de niveau du relief (render/relief.ts) : un brun discret, sous les objets. */
export let SVG_RELIEF = ORIGINE.relief;

/** L'evenement qui demande a l'atelier de redessiner le plan apres un changement d'encres. */
export const EVENEMENT_ENCRES = 'plan:encres';

/** Les jetons dont le plan tire ses encres, dans le theme affiche. */
export type JetonsEncres = Record<'ink' | 'rule' | 'paper' | 'accent' | 'panel-bg' | 'on-ink' | 'relief', string>;

/**
 * Reprend les encres du plan dans une palette (les couleurs d'un theme, `#RRGGBB`) ; sans
 * argument, revient a l'origine. Le plan ne change qu'au dessin suivant : a l'appelant de le demander.
 */
export function poserEncres(j?: JetonsEncres): void {
  SVG_INK = j?.ink ?? ORIGINE.ink;
  SVG_GRID_MAJOR = j?.rule ?? ORIGINE.rule;
  SVG_LABEL_HALO = (j?.paper ?? ORIGINE.paper) + 'cc';
  SVG_POIGNEE = j?.accent ?? ORIGINE.accent;
  SVG_POIGNEE_FOND = j?.['panel-bg'] ?? ORIGINE.panel;
  SVG_PASTILLE = j?.ink ?? ORIGINE.ink;
  SVG_PASTILLE_TEXTE = j?.['on-ink'] ?? ORIGINE.onInk;
  SVG_RELIEF = j?.relief ?? ORIGINE.relief;
}

/** Les decimales a l'ecran s'ecrivent a la francaise ; les exports gardent le point (empreintes). */
export const aLaVirgule = (texte: string) => texte.replace(/(\d)\.(\d)/g, '$1,$2');
