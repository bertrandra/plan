// Description du sujet « lucarnes » : ce que Claude doit lire, comment il doit repondre, ce que l'on
// en assemble dans le prompt et le schema d'analyse (src/regles/sujets/assembler.ts).
// Donnees pures : les textes sont ceux du prompt livre (deploy/prompt-analyse.md), decoupes par sujet.

import type { DescriptionSujet } from '../description.js';

export const lucarnes: DescriptionSujet = {
  id: 'lucarnes',
  libelle: `Lucarnes`,
  champs: {
    "lucarnes": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "indices",
        "nombre",
        "types",
        "pan"
      ],
      "properties": {
        "indices": {
          "$ref": "#/$defs/indices"
        },
        "nombre": {
          "$ref": "#/$defs/compte"
        },
        "types": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "jacobine",
              "capucine",
              "chien-assis",
              "rampante",
              "meuniere",
              "oeil-de-boeuf",
              "outeau",
              "indetermine"
            ]
          }
        },
        "pan": {
          "type": "string",
          "enum": [
            "rue",
            "arriere",
            "cote",
            "plusieurs",
            "aucun",
            "indetermine"
          ]
        }
      }
    }
  },
  definitions: {},
  consignes: [
    { rang: 5, texte: `- \`lucarnes\` : nombre (entier ou \`indetermine\`), types vus, pan qui les porte (\`rue\`, \`arriere\`, \`cote\`, \`plusieurs\`, ou \`aucun\` s'il n'y en a pas).` },
  ],
  vocabulaire: [
    { section: `Ouvertures et saillies`, rang: 10, texte: `- **Lucarne** : ouvrage en saillie sur le versant, qui porte une fenêtre verticale.
  - \`jacobine\` : deux pans, petit pignon en façade ;
  - \`capucine\` : trois pans, une croupe en façade ;
  - \`chien-assis\` : un pan en pente inverse du versant ;
  - \`rampante\` : un pan dans le sens du versant, moins pentu ;
  - \`meuniere\` (ou gerbière) : en façade, elle coupe l'égout ;
  - \`oeil-de-boeuf\` : ronde ou ovale ;
  - \`outeau\` : petite ouverture triangulaire de ventilation.` },
  ],
  lectures: [
  ],
  grille: [
  ],
  confusions: [
    { rang: 1, texte: `**Grande lucarne jacobine ou avant-corps à pignon.** L'avant-corps monte jusqu'au faîtage du corps ou le touche ; la lucarne s'arrête en dessous, et son propre faîtage est plus bas que celui du corps.` },
  ],
  rappels: [
  ],
};
