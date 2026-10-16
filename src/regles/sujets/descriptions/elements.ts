// Description du sujet « elements » : ce que Claude doit lire, comment il doit repondre, ce que l'on
// en assemble dans le prompt et le schema d'analyse (src/regles/sujets/assembler.ts).
// Donnees pures : les textes sont ceux du prompt livre (deploy/prompt-analyse.md), decoupes par sujet.

import type { DescriptionSujet } from '../description.js';

export const elements: DescriptionSujet = {
  id: 'elements',
  libelle: `Éléments du toit`,
  attributs: [],
  champs: {
    "elements": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "indices",
          "element"
        ],
        "properties": {
          "indices": {
            "$ref": "#/$defs/indices"
          },
          "element": {
            "type": "string",
            "enum": [
              "fenetre-de-toit",
              "chassis-eclairage",
              "verriere",
              "coyau",
              "acrotere",
              "garde-corps",
              "lanterneau",
              "pignon-a-redents"
            ]
          }
        }
      }
    }
  },
  definitions: {},
  consignes: [
    { rang: 9, texte: `- \`elements\` : les éléments qui ne se voient que sur photo ou orthophoto (fenêtres de toit, châssis, verrière, coyau, acrotère, garde-corps, lanterneau, pignon à redents), un par entrée, seulement s'ils sont vus.` },
  ],
  vocabulaire: [
    { section: `Ouvertures et saillies`, rang: 11, texte: `- **Châssis d'éclairage** : fenêtre plane, fixe ou à tabatière, dans le plan du versant.
- **Fenêtre de toit** : ouvrant vitré moderne, à ras de la pente.
- **Verrière** : grande surface vitrée en toiture.` },
    { section: `Ouvertures et saillies`, rang: 14, texte: `- **Coyau** : adoucissement de la pente en bas du versant, qui relève l'égout.
- **Pignon à redents** : pignon dont le mur dépasse le toit en marches.` },
  ],
  lectures: [
  ],
  grille: [
  ],
  confusions: [
  ],
  rappels: [
  ],
};
