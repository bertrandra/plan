// Description du sujet « terrasse » : ce que Claude doit lire, comment il doit repondre, ce que l'on
// en assemble dans le prompt et le schema d'analyse (src/regles/sujets/assembler.ts).
// Donnees pures : les textes sont ceux du prompt livre (deploy/prompt-analyse.md), decoupes par sujet.

import type { DescriptionSujet } from '../description.js';

export const terrasse: DescriptionSujet = {
  id: 'terrasse',
  libelle: `Toit-terrasse`,
  champs: {
    "terrasse": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "indices",
        "presente",
        "type",
        "acrotere",
        "edicules"
      ],
      "properties": {
        "indices": {
          "$ref": "#/$defs/indices"
        },
        "presente": {
          "$ref": "#/$defs/ouiNon"
        },
        "type": {
          "type": "string",
          "enum": [
            "inaccessible",
            "accessible",
            "vegetalisee",
            "technique",
            "sans-objet",
            "indetermine"
          ]
        },
        "acrotere": {
          "$ref": "#/$defs/ouiNon"
        },
        "edicules": {
          "$ref": "#/$defs/compte"
        }
      }
    }
  },
  definitions: {},
  consignes: [
    { rang: 7, texte: `- \`terrasse\` : toiture-terrasse présente ou non ; son type, l'acrotère, le nombre d'édicules. \`sans-objet\` pour le type quand il n'y a pas de terrasse.` },
  ],
  vocabulaire: [
    { section: `Ouvertures et saillies`, rang: 13, texte: `- **Acrotère** : rebord maçonné en tête de mur autour d'une toiture-terrasse.
- **Édicule** : petite construction sur une terrasse (cage d'escalier, local technique), de 2 m de côté ou plus.
- **Lanterneau** : ouvrage vitré bas qui éclaire l'étage du dessous depuis une terrasse.` },
    { section: `Types de toiture-terrasse`, rang: 20, texte: `- \`inaccessible\` : on n'y monte que pour l'entretien (gravillons, membrane apparente) ;
- \`accessible\` : une terrasse où l'on vit (dalles, carrelage, lames de bois, garde-corps) ;
- \`vegetalisee\` : couverte de plantes ;
- \`technique\` : porte des machines (climatisation, ventilation, panneaux solaires).` },
  ],
  lectures: [
  ],
  grille: [
  ],
  confusions: [
    { rang: 9, texte: `**Toiture végétalisée ou arbre.** Une toiture végétalisée a une hauteur uniforme et un contour net ; un houppier est irrégulier.` },
  ],
  rappels: [
  ],
};
