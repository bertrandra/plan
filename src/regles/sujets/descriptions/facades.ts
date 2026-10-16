// Description du sujet « facades » : ce que Claude doit lire, comment il doit repondre, ce que l'on
// en assemble dans le prompt et le schema d'analyse (src/regles/sujets/assembler.ts).
// Donnees pures : les textes sont ceux du prompt livre (deploy/prompt-analyse.md), decoupes par sujet.

import type { DescriptionSujet } from '../description.js';

export const facades: DescriptionSujet = {
  id: 'facades',
  libelle: `Façades`,
  champs: {
    "facades": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "indices",
          "facade",
          "ouvertures",
          "details",
          "materiau",
          "silhouette",
          "ecart"
        ],
        "properties": {
          "indices": {
            "$ref": "#/$defs/indices"
          },
          "facade": {
            "type": "string"
          },
          "ouvertures": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "niveaux",
              "parNiveau",
              "manquees",
              "enTrop"
            ],
            "properties": {
              "niveaux": {
                "$ref": "#/$defs/compte"
              },
              "parNiveau": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/compte"
                }
              },
              "manquees": {
                "$ref": "#/$defs/compte"
              },
              "enTrop": {
                "$ref": "#/$defs/compte"
              }
            }
          },
          "details": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "volets",
              "coffre",
              "balcon",
              "forme"
            ],
            "properties": {
              "volets": {
                "type": "string",
                "enum": [
                  "battants",
                  "roulants",
                  "persiennes",
                  "aucun",
                  "mixte",
                  "indetermine"
                ]
              },
              "coffre": {
                "$ref": "#/$defs/ouiNon"
              },
              "balcon": {
                "$ref": "#/$defs/ouiNon"
              },
              "forme": {
                "type": "string",
                "enum": [
                  "rectangulaire",
                  "cintree",
                  "oeil-de-boeuf",
                  "mixte",
                  "indetermine"
                ]
              }
            }
          },
          "materiau": {
            "type": "string",
            "enum": [
              "pierre",
              "meuliere",
              "beton",
              "brique",
              "enduit",
              "bois",
              "indetermine"
            ]
          },
          "silhouette": {
            "type": "string",
            "enum": [
              "pignon",
              "croupe",
              "trapeze",
              "rectangle",
              "rampe",
              "indetermine"
            ]
          },
          "ecart": {
            "type": "string"
          }
        }
      }
    }
  },
  definitions: {},
  consignes: [
    { rang: 10, texte: `- \`facades\` : une entrée par façade dont vous avez reçu une photo, désignée par son étiquette, recopiée telle quelle de la ligne « Façades à décrire » (\`facade\` : « sud », « nord », « est (côté 3) »…). Quand un bâtiment a plusieurs murs de même orientation, l'étiquette porte le numéro du côté du polygone : une entrée par étiquette, jamais deux murs dans la même entrée. Pour chacune :
  - \`ouvertures.niveaux\` : le nombre de niveaux d'ouvertures visibles (rez-de-chaussée, étage…), \`parNiveau\` le nombre d'ouvertures de chaque niveau du bas vers le haut, \`manquees\` celles que la détection de Plan n'a pas vues et \`enTrop\` celles qu'elle a comptées sans qu'elles existent (d'après le nombre détecté qui vous est donné) ;
  - \`details.volets\` : \`battants\` (deux vantaux de part et d'autre), \`roulants\` (un tablier qui descend d'un coffre), \`persiennes\` (volets ajourés repliables), \`aucun\`, \`mixte\` ; \`details.coffre\` : un coffre de volet roulant visible au-dessus des ouvertures ; \`details.balcon\` : au moins un balcon ; \`details.forme\` : \`rectangulaire\`, \`cintree\` (linteau en arc), \`oeil-de-boeuf\`, \`mixte\` ;
  - \`materiau\` : le parement du mur — \`pierre\` (pierre de taille ou moellons apparents), \`meuliere\` (pierre alvéolée rousse, joints marqués), \`beton\` (béton brut ou banché), \`brique\` (briques apparentes), \`enduit\` (enduit ou crépi peint), \`bois\` (bardage bois) ;
  - \`silhouette\` : la ligne du haut de la façade, au-dessus de l'égout, sur la photo — \`pignon\` (un triangle de MUR : le mur monte en pointe sous le toit, avec le parement du mur), \`croupe\` (un pan de TOIT incliné au-dessus de l'égout, couvert de tuiles ou d'ardoises, vu de face), \`trapeze\` (un bandeau de toit dont le haut est plus court que l'égout, vu de côté : long pan d'un toit à croupes), \`rectangle\` (un bandeau de hauteur constante, ou aucun toit visible au-dessus de l'égout), \`rampe\` (le haut monte d'un seul côté : mur d'appentis) ; \`indetermine\` si le haut du mur est hors cadre ou caché ;
  - \`ecart\` : en une phrase, ce qui diffère entre la photo et le rendu du modèle pour cette façade (ouvertures, hauteur, couleur), ou une chaîne vide.` },
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
    { rang: 1, titre: `Façades`, texte: `- Comptez les ouvertures d'un niveau de gauche à droite sur la photo ; une porte compte comme une ouverture.
- Une ouverture masquée par un arbre, une voiture ou une haie n'est ni manquée ni en trop : elle n'est pas vue.
- Le matériau se juge sur la partie haute du mur, hors soubassement ; un enduit peint sur de la pierre est \`enduit\`.
- Les détails (volets, coffre, balcon, forme) valent pour la majorité des ouvertures de la façade ; \`mixte\` quand aucune ne domine.
- La silhouette se juge sur la ligne qui sépare le mur du ciel : un triangle aux mêmes tuiles que le toit est une \`croupe\`, un triangle au même parement que le mur est un \`pignon\`. Les arbres et les dépendances devant le mur ne la changent pas ; hors cadre, \`indetermine\`.` },
  ],
};
