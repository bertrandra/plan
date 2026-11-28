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
  ? { ink: '#F1E7D0', rule: '#4A3F30', paper: '#1C1610', accent: '#E0B564', panel: '#262017', onInk: '#1C1610', relief: '#C9A97A', ecart: '#F2A65A', chaussee: '#B8862B', chausseeBord: '#0F0B06', trottoir: '#4A443B', chausseeReelle: '#3E4246', trottoirReel: '#8E897F', bordureReelle: '#C9C4BA' }
  : { ink: '#2B2117', rule: '#D9CDB2', paper: '#F7F2E7', accent: '#7A5C31', panel: '#FFFDF8', onInk: '#FFFDF8', relief: '#8C6B3F', ecart: '#A34A08', chaussee: '#F2C14E', chausseeBord: '#6B4A12', trottoir: '#E4DED2', chausseeReelle: '#5A5E63', trottoirReel: '#C8C2B5', bordureReelle: '#EDEAE3' };

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

/** Les rues dessinees (option « Rues », render/chaussees.ts) : la chaussee et son bord, jetons `--chaussee` et `--chaussee-bord`. */
export let SVG_CHAUSSEE = ORIGINE.chaussee;
export let SVG_CHAUSSEE_BORD = ORIGINE.chausseeBord;
/** Les trottoirs (model/trottoirs.ts) : jeton `--trottoir` ; leur bordure est le bord de la chaussee. */
export let SVG_TROTTOIR = ORIGINE.trottoir;
/** Les couleurs « Reelles » des rues dessinees : l'enrobe, le beton et le granit (jetons `--chaussee-reelle`, `--trottoir-reel`, `--bordure-reelle`). */
export let SVG_CHAUSSEE_REELLE = ORIGINE.chausseeReelle;
export let SVG_TROTTOIR_REEL = ORIGINE.trottoirReel;
export let SVG_BORDURE_REELLE = ORIGINE.bordureReelle;

/** Les trois encres d'une rue dessinee, selon les couleurs choisies (menu Affichage, sous « Rues »). */
export function encresDesRues(couleurs: 'plan' | 'reelles'): { chaussee: string; trottoir: string; bordure: string } {
  return couleurs === 'reelles'
    ? { chaussee: SVG_CHAUSSEE_REELLE, trottoir: SVG_TROTTOIR_REEL, bordure: SVG_BORDURE_REELLE }
    : { chaussee: SVG_CHAUSSEE, trottoir: SVG_TROTTOIR, bordure: SVG_CHAUSSEE_BORD };
}

/** Un ecart au PLU signale sur le plan (render/pluOverlay.ts) : le jeton `--ecart-plu`, et le texte pose dessus (`--paper`). */
export let SVG_ECART_PLU = ORIGINE.ecart;
export let SVG_ECART_PLU_TEXTE = ORIGINE.paper;

/** L'evenement qui demande a l'atelier de redessiner le plan apres un changement d'encres. */
export const EVENEMENT_ENCRES = 'plan:encres';

/** Les jetons dont le plan tire ses encres, dans le theme affiche. */
export type JetonsEncres = Record<'ink' | 'rule' | 'paper' | 'accent' | 'panel-bg' | 'on-ink' | 'relief' | 'ecart-plu' | 'chaussee' | 'chaussee-bord' | 'trottoir' | 'chaussee-reelle' | 'trottoir-reel' | 'bordure-reelle', string>;

/**
 * Reprend les encres du plan dans une palette (les couleurs d'un theme, `#RRGGBB`) ; sans
 * argument, revient a l'origine. Le plan ne change qu'au dessin suivant : a l'appelant de le demander.
 */
export function poserEncres(j?: JetonsEncres): void {
  FOND_DES_NOMS = j?.paper ?? ORIGINE.paper;
  ENCRE_DES_NOMS = j?.ink ?? ORIGINE.ink;
  encresDesNoms.clear();
  SVG_INK = j?.ink ?? ORIGINE.ink;
  SVG_GRID_MAJOR = j?.rule ?? ORIGINE.rule;
  SVG_LABEL_HALO = (j?.paper ?? ORIGINE.paper) + 'cc';
  SVG_POIGNEE = j?.accent ?? ORIGINE.accent;
  SVG_POIGNEE_FOND = j?.['panel-bg'] ?? ORIGINE.panel;
  SVG_PASTILLE = j?.ink ?? ORIGINE.ink;
  SVG_PASTILLE_TEXTE = j?.['on-ink'] ?? ORIGINE.onInk;
  SVG_RELIEF = j?.relief ?? ORIGINE.relief;
  SVG_ECART_PLU = j?.['ecart-plu'] ?? ORIGINE.ecart;
  SVG_ECART_PLU_TEXTE = j?.paper ?? ORIGINE.paper;
  SVG_CHAUSSEE = j?.chaussee ?? ORIGINE.chaussee;
  SVG_CHAUSSEE_BORD = j?.['chaussee-bord'] ?? ORIGINE.chausseeBord;
  SVG_TROTTOIR = j?.trottoir ?? ORIGINE.trottoir;
  SVG_CHAUSSEE_REELLE = j?.['chaussee-reelle'] ?? ORIGINE.chausseeReelle;
  SVG_TROTTOIR_REEL = j?.['trottoir-reel'] ?? ORIGINE.trottoirReel;
  SVG_BORDURE_REELLE = j?.['bordure-reelle'] ?? ORIGINE.bordureReelle;
}

/** Les decimales a l'ecran s'ecrivent a la francaise ; les exports gardent le point (empreintes). */
export const aLaVirgule = (texte: string) => texte.replace(/(\d)\.(\d)/g, '$1,$2');

/**
 * Le nom d'un objet s'ecrit dans sa couleur, sur un halo du fond (render/objects.ts). En theme sombre, un nom rouge fonce sur un halo
 * presque noir ne se lisait pas (audit UX de la 5.45.0, constat 7) : la couleur est eclaircie vers l'encre du theme, juste assez
 * pour un contraste de 5 avec le fond (4,5 exiges, et le halo n'est pas tout a fait opaque). Ecran seulement : les exports gardent leurs encres, et le projet sa couleur.
 */
let FOND_DES_NOMS = ORIGINE.paper;
let ENCRE_DES_NOMS = ORIGINE.ink;
const encresDesNoms = new Map<string, string>();

function rvb(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim()) ?? /^#([0-9a-f]{3})$/i.exec(c.trim());
  if (!m || !m[1]) return null;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** Le rapport de contraste de deux couleurs `#RRGGBB`. */
export function contraste(a: string, b: string): number {
  const ca = rvb(a), cb = rvb(b);
  if (!ca || !cb) return 21;
  const la = luminance(ca), lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** La couleur d'un nom sur le plan : la sienne, eclaircie vers l'encre du theme si elle ne se lit pas sur le fond. */
export function encreDeNom(couleur: string): string {
  const deja = encresDesNoms.get(couleur);
  if (deja) return deja;
  const c = rvb(couleur), e = rvb(ENCRE_DES_NOMS);
  let rendu = couleur;
  if (c && e && contraste(couleur, FOND_DES_NOMS) < 5) {
    for (let t = 0.1; t <= 1.001; t += 0.1) {
      const m = c.map((v, i) => Math.round(v + ((e[i] ?? v) - v) * t));
      const hex = '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
      rendu = hex;
      if (contraste(hex, FOND_DES_NOMS) >= 5) break;
    }
  }
  encresDesNoms.set(couleur, rendu);
  return rendu;
}
