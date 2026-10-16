// Description du sujet « formeToit » : ce que Claude doit lire, comment il doit repondre, ce que l'on
// en assemble dans le prompt et le schema d'analyse (src/regles/sujets/assembler.ts).
// Donnees pures : les textes sont ceux du prompt livre (deploy/prompt-analyse.md), decoupes par sujet.

import type { DescriptionSujet } from '../description.js';

export const formeToit: DescriptionSujet = {
  id: 'formeToit',
  libelle: `Forme du toit`,
  champs: {
    "forme": {
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
            "plat",
            "appentis",
            "deux-pans",
            "croupes",
            "pavillon",
            "demi-croupe",
            "mansart",
            "asymetrique",
            "deux-pans-decales",
            "toit-en-m",
            "papillon",
            "gambrel",
            "coyau",
            "shed",
            "berceau",
            "carene",
            "conique",
            "polygonal",
            "fleche",
            "dome",
            "imperiale",
            "indetermine"
          ]
        }
      }
    },
    "profil": {
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
            "droit",
            "brise",
            "courbe",
            "indetermine"
          ]
        }
      }
    },
    "faitage": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "indices",
        "sens"
      ],
      "properties": {
        "indices": {
          "$ref": "#/$defs/indices"
        },
        "sens": {
          "type": "string",
          "enum": [
            "perpendiculaire-rue",
            "parallele-rue",
            "sans-faitage",
            "indetermine"
          ]
        }
      }
    },
    "bouts": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "indices",
        "gauche",
        "droite"
      ],
      "properties": {
        "indices": {
          "$ref": "#/$defs/indices"
        },
        "gauche": {
          "$ref": "#/$defs/bout"
        },
        "droite": {
          "$ref": "#/$defs/bout"
        }
      }
    }
  },
  definitions: {
    "bout": {
      "type": "string",
      "enum": [
        "pignon",
        "croupe",
        "demi-croupe",
        "brisis",
        "sans-objet",
        "indetermine"
      ]
    }
  },
  consignes: [
    { rang: 1, texte: `- \`forme\` : la forme du catalogue qui décrit le corps principal.` },
    { rang: 2, texte: `- \`profil\` : la coupe en travers d'un pan — \`droit\` (une seule pente), \`brise\` (brisis et terrasson, Mansart ou gambrel), \`courbe\` (berceau, carène, dôme).` },
    { rang: 3, texte: `- \`faitage.sens\` : le sens du faîtage par rapport à la rue vue sur la photo ; \`sans-faitage\` pour un toit plat, un pavillon ou une forme à sommet unique.` },
    { rang: 4, texte: `- \`bouts.gauche\`, \`bouts.droite\` : ce qui ferme chaque bout du faîtage, vu depuis la rue (gauche et droite de la photo) ; \`sans-objet\` quand il n'y a pas de faîtage.` },
  ],
  vocabulaire: [
    { section: `Surfaces`, rang: 1, texte: `- **Versant** (ou pan) : surface inclinée plane qui reçoit et conduit l'eau.
- **Croupe** : pan triangulaire ou trapézoïdal qui ferme le bout d'un toit, à la place d'un pignon.
- **Demi-croupe** (croupette) : croupe qui ne descend pas jusqu'à l'égout ; un petit pignon dessous, la croupe au-dessus.
- **Brisis** : partie basse, très raide (60° à 80°), d'un toit brisé ; porte souvent les lucarnes.
- **Terrasson** : partie haute, peu pentue (15° à 30°), d'un toit brisé.
- **Toiture-terrasse** : toit plat (moins de 3° à 5°), souvent bordé d'un acrotère.
- **Renvers** : pan à contre-pente qui renvoie l'eau vers une noue ou un chéneau.` },
    { section: `Lignes`, rang: 2, texte: `- **Faîtage** : ligne horizontale la plus haute, où se rejoignent deux versants opposés.
- **Égout** : bord bas d'un versant, où l'eau quitte le toit vers la gouttière.
- **Arêtier** : angle saillant entre deux pans (entre un long pan et une croupe).
- **Noue** : angle rentrant entre deux pans (jonction d'un bâtiment en L, d'une aile).
- **Ligne de bris** : ligne horizontale entre le brisis et le terrasson.
- **Rive** : bord latéral incliné d'un versant, le long d'un mur pignon.
- **Pignon** : mur triangulaire qui porte les versants au bout d'un toit à deux pans ; au sens étendu, un avant-corps à deux pans perpendiculaire au faîtage.` },
    { section: `Sens du faîtage`, rang: 3, texte: `- \`parallele-rue\` : le faîtage longe la façade vue de la rue ; on voit le long pan, et le toit monte vers le fond ;
- \`perpendiculaire-rue\` : le faîtage va vers la rue ; on voit un pignon (ou une croupe) face à soi, et le toit descend de part et d'autre ;
- \`sans-faitage\` : il n'y a pas de ligne de faîte (toit plat, pavillon, forme à sommet unique).` },
    { section: `Formes`, rang: 30, texte: `- \`plat\` : toit-terrasse, pente de moins de 5 %.
- \`appentis\` : monopente, un seul pan, adossé à un mur ou libre.
- \`deux-pans\` : deux pans et deux murs pignons aux bouts.
- \`croupes\` : quatre pans, deux grands pans et deux croupes aux bouts.
- \`pavillon\` : quatre pans triangulaires réunis en un point, plan presque carré.
- \`demi-croupe\` : deux pans dont le haut des bouts est fermé par une courte croupe, un petit pignon dessous.
- \`mansart\` : chaque face a deux pentes, terrasson en haut, brisis en bas, brisis aussi aux bouts.
- \`asymetrique\` : deux pans, l'un nettement plus long et qui descend plus bas.
- \`deux-pans-decales\` : deux pans aux faîtages à des hauteurs différentes, séparés par une bande verticale.
- \`toit-en-m\` : deux toits à deux pans parallèles et accolés, réunis par une noue centrale.
- \`papillon\` : deux pans inclinés vers l'intérieur, noue centrale.
- \`gambrel\` : double pente du Mansart sur les deux longs côtés seulement, avec des murs pignons.
- \`coyau\` : toit dont le bas de chaque pan s'évase et s'adoucit vers l'extérieur.
- \`shed\` : appentis répétés en dents de scie.
- \`berceau\` : toit en demi-cylindre ou en arc surbaissé.
- \`carene\` : silhouette convexe en coque de bateau renversée.
- \`conique\` : cône sur une tourelle ronde ou polygonale.
- \`polygonal\` : pavillon sur un plan hexagonal ou octogonal.
- \`fleche\` : pyramide ou cône très élancé.
- \`dome\` : hémisphère ou calotte sur une base ronde ou polygonale.
- \`imperiale\` : galbe en S, d'abord bombé puis effilé.` },
  ],
  lectures: [
    { rang: 1, titre: `Lire les pignons d'abord`, texte: `Le haut d'une façade est ce qui dit le mieux la forme du toit. Avant de choisir \`forme\`, \`profil\` et \`bouts\`, regardez, pour chaque façade photographiée, la **silhouette de son haut** sur la photo, puis sur le rendu (le contour noir la montre) :

- **triangle** (deux rampes qui montent jusqu'à un sommet, mur plein dessous) : un mur pignon ; le faîtage est perpendiculaire à cette façade. Un bout en \`pignon\`, et un \`deux-pans\` (ou un \`croupes\` si l'autre bout se ferme en croupe) ;
- **trapèze** (rampes qui s'arrêtent sur une ligne plate au sommet, ou toit qui ne se voit qu'en pente) : une croupe ou une demi-croupe, pas un pignon ; sous une demi-croupe, un petit triangle de mur ;
- **une seule rampe** : un appentis, ou le long pan d'un \`deux-pans\` vu de côté (le faîtage est alors parallèle à la façade) ;
- **ligne droite, avec ou sans acrotère** : un toit plat, ou le long pan vu de face sous l'égout ;
- **marches** : un pignon à redents ;
- **plusieurs sommets** côte à côte : plusieurs corps, ou un toit en M ;
- **triangle plus bas que le faîtage voisin** : une lucarne ou un petit corps (confusion 1 ci-dessous), pas le pignon du corps principal.

Ensuite, comparez cette silhouette à celle du rendu, façade par façade : le nombre de sommets, le côté et la hauteur où la rampe s'arrête, la présence d'un triangle de mur, le débord de l'égout. Chaque différence vue sur les images va dans \`ecarts\` : \`sujet\` \`bouts\` quand un pignon est pris pour une croupe ou l'inverse, \`forme\` ou \`corps\` quand la silhouette d'ensemble ne correspond pas, et dites ce que dit le rendu (\`modele\`) et ce que montre la photo (\`observe\`). Ces écarts sont souvent les plus faciles à voir : ne les passez pas sous silence parce que le reste concorde. Votre \`forme\` et vos \`bouts\` se déduisent des pignons lus ; si les silhouettes des façades se contredisent, ou si une seule est vue et ne tranche pas, répondez \`indetermine\` plutôt que de deviner.` },
  ],
  grille: [
    { rang: 1, texte: `- **plat** : pas de pente visible depuis la rue ; sur la carte LiDAR, une hauteur uniforme, souvent un liseré plus haut sur le pourtour (l'acrotère).
- **appentis** : une rampe d'un mur à l'autre ; le haut s'appuie sur un mur.
- **deux-pans** : une arête ; la hauteur reste constante le long du faîtage jusqu'aux murs de bout, qui sont des pignons.
- **croupes** : une arête raccourcie ; la hauteur baisse vers les deux bouts.
- **pavillon** : un sommet et quatre arêtiers.
- **demi-croupe** : aux bouts, le toit ne descend que sur le haut, puis un petit pignon vertical dessous.
- **mansart** : sur la photo, des fenêtres verticales dans une pente très raide le long de tous les murs ; sur la carte, une bande étroite et raide le long de tous les murs, un dessus doux ou presque plat.
- **gambrel** : la même bande raide, sur les deux longs côtés seulement ; les murs de bout montent sur toute la hauteur.
- **toit-en-m** : deux arêtes parallèles et un creux au milieu ; **papillon** : un creux au milieu sans arêtes, plus haut sur les deux murs.
- **berceau**, **carene**, **dome** : un dessus bombé, sans arête vive.` },
  ],
  confusions: [
    { rang: 2, texte: `**Mansart ou toit plat sur murs hauts.** Des fenêtres verticales dans une pente raide, une bande raide de moins de 1,5 m le long des murs, des bosses régulières dans cette bande : c'est un Mansart.` },
    { rang: 3, texte: `**Demi-croupe ou croupe.** Cherchez le petit pignon vertical sous la croupe ; s'il n'est pas visible sur une photo, répondez \`indetermine\` plutôt que de choisir.` },
    { rang: 5, texte: `**Pavillon ou croupes.** Un toit à quatre pans dont le faîtage fait moins de 1 m sur un plan presque carré est un pavillon.` },
    { rang: 6, texte: `**Toit en M, papillon ou deux corps.** Le toit en M a deux arêtes ; le papillon n'en a pas ; deux corps séparés ont une marche ou un mur mitoyen entre eux.` },
    { rang: 7, texte: `**Gambrel ou Mansart.** Ce sont les bouts qui tranchent : brisis aux bouts pour le Mansart, murs pignons pour le gambrel.` },
  ],
  rappels: [
  ],
};
