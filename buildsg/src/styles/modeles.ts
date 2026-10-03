// Les modeles de palette proposes par le menu « Modeles » de l'ecran de la palette (`?palette`).
//
// Des documents `plan-palette` ordinaires, un fichier par modele dans `styles/modeles/`, engendres
// par scripts/generer-modeles-palette.mjs et verifies par tests/unit/styles/modeles.test.ts
// (complets, et chaque contraste exige tient dans les deux themes). Vite les embarque dans le
// fichier livre : le menu marche sans serveur.

import { lireDocumentPalette, type Couleurs } from './paletteServeur.js';

export interface ModelePalette { id: string; nom: string; description: string; couleurs: Couleurs }

const fichiers = import.meta.glob('./modeles/*.json', { eager: true, import: 'default' });

/** Dans l'ordre du menu : les ambiances d'abord, les styles ensuite. */
const ORDRE = ['eau-vive', 'vert-jardin', 'fleurie', 'zen', 'monochrome', 'multicolore', 'psychedelique', 'halloween'];

export const MODELES_PALETTE: ModelePalette[] = Object.values(fichiers).flatMap((d) => {
  const lue = lireDocumentPalette(d);
  const m = d as { id?: unknown; nom?: unknown; description?: unknown };
  return lue && typeof m.id === 'string' && typeof m.nom === 'string'
    ? [{ id: m.id, nom: m.nom, description: typeof m.description === 'string' ? m.description : '', couleurs: lue.couleurs }]
    : [];
}).sort((a, b) => ORDRE.indexOf(a.id) - ORDRE.indexOf(b.id));
