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
          "bout",
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
              "forme",
              "vitrage",
              "ouvrant",
              "porte",
              "garage",
              "couleurVolets"
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
              },
              "vitrage": {
                "type": "string",
                "enum": [
                  "plein",
                  "petits-bois",
                  "imposte-petits-bois",
                  "mixte",
                  "indetermine"
                ]
              },
              "ouvrant": {
                "type": "string",
                "enum": [
                  "battants",
                  "coulissant",
                  "guillotine",
                  "soufflet",
                  "fixe",
                  "mixte",
                  "indetermine"
                ]
              },
              "porte": {
                "type": "string",
                "enum": [
                  "pleine",
                  "vitree",
                  "semi-vitree",
                  "sans-objet",
                  "indetermine"
                ]
              },
              "garage": {
                "type": "string",
                "enum": [
                  "sectionnelle",
                  "basculante",
                  "battants",
                  "enroulable",
                  "sans-objet",
                  "indetermine"
                ]
              },
              "couleurVolets": {
                "type": "string",
                "enum": [
                  "blanc",
                  "creme",
                  "gris-clair",
                  "gris-fonce",
                  "bleu",
                  "vert",
                  "rouge",
                  "brun",
                  "bois",
                  "noir",
                  "mixte",
                  "sans-objet",
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
              "triangle",
              "trapeze",
              "rampe",
              "ligne-droite",
              "marches",
              "plusieurs-sommets",
              "indetermine"
            ]
          },
          "bout": {
            "$ref": "#/$defs/bout"
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
  - \`details.vitrage\` : \`plein\` (un seul verre par vantail), \`petits-bois\` (la vitre divisée en petits carreaux), \`imposte-petits-bois\` (un verre plein surmonté d'une bande à petits carreaux) ; \`details.ouvrant\` : \`battants\` (à la française, deux vantaux ou un seul sur gonds), \`coulissant\` (vantaux qui glissent l'un devant l'autre, rail horizontal), \`guillotine\` (deux châssis l'un au-dessus de l'autre, une traverse au milieu), \`soufflet\` (un châssis basculant, en haut d'une baie ou seul), \`fixe\` (sans ouvrant) ; \`details.porte\` : la porte d'entrée — \`pleine\`, \`vitree\` (vitrée sur sa hauteur), \`semi-vitree\` (vitrée en partie haute), \`sans-objet\` sans porte vue ; \`details.garage\` : \`sectionnelle\` (panneaux horizontaux), \`basculante\` (un seul panneau lisse), \`battants\` (deux vantaux verticaux), \`enroulable\` (lames fines, coffre au-dessus), \`sans-objet\` sans garage ; \`details.couleurVolets\` : la couleur des volets ou des tabliers — \`blanc\`, \`creme\`, \`gris-clair\`, \`gris-fonce\`, \`bleu\`, \`vert\`, \`rouge\`, \`brun\`, \`bois\` (bois naturel ou lasuré), \`noir\`, \`sans-objet\` sans volets ;
  - \`materiau\` : le parement du mur — \`pierre\` (pierre de taille ou moellons apparents), \`meuliere\` (pierre alvéolée rousse, joints marqués), \`beton\` (béton brut ou banché), \`brique\` (briques apparentes), \`enduit\` (enduit ou crépi peint), \`bois\` (bardage bois) ;
  - \`silhouette\` : la ligne du haut de la façade au-dessus de l'égout, dans les mots de « Lire les pignons d'abord » — \`triangle\`, \`trapeze\`, \`rampe\` (une seule rampe), \`ligne-droite\`, \`marches\`, \`plusieurs-sommets\` ; \`bout\` : ce que cette façade est pour le toit, avec les mots de \`bouts.gauche\` — \`pignon\`, \`croupe\`, \`demi-croupe\` ou \`brisis\` quand elle ferme un bout du faîtage, \`sans-objet\` quand c'est un long pan (le faîtage lui est parallèle) ou qu'il n'y a pas de faîtage ; \`indetermine\` si le haut du mur est hors cadre ou caché ;
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
- Les détails (volets, coffre, balcon, forme, vitrage, ouvrant, couleur des volets) valent pour la majorité des ouvertures de la façade ; \`mixte\` quand aucune ne domine. Les petits bois se comptent sur la vitre, pas sur les volets ; des persiennes ouvertes ne disent rien du vitrage.
- La silhouette se juge sur la ligne qui sépare le mur du ciel ; un triangle de mur au même parement que le mur est un \`pignon\`, un triangle couvert comme le toit une \`croupe\`. Les arbres et les dépendances devant le mur ne la changent pas ; hors cadre, \`indetermine\`. Les \`bouts\` et la \`forme\` de la maison se déduisent des \`bout\` des façades.` },
  ],
};
