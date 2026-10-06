// Les jetons de couleur de l'interface (MD/spec-ihm-mobile.md §5.1).
//
// Source des valeurs que `app.css` declare en variables CSS, en clair (`:root`) et en sombre (bloc
// `prefers-color-scheme: dark`). La feuille de style ne les importe pas — c'est du CSS — mais un
// test verifie que chaque jeton y est declare avec cette valeur exacte, dans les deux blocs, et que
// les paires texte/fond ci-dessous atteignent le contraste exige. Changer une couleur, c'est donc la
// changer ici et dans la feuille, et le test dit si l'une a ete oubliee ou si la lecture en souffre.
//
// L'atelier ne lit pas ce fichier : les exports ont leurs propres encres, figees par les empreintes,
// et le plan a l'ecran lit les siennes dans render/theme.ts. Seul l'ecran de la palette de l'admin
// (`?admin&ecran=palette`, zones/EcranPalette.tsx) le lit, pour montrer les valeurs et les contrastes.

export type NomJeton =
  | 'ink' | 'ink-soft' | 'paper' | 'paper-deep' | 'stage-bg' | 'stage-trame' | 'panel-bg' | 'panel-2'
  | 'segment-bg' | 'input-bg' | 'border' | 'rule' | 'hairline' | 'relief' | 'accent' | 'on-accent' | 'accent-light' | 'on-accent-light'
  | 'on-ink' | 'ok' | 'danger' | 'danger-bg' | 'alerte' | 'toast-bg' | 'on-toast' | 'fond-3d'
  | 'camera-bg' | 'on-camera' | 'camera-ok' | 'camera-alerte';

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
    // Les courbes de niveau du relief : un brun discret, lisible sur le canevas sans peser sur les objets.
    'relief': '#8C6B3F',
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
    'fond-3d': '#DFE7EA',
    // La scene de prise de vue du releve de facade : une camera se regarde sur fond sombre, quel que
    // soit le theme - un cadre clair autour de l'image eblouit et fausse le jugement de l'exposition.
    'camera-bg': '#14100B',
    'on-camera': '#FFFDF8',
    'camera-ok': '#8FD49B',
    'camera-alerte': '#F2B38F'
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
    'relief': '#C9A97A',
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
    'fond-3d': '#1F2426',
    'camera-bg': '#14100B',
    'on-camera': '#FFFDF8',
    'camera-ok': '#8FD49B',
    'camera-alerte': '#F2B38F'
  }
};

/** Les familles de la palette, dans l'ordre ou l'ecran de la palette les montre. */
export type FamilleJeton = 'texte' | 'fonds' | 'traits' | 'accent' | 'etats' | 'notifications' | 'scenes';

export const FAMILLES_JETONS: { id: FamilleJeton; titre: string; idee: string }[] = [
  { id: 'texte', titre: 'Encres', idee: 'Ce qui se lit : le texte, et le texte posé sur une couleur pleine.' },
  { id: 'fonds', titre: 'Papiers', idee: 'Les fonds, du plus profond au plus clair : page, plan, panneaux, champs.' },
  { id: 'traits', titre: 'Traits', idee: 'Bordures et filets : ils séparent sans peser.' },
  { id: 'accent', titre: 'Bois', idee: 'L’accent : la sélection, l’état actif, le total. Une seule couleur forte.' },
  { id: 'etats', titre: 'États', idee: 'Enregistré, alerte, danger : toujours accompagnés d’un mot ou d’une icône.' },
  { id: 'notifications', titre: 'Notifications', idee: 'Le toast, en négatif de la page.' },
  { id: 'scenes', titre: 'Scènes', idee: 'Le ciel de la Vue 3D et la chambre noire du relevé de façade.' }
];

/**
 * Le role de chaque jeton : sa famille et ce qu'il colore. Le type exige une entree par jeton, et
 * l'ecran de la palette les montre famille par famille.
 */
