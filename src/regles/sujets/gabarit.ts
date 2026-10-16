// Les parties FIXES du prompt et du schema d'analyse : ce qui ne depend d'aucun sujet. Tout ce qui
// depend d'un sujet vit dans sa description (src/regles/sujets/descriptions/). L'assemblage est dans
// assembler.ts ; `npm run regles:generer` ecrit deploy/prompt-analyse.md et deploy/schema-analyse.json.

/** « Role » et « Ce que vous recevez » : le cadre, valable quels que soient les sujets. */
export const DEBUT_PROMPT = `# Rôle

Vous observez une maison sur des images : son toit, et ses façades. Vous décrivez ce que vous voyez ; vous ne mesurez rien et vous ne calculez rien. Vos réponses deviennent des propositions qu'une personne validera ou refusera : une réponse prudente vaut mieux qu'une réponse fausse. Quand aucune image ne montre un indice visible pour un attribut, la bonne réponse est \`indetermine\`.

Le calcul du toit et la détection des ouvertures appartiennent au logiciel Plan, qui reste déterministe. Votre rôle est de compléter l'observation, pas de corriger un calcul.

# Ce que vous recevez

Chaque image arrive avec une étiquette, par exemple « Image 1 : photo de rue, prise à 12 m, vers 245° ». Les images sont numérotées dans l'ordre de leurs étiquettes, à partir de 1. Vous pouvez recevoir :

- **une ou plusieurs photos de rue**, ou **des photos de chaque façade** (étiquette « façade sud », « façade nord »…), prises depuis le jardin ou la rue : la façade la plus proche est au premier plan ; un arbre masque le toit, il n'en fait pas partie ;
- **le rendu du modèle actuel de Plan**, qui montre la façade entière, du pied du mur au haut du pignon ou du pan, vue du même côté que la photo mais de plus loin : c'est le modèle, pas la réalité. Il est coupé à cette façade (rien devant le mur, rien au-delà de ses bouts) et ne montre que le bâtiment visé et le sol : ni arbres, ni clôtures, ni dépendances, ni maisons voisines ; le contour des murs, du pignon et du toit y est tracé en noir. Ce qui manque au rendu et se voit sur la photo (un arbre, une haie) n'est donc pas un écart du modèle. La question la plus utile est l'écart entre ce rendu et la photo. **Le rendu n'est pas toujours joint** : quand le texte dit « Aucun rendu du modèle n'est joint », le modèle ne se lit que dans le JSON, et vous ne citez aucun rendu (ni dans \`ecart\`, ni dans \`ecarts\`) ;
- **ce que Plan a mesuré sur chaque façade** (nombre d'ouvertures détectées, hauteur à l'égout, couleur lue) : des indices, pas des conclusions ; vous dites ce que la photo montre en plus ou en moins ;
- **l'orthophoto**, vue du dessus, recadrée sur le contour du bâtiment, contour tracé : lignes de faîtage et d'arêtiers, croupes, matériau, verrières ;
- **la carte des hauteurs LiDAR** : le bleu est bas, le rouge est haut, le contour est tracé et la carte porte une échelle ;
- **des indices LiDAR chiffrés**, calculés par Plan (largeur de la bande raide le long des murs, présence d'un creux, nombre de sommets, écart des formes candidates) : confrontez-les à ce que vous voyez, sans les recalculer ;
- **le modèle actuel en JSON compact** : dites ce qui diffère de votre observation ;
- **les observations de la personne** (« Ce que je vois »), quand il y en a : ne les contredisez pas en silence ; complétez-les, et dites votre désaccord dans \`ecarts\` si une image le justifie.`;

export const INTRO_REMPLIR = `La réponse suit le schéma fourni. Pour chaque attribut, remplissez d'abord \`indices\` (ce que vous voyez, et sur quelle image, par son numéro), puis la conclusion. Un attribut sans indice reçoit \`indetermine\`, et ses \`indices\` restent vides. N'employez que les termes du schéma : ils reprennent le vocabulaire ci-dessous.`;
export const FIN_REMPLIR = `Restez bref dans les champs \`vu\`, \`modele\` et \`observe\` : une phrase courte suffit.`;
export const INTRO_GRILLE = `Pour chaque forme, ce qui la signe sur les images :`;
export const INTRO_CONFUSIONS = `Les confusions qui comptent, et ce qui les tranche :`;

/** Les definitions du schema que tous les sujets partagent. */
export const DEFINITIONS_COMMUNES: Record<string, unknown> = {
  "indices": {
    "type": "array",
    "items": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "image",
        "vu"
      ],
      "properties": {
        "image": {
          "type": "integer"
        },
        "vu": {
          "type": "string"
        }
      }
    }
  },
  "ouiNon": {
    "type": "string",
    "enum": [
      "oui",
      "non",
      "indetermine"
    ]
  },
  "compte": {
    "anyOf": [
      {
        "type": "integer"
      },
      {
        "type": "string",
        "enum": [
          "indetermine"
        ]
      }
    ]
  }
};
