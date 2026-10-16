// Description du sujet « cheminees » : ce que Claude doit lire, comment il doit repondre, ce que l'on
// en assemble dans le prompt et le schema d'analyse (src/regles/sujets/assembler.ts).
// Donnees pures : les textes sont ceux du prompt livre (deploy/prompt-analyse.md), decoupes par sujet.

import type { DescriptionSujet } from '../description.js';

export const cheminees: DescriptionSujet = {
  id: 'cheminees',
  libelle: `Cheminées`,
  champs: {
    "cheminees": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "indices",
        "nombre",
        "souches"
      ],
      "properties": {
        "indices": {
          "$ref": "#/$defs/indices"
        },
        "nombre": {
          "$ref": "#/$defs/compte"
        },
        "souches": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "position",
              "materiau"
            ],
            "properties": {
              "position": {
                "type": "string",
                "enum": [
                  "faitage",
                  "pan",
                  "pignon",
                  "facade",
                  "indetermine"
                ]
              },
              "materiau": {
                "type": "string",
                "enum": [
                  "brique",
                  "enduit",
                  "pierre",
                  "metal",
                  "indetermine"
                ]
              }
            }
          }
        }
      }
    }
  },
  definitions: {},
  consignes: [
    { rang: 6, texte: `- \`cheminees\` : nombre, puis une entrée par souche vue, avec sa position et son matériau.` },
  ],
  vocabulaire: [
    { section: `Ouvertures et saillies`, rang: 12, texte: `- **Souche de cheminée** : maçonnerie qui sort du toit pour évacuer les fumées. Positions : \`faitage\` (à cheval sur le faîtage), \`pan\` (dans un versant), \`pignon\` (dans l'alignement du mur de bout), \`facade\` (adossée à l'extérieur d'un mur, du sol jusqu'au-dessus de l'égout). Un tubage métallique fin compte comme une cheminée en \`metal\`.` },
  ],
  lectures: [
  ],
  grille: [
  ],
  confusions: [
    { rang: 4, texte: `**Cheminée, arbre ou lucarne.** Une cheminée est étroite (moins de 1,5 m de côté), souvent sur le faîtage ou un pignon ; un arbre est large, irrégulier, et déborde souvent du contour ; une lucarne est alignée sur l'égout ou dans la pente, avec un profil à pans.` },
    { rang: 8, texte: `**Cheminée, édicule ou petit corps.** Une cheminée fait moins de 1,5 m de côté (jusqu'à 2,5 m pour une souche longue) ; un édicule fait 2 m ou plus et ne se trouve que sur un toit plat ; un petit corps touche le contour et porte son propre toit en pente.` },
  ],
  rappels: [
  ],
};