export const ROLES_JETONS: Record<NomJeton, { famille: FamilleJeton; role: string }> = {
  'ink': { famille: 'texte', role: 'Texte courant, titres' },
  'ink-soft': { famille: 'texte', role: 'Libellés, notes, unités' },
  'on-ink': { famille: 'texte', role: 'Texte sur l’encre (bouton principal)' },
  'paper': { famille: 'fonds', role: 'Fond de page' },
  'paper-deep': { famille: 'fonds', role: 'Fonds en retrait : barre d’état, onglets inactifs' },
  'stage-bg': { famille: 'fonds', role: 'Canevas du plan' },
  'stage-trame': { famille: 'fonds', role: 'Trame du canevas' },
  'panel-bg': { famille: 'fonds', role: 'Panneaux et feuilles' },
  'panel-2': { famille: 'fonds', role: 'Tuiles, chiffres clés, boutons − et +' },
  'segment-bg': { famille: 'fonds', role: 'Fond d’une commande segmentée' },
  'input-bg': { famille: 'fonds', role: 'Champs de saisie' },
  'border': { famille: 'traits', role: 'Bordure des panneaux' },
  'rule': { famille: 'traits', role: 'Contour des commandes, filets de titre' },
  'hairline': { famille: 'traits', role: 'Filets entre les lignes' },
  'relief': { famille: 'traits', role: 'Courbes de niveau' },
  'accent': { famille: 'accent', role: 'Sélection, état actif, bouton Créer, total' },
  'on-accent': { famille: 'accent', role: 'Texte sur l’accent' },
  'accent-light': { famille: 'accent', role: 'Actif doux, pastilles, survol' },
  'on-accent-light': { famille: 'accent', role: 'Texte sur l’accent doux' },
  'ok': { famille: 'etats', role: 'Enregistré, réussi' },
  'alerte': { famille: 'etats', role: 'Bordure des alertes' },
  'danger': { famille: 'etats', role: 'Suppression, erreurs' },
  'danger-bg': { famille: 'etats', role: 'Fond d’une erreur' },
  'toast-bg': { famille: 'notifications', role: 'Fond des notifications' },
  'on-toast': { famille: 'notifications', role: 'Texte des notifications' },
  'fond-3d': { famille: 'scenes', role: 'Ciel de la Vue 3D' },
  'camera-bg': { famille: 'scenes', role: 'Chambre noire du relevé' },
  'on-camera': { famille: 'scenes', role: 'Texte sur la chambre noire' },
  'camera-ok': { famille: 'scenes', role: 'Cadrage juste' },
  'camera-alerte': { famille: 'scenes', role: 'Cadrage à reprendre' }
};

/**
 * Les polices : deux familles, deux roles, et le monospace pour ce qui se recopie (spec-ihm-mobile
 * §5.2, decision 1 : des piles systeme, aucune police telechargee). `app.css` les declare en
 * `--serif`, `--sans` et `--mono` avec ces piles exactes ; un test le verifie, comme les couleurs.
 */
export type NomPolice = 'serif' | 'sans' | 'mono';

export const POLICES: Record<NomPolice, { nom: string; pile: string; role: string; usages: string[] }> = {
  serif: {
    nom: 'Serif — le document',
    pile: 'Georgia,"Iowan Old Style",serif',
    role: 'Ce qu’on lit comme un document : noms d’objets, titres de panneaux, boutons principaux, indications en italique.',
    usages: ['Titre d’un panneau', 'Nom d’un objet', 'Indication en italique']
  },
  sans: {
    nom: 'Sans — l’instrument',
    pile: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
    role: 'Ce qu’on manipule : menus, palette, barre d’état, libellés de champs, en-têtes de section en petites capitales.',
    usages: ['Libellé d’un champ', 'Entrée de menu', 'EN-TÊTE DE SECTION']
  },
  mono: {
    nom: 'Monospace — ce qui se recopie',
    pile: 'ui-monospace,"SF Mono",Menlo,monospace',
    role: 'Seulement ce qui se recopie à l’identique : résumé, références de requête, bandeau d’erreur, clés.',
    usages: ['AE 101 — parcelle', 'projet.enregistrer', '--accent']
  }
};

/** Les rayons (spec-ihm-mobile §5.3), declares tels quels dans `app.css` ; un test le verifie. */
export const RAYONS: Record<'r-champ' | 'r-bouton' | 'r-tuile' | 'r-panneau' | 'r-feuille', string> = {
  'r-champ': '10px', 'r-bouton': '12px', 'r-tuile': '14px', 'r-panneau': '16px', 'r-feuille': '22px'
};

/** L'echelle des tailles, en `rem` : compacte, c'est un logiciel metier. */
export const ECHELLE_TEXTE: { taille: string; police: NomPolice; usage: string; exemple: string; capitales?: boolean }[] = [
  { taille: '1.6rem', police: 'serif', usage: 'Titre d’écran', exemple: 'Palette de l’interface' },
  { taille: '1.15rem', police: 'serif', usage: 'Titre de boîte', exemple: 'Configurer la terrasse' },
  { taille: '1.05rem', police: 'serif', usage: 'Titre de panneau', exemple: 'Terrasse — 35,01 m²' },
  { taille: '0.8rem', police: 'sans', usage: 'Corps, libellés', exemple: 'Entraxe des solives' },
  { taille: '0.72rem', police: 'sans', usage: 'Notes, unités', exemple: 'Les deux coins de ce côté sont figés.' },
  { taille: '0.62rem', police: 'sans', usage: 'En-tête de section', exemple: 'Fondation', capitales: true }
];

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
  ['relief', 'stage-bg', 3],
  ['ok', 'panel-bg', 3],
  ['alerte', 'panel-bg', 3],
  ['on-camera', 'camera-bg', 4.5],
  ['camera-ok', 'camera-bg', 4.5],
  ['camera-alerte', 'camera-bg', 4.5]
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
