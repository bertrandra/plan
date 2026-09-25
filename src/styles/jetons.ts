// Les jetons de couleur de l'interface (MD/spec-ihm-mobile.md §5.1).
//
// Source des valeurs que `app.css` declare en variables CSS, en clair (`:root`) et en sombre (bloc
// `prefers-color-scheme: dark`). La feuille de style ne les importe pas — c'est du CSS — mais un
// test verifie que chaque jeton y est declare avec cette valeur exacte, dans les deux blocs, et que
// les paires texte/fond ci-dessous atteignent le contraste exige. Changer une couleur, c'est donc la
// changer ici et dans la feuille, et le test dit si l'une a ete oubliee ou si la lecture en souffre.
//
// Aucun module de l'application ne lit ce fichier : les exports ont leurs propres encres, figees par
// les empreintes, et le plan a l'ecran lit les siennes dans render/theme.ts.

export type NomJeton =
  | 'ink' | 'ink-soft' | 'paper' | 'paper-deep' | 'stage-bg' | 'stage-trame' | 'panel-bg' | 'panel-2'
  | 'segment-bg' | 'input-bg' | 'border' | 'rule' | 'hairline' | 'accent' | 'on-accent' | 'accent-light' | 'on-accent-light'
  | 'on-ink' | 'ok' | 'danger' | 'danger-bg' | 'alerte' | 'toast-bg' | 'on-toast' | 'fond-3d';

export const JETONS: Record<'clair' | 'sombre', Record<NomJeton, string>> = {
  clair: {
    'ink': '#2B2117',
    'ink-soft': '#6B5A41',
    'paper': '#F7F2E7',
    'paper-deep': '#EFE8D8',
    'stage-bg': '#F1EBDC',
    'stage-trame': '#D9CDB2',
    'panel-bg': '#FFFDF8',
    'panel-2': '#F7F2E7',
    'segment-bg': '#F1EBDC',
    'input-bg': '#FFFDF8',
    'border': '#E4D9C1',
    'rule': '#D9CDB2',
    'hairline': '#EFE6D3',
    'accent': '#7A5C31',
    'on-accent': '#FFFDF8',
    'accent-light': '#EFE3C8',
    'on-accent-light': '#5E4623',
    'on-ink': '#FFFDF8',
    'ok': '#3F7A4A',
    'danger': '#8E2A1C',
    'danger-bg': '#FBF1EE',
    'alerte': '#A8442F',
    'toast-bg': '#2B2117',
    'on-toast': '#FFFDF8',
    'fond-3d': '#DFE7EA'
  },
  sombre: {
    'ink': '#F1E7D0',
    'ink-soft': '#BFAE8C',
    'paper': '#1C1610',
    'paper-deep': '#231C14',
    'stage-bg': '#1C1610',
    'stage-trame': '#3A2F22',
    'panel-bg': '#262017',
    'panel-2': '#2F271C',
    'segment-bg': '#1C1610',
    'input-bg': '#2F271C',
    'border': '#3E3325',
    'rule': '#4A3F30',
    'hairline': '#332A1F',
    'accent': '#E0B564',
    'on-accent': '#1C1610',
    'accent-light': '#4A3B22',
    'on-accent-light': '#F1D9A6',
    'on-ink': '#1C1610',
    'ok': '#6BBF7A',
    'danger': '#F2A493',
    'danger-bg': '#3A1E18',
    'alerte': '#E08A6E',
    'toast-bg': '#F1E7D0',
    'on-toast': '#1C1610',
    'fond-3d': '#1F2426'
  }
};

/**
 * Les paires qui portent du texte : [texte, fond, contraste minimal]. 4,5 pour le corps ; 3 pour les
 * grands chiffres et les bordures de commande, qui ne portent pas de lecture fine.
 */
export const PAIRES_CONTRASTE: [NomJeton, NomJeton, number][] = [
  ['ink', 'paper', 4.5],
  ['ink', 'panel-bg', 4.5],
  ['ink', 'panel-2', 4.5],
  ['ink', 'input-bg', 4.5],
  ['ink', 'stage-bg', 4.5],
  ['ink-soft', 'panel-bg', 4.5],
  ['ink-soft', 'paper', 4.5],
  ['ink-soft', 'panel-2', 4.5],
  ['on-ink', 'ink', 4.5],
  ['on-accent', 'accent', 4.5],
  ['on-accent-light', 'accent-light', 4.5],
  ['ink', 'accent-light', 4.5],
  ['accent', 'panel-bg', 4.5],
  ['danger', 'danger-bg', 4.5],
  ['danger', 'panel-bg', 4.5],
  ['on-toast', 'toast-bg', 4.5],
  ['ok', 'panel-bg', 3],
  ['alerte', 'panel-bg', 3]
];

/** Luminance relative WCAG 2.1 d'une couleur `#RRGGBB`. */
export function luminance(hex: string): number {
  const canal = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Rapport de contraste WCAG entre deux couleurs `#RRGGBB`. */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}
