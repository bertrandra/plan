// Description du sujet « murs » : ce que Claude doit lire, comment il doit repondre, ce que l'on
// en assemble dans le prompt et le schema d'analyse (src/regles/sujets/assembler.ts).
// Donnees pures : les textes sont ceux du prompt livre (deploy/prompt-analyse.md), decoupes par sujet.

import type { DescriptionSujet } from '../description.js';

export const murs: DescriptionSujet = {
  id: 'murs',
  libelle: `Teinte et décor des murs`,
  champs: {
    "teinteMurs": {
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
            "blanc",
            "creme",
            "beige",
            "ocre",
            "rose",
            "gris-clair",
            "gris-fonce",
            "brun",
            "rouge-brique",
            "indetermine"
          ]
        }
      }
    },
    "decorMurs": {
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
            "aucun",
            "colombages",
            "chainages-brique",
            "bandeaux",
            "mixte",
            "indetermine"
          ]
        }
      }
    }
  },
  definitions: {},
  consignes: [
    { rang: 10.25, texte: `- \`teinteMurs\` : la teinte dominante du parement de la maison, sur les photos (jamais sur le rendu, qui montre le modèle) — \`blanc\`, \`creme\`, \`beige\`, \`ocre\`, \`rose\`, \`gris-clair\`, \`gris-fonce\`, \`brun\`, \`rouge-brique\` ; une pierre ou une brique apparente a la teinte de sa matière. \`decorMurs\` : ce qui se dessine sur le parement — \`colombages\` (pans de bois, vrais ou peints), \`chainages-brique\` (angles et encadrements en brique sur un autre parement), \`bandeaux\` (bandes horizontales entre les niveaux), \`aucun\`, \`mixte\`.` },
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
