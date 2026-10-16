// Description du sujet « couverture » : ce que Claude doit lire, comment il doit repondre, ce que l'on
// en assemble dans le prompt et le schema d'analyse (src/regles/sujets/assembler.ts).
// Donnees pures : les textes sont ceux du prompt livre (deploy/prompt-analyse.md), decoupes par sujet.

import type { DescriptionSujet } from '../description.js';

export const couverture: DescriptionSujet = {
  id: 'couverture',
  libelle: `Couverture`,
  champs: {
    "couverture": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "indices",
        "valeur"
      ],
      "properties": {
        "indices": {
          "$ref": "#/$defs/indices"
        },
        "valeur": {
          "type": "string",
          "enum": [
            "tuile-plate",
            "tuile-canal",
            "tuile-mecanique",
            "ardoise",
            "zinc",
            "bac-acier",
            "membrane",
            "gravillons",
            "vegetale",
            "indetermine"
          ]
        }
      }
    }
  },
  definitions: {},
  consignes: [
    { rang: 8, texte: `- \`couverture\` : le matériau de couverture du corps principal.` },
  ],
  vocabulaire: [
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
