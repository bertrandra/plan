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
    { section: `Couvertures`, rang: 25, texte: `- \`tuile-plate\` : petites tuiles rectangulaires posées en écailles, brun rouge nuancé ;
- \`tuile-canal\` : tuiles rondes demi-cylindriques en rangs alternés, ocre à rouge (toits du Sud, faible pente) ;
- \`tuile-mecanique\` : grandes tuiles à emboîtement et sillons réguliers, rouge ou brun uniforme ;
- \`ardoise\` : plaques fines gris bleuté, bord net, rangs bien alignés ;
- \`zinc\` : feuilles métalliques gris clair, joints debout ;
- \`bac-acier\` : tôle nervurée laquée, grandes bandes ;
- \`membrane\` : revêtement d'étanchéité continu d'un toit plat ;
- \`gravillons\` : lit de gravillons sur un toit plat ;
- \`vegetale\` : toiture végétalisée (sedum, herbe).` },
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
