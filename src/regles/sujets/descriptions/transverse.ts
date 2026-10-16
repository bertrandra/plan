// Description du sujet « transverse » : ce que Claude doit lire, comment il doit repondre, ce que l'on
// en assemble dans le prompt et le schema d'analyse (src/regles/sujets/assembler.ts).
// Donnees pures : les textes sont ceux du prompt livre (deploy/prompt-analyse.md), decoupes par sujet.

import type { DescriptionSujet } from '../description.js';

export const transverse: DescriptionSujet = {
  id: 'transverse',
  libelle: `Réponse, écarts et prudence`,
  champs: {
    "ecarts": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "indices",
          "sujet",
          "modele",
          "observe"
        ],
        "properties": {
          "indices": {
            "$ref": "#/$defs/indices"
          },
          "sujet": {
            "type": "string",
            "enum": [
              "forme",
              "profil",
              "faitage",
              "bouts",
              "corps",
              "lucarnes",
              "cheminees",
              "terrasse",
              "couverture",
              "facade",
              "autre"
            ]
          },
          "modele": {
            "type": "string"
          },
          "observe": {
            "type": "string"
          }
        }
      }
    },
    "contradictions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "indiceLidar",
          "observation"
        ],
        "properties": {
          "indiceLidar": {
            "type": "string"
          },
          "observation": {
            "type": "string"
          }
        }
      }
    },
    "confiance": {
      "type": "string",
      "enum": [
        "faible",
        "moyenne",
        "forte"
      ]
    }
  },
  definitions: {},
  consignes: [
    { rang: 11, texte: `- \`ecarts\` : chaque différence entre le modèle actuel (rendu ou JSON) et ce que montrent les photos, avec ce que dit le modèle et ce que vous observez ; sujet \`facade\` pour un écart qui ne tient pas dans \`facades[].ecart\`.` },
    { rang: 12, texte: `- \`contradictions\` : chaque indice LiDAR chiffré que votre observation contredit (par exemple : Mansart vu sur la photo, mais aucune bande raide mesurée). Une contradiction n'est pas une erreur : elle envoie le cas en revue humaine.` },
    { rang: 13, texte: `- \`confiance\` : \`forte\` si plusieurs images concordent, \`moyenne\` si une seule image porte la conclusion, \`faible\` si les images sont mauvaises, masquées ou en désaccord.` },
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
    { rang: 99, titre: `Règles de prudence`, texte: `- Ne donnez ni hauteur, ni angle, ni dimension : ils ne font pas partie de la réponse.
- Un élément masqué par un arbre, hors cadre ou dans l'ombre n'est pas vu : \`indetermine\`, ou absent de la liste.
- Le rendu du modèle n'est jamais un indice de la réalité : citez-le seulement dans \`ecarts\`, et seulement s'il figure dans la liste des images. Sans rendu joint, comparez avec le JSON du modèle seulement.
- Si les photos montrent un autre bâtiment que celui du contour, dites-le dans \`ecarts\` (sujet \`autre\`) et laissez les attributs en \`indetermine\`.` },
  ],
};
