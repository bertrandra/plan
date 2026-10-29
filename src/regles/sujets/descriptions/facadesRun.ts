// Le run d'une facade (MD/spec-facade-calage-audit.md §8) : la requete UNIQUE que le sujet « facades » envoie pour chaque facade,
// sur l'image prise pour la suite (l'assemblage des photos redressees). Elle rend tout d'un coup : le calage (angles, pointes,
// appentis, corps, ce qui cache), la forme du haut, les elements du toit vus sur la ligne du haut, les ouvertures, leurs details et
// leurs carreaux. Plus d'appels separes (calage, puis renfort a trois passes, puis details) : le renfort est parti au lot F3.
//
// Donnees pures, comme les descriptions des sujets de l'analyse d'une maison : `npm run regles:generer` en ecrit
// deploy/prompt-facade.md et deploy/schema-facade.json (generation.ts), jamais a la main. Chaque champ a un lecteur
// (facade/detection/runFacade.ts) : un champ qu'aucun lecteur n'utilise n'entre pas au schema (§8 bis.2).

import type { SchemaJson } from '../description.js';

/** Le corps du prompt (sans en-tete) : ce que Claude lit, en system, avant le schema. */
const PROMPT = `# Rôle

Vous aidez le logiciel Plan à lire **une façade** sur une image. Plan connaît déjà, par le plan cadastral et le LiDAR, la largeur du mur, sa hauteur à l'égout et la forme de son toit : vous ne mesurez rien. Vous dites **où** sont les choses sur l'image, en proportions, et **ce qu'elles sont**. Plan vérifie chaque position sur les arêtes de l'image, et une personne valide ensuite. Une réponse prudente vaut mieux qu'une réponse fausse : ce que vous ne voyez pas reste \`indetermine\`, ou hors de la liste.

# Ce que vous recevez

- **Image 1 : la façade, vue de face.** C'est l'assemblage des photos redressées du mur (ce qu'aucune photo ne montre est gris), ou une seule photo. Le mur ne remplit pas toujours l'image : du ciel, le sol, un voisin, des arbres l'entourent souvent.
- **Un texte** : l'étiquette de la façade, ce que le plan attend de son haut (une ligne droite, un pignon, deux…) et, quand Plan le connaît, le parement du mur (relevé sur place ou porté par le plan). Ce sont des attentes, pas des vérités : dites ce que l'image montre.

# Deux repères

- **Le repère de l'image** (\`x\`, \`y\`) : \`x\` va de 0 (le bord gauche de l'image) à 1 (le bord droit), \`y\` de 0 (le bord haut) à 1 (le bord bas). Il ne sert qu'aux angles du mur.
- **Le repère du mur** (\`u\`, \`v\`) : \`u\` va de 0 (l'angle gauche du mur) à 1 (l'angle droit), le long du mur ; \`v\` va de 0 (le sol, au pied du mur) à 1 (l'égout, là où le toit commence sur les longs pans). Au-dessus de l'égout, \`v\` dépasse 1 : une pointe de pignon deux fois plus haute que l'égout a \`v\` = 2. Tout le reste de la réponse est dans ce repère.

Donnez les nombres au centième (0.37), sans chercher le pixel : Plan affine.

# Comment remplir la réponse

- \`calage.angles\` : les deux angles du mur, \`gauche\` et \`droite\`, dans le repère de l'image : \`x\` (sa place dans la largeur de l'image), \`egout\` (le \`y\` de l'égout à cet angle), \`sol\` (le \`y\` du pied du mur à cet angle) et \`confiance\`. Un angle caché (un arbre, une haie, un voisin) se situe là où il serait en prolongeant les arêtes visibles, avec la \`confiance\` \`faible\` ; hors de l'image ou introuvable, \`indetermine\`.
- \`calage.pointes\` : la pointe de chaque pignon visible au-dessus de l'égout, de gauche à droite : \`u\`, \`v\` (sa hauteur en hauteurs d'égout, à 10 % près) et \`confiance\`. Sans pignon, la liste reste vide.
- \`calage.appentis\` : chaque partie de la façade couverte par un toit à un seul pan plus bas que le reste (un appentis, un porche), de \`debut\` à \`fin\` en \`u\`.
- \`calage.corps\` : les parties de la façade qui vous paraissent d'un autre volume que le reste (une aile en retrait, un corps plus haut), de \`debut\` à \`fin\` en \`u\` ; la liste reste vide quand toute la façade est d'un même volume.
- \`calage.cache\` : ce qui masque le mur, \`quoi\` (\`arbre\`, \`haie\`, \`voiture\`, \`autre\`), de \`debut\` à \`fin\` en \`u\`.
- \`forme.silhouette\` : la ligne du haut de la façade au-dessus de l'égout — \`triangle\` (un pignon), \`trapeze\` (une croupe vue de face), \`rampe\` (une seule pente), \`ligne-droite\` (l'égout seul), \`marches\` (des hauteurs différentes, sans pointe), \`plusieurs-sommets\` (plusieurs pignons) ; \`forme.bout\` : ce que cette façade ferme du toit — \`pignon\`, \`croupe\`, \`demi-croupe\`, \`brisis\`, ou \`sans-objet\` pour un long pan (le faîtage lui est parallèle).
- \`elements\` : chaque élément du toit vu sur la ligne du haut, \`element\` (\`cheminee\` ou \`lucarne\`), à sa place \`u\`, avec sa \`confiance\`.
- \`ouvertures\` : chaque fenêtre, porte-fenêtre, porte ou porte de garage du mur, de gauche à droite et de bas en haut :
  - \`type\` : \`fenetre\`, \`porte-fenetre\` (vitrée jusqu'au sol), \`porte\` (la porte d'entrée, pleine ou vitrée en partie), \`garage\` ;
  - sa boîte, dans le repère du mur : \`u0\` et \`u1\` (les bords gauche et droit du tableau), \`v0\` (l'appui, ou le seuil) et \`v1\` (le linteau) ; le dormant compris, les volets battants ouverts et le coffre d'un volet roulant non compris ;
  - \`niveau\` (0 au rez-de-chaussée, 1 au premier étage…) et \`travee\` (0 pour la colonne de baies la plus à gauche…) quand vous les voyez, sinon \`indetermine\` ;
  - \`confiance\` ;
  - \`details.volets\` : \`battants\`, \`roulant\` (un tablier sous un coffre), \`persiennes\`, \`aucun\` ; \`details.allege\` : \`balcon\`, \`garde-corps\` (une barre devant la baie), \`pleine\` (le mur sous l'appui) ; \`details.forme\` : \`rect\`, \`cintre\` (le haut en arc), \`rond\` (un œil-de-bœuf) ;
  - \`carreaux\` : la division du vitrage — \`vantaux\` (le nombre de vantaux visibles, de 1 à 3), \`colonnes\` et \`rangees\` (les carreaux d'un vantail : 3 et 2 pour six carreaux, 1 et 1 pour un verre d'un seul tenant), \`petitsBois\` (\`aucun\`, \`fins\`, \`epais\`), \`imposte\` (la partie haute vitrée à part : \`hauteur\`, sa part de la hauteur de la baie, et ses \`colonnes\` et \`rangees\` ; \`aucune\` sans imposte), \`vitrage\` (\`clair\`, \`depoli\`, \`teinte\`, \`vitrail\`). Pour une porte pleine ou une porte de garage, \`vantaux\` seul ; le reste \`indetermine\`.
- \`surface\` : le parement du mur. \`surface.principale\` : celui de la plus grande part du mur — \`enduit\`, \`pierre\`, \`brique\`, \`colombage\` (un pan de bois : poteaux, traverses et écharpes de bois apparents, un remplissage entre eux), \`bardage-bois\`, \`bardage-metal\` (métal ou composite), \`beton\`, ou \`mixte\` quand plusieurs parements se partagent le mur sans qu'aucun ne domine. \`surface.zones\` : chaque partie du mur d'un autre parement que le principal (ou chaque parement d'un mur \`mixte\`) — son \`type\` (les mêmes mots, sauf \`mixte\`), sa boîte \`u0\`, \`u1\`, \`v0\`, \`v1\` dans le repère du mur, et sa \`confiance\` ; un étage en colombage sur un rez-de-chaussée enduit est une zone \`colombage\` au-dessus de l'appui de l'étage, un pignon en colombage une zone au-dessus de l'égout. \`surface.confiance\` dit votre confiance dans le parement principal.
- \`confiance\` : \`forte\` si l'image est nette et le mur entier visible, \`moyenne\` si une partie est cachée ou floue, \`faible\` si l'image est mauvaise ou si vous doutez que ce soit le mur.

# Règles de prudence

- Une baie derrière un volet fermé compte : c'est la baie qu'il faut encadrer. Une ouverture entièrement cachée (un arbre, une voiture) ne s'invente pas : dites ce qui la cache dans \`calage.cache\`.
- Une ombre portée, une tache d'enduit, un reflet ou un volet ouvert contre le mur ne sont pas des ouvertures.
- Les bois d'un colombage dessinent des rectangles nets dans le mur : ce ne sont ni les angles du mur, ni son égout, ni des ouvertures. Les angles du mur sont là où le parement s'arrête, pas sur une ligne de bois au milieu de lui.
- Un triangle de colombages ou une tache en triangle dans le mur n'est pas un pignon : la pointe d'un pignon est sur la ligne du haut, contre le ciel ou le toit.
- Un pignon que vous voyez plus haut ou plus bas que le plan ne l'attend : donnez ce que vous voyez. Plan garde la hauteur du LiDAR et signale l'écart.
- Les carreaux se comptent sur la vitre, pas sur les volets ; des persiennes fermées ne disent rien du vitrage (\`indetermine\`).
`;

const nombre = { type: 'number' } as const;
/** Les parements d'un mur que Claude distingue (decision du proprietaire, 29 octobre 2026 : le colombage d'AE 101 trompait le calage). */
const PAREMENTS = ['enduit', 'pierre', 'brique', 'colombage', 'bardage-bois', 'bardage-metal', 'beton'] as const;
const objet = (proprietes: Record<string, unknown>): SchemaJson => ({ type: 'object', additionalProperties: false, required: Object.keys(proprietes), properties: proprietes });
const terme = (...termes: string[]): SchemaJson => ({ type: 'string', enum: termes });
const liste = (items: unknown): SchemaJson => ({ type: 'array', items });
const ref = (nom: string) => ({ $ref: '#/$defs/' + nom });

/** Le schema de la reponse : chaque champ a son lecteur (facade/detection/runFacade.ts). */
const SCHEMA: SchemaJson = {
  ...objet({
    calage: objet({
      angles: objet({ gauche: ref('angle'), droite: ref('angle') }),
      pointes: liste(objet({ u: nombre, v: nombre, confiance: ref('confiance') })),
      appentis: liste(ref('etendue')),
      corps: liste(ref('etendue')),
      cache: liste(objet({ quoi: terme('arbre', 'haie', 'voiture', 'autre'), debut: nombre, fin: nombre })),
    }),
    forme: objet({
      silhouette: terme('triangle', 'trapeze', 'rampe', 'ligne-droite', 'marches', 'plusieurs-sommets', 'indetermine'),
      bout: terme('pignon', 'croupe', 'demi-croupe', 'brisis', 'sans-objet', 'indetermine'),
    }),
    elements: liste(objet({ element: terme('cheminee', 'lucarne'), u: nombre, confiance: ref('confiance') })),
    surface: objet({
      principale: terme(...PAREMENTS, 'mixte', 'indetermine'),
      zones: liste(objet({ type: terme(...PAREMENTS), u0: nombre, u1: nombre, v0: nombre, v1: nombre, confiance: ref('confiance') })),
      confiance: ref('confiance'),
    }),
    ouvertures: liste(objet({
      type: terme('fenetre', 'porte-fenetre', 'porte', 'garage'),
      u0: nombre, u1: nombre, v0: nombre, v1: nombre,
      niveau: ref('compte'), travee: ref('compte'), confiance: ref('confiance'),
      details: objet({
        volets: terme('battants', 'roulant', 'persiennes', 'aucun', 'indetermine'),
        allege: terme('balcon', 'garde-corps', 'pleine', 'indetermine'),
        forme: terme('rect', 'cintre', 'rond', 'indetermine'),
      }),
      carreaux: objet({
        vantaux: ref('compte'), colonnes: ref('compte'), rangees: ref('compte'),
        petitsBois: terme('aucun', 'fins', 'epais', 'indetermine'),
        imposte: { anyOf: [objet({ hauteur: nombre, colonnes: ref('compte'), rangees: ref('compte') }), terme('aucune', 'indetermine')] },
        vitrage: terme('clair', 'depoli', 'teinte', 'vitrail', 'indetermine'),
      }),
    })),
    // A la racine, un terme manquant prend le premier du vocabulaire (deploy/analyse-fonctions.php::conformer) : `faible`, le plus prudent.
    confiance: terme('faible', 'moyenne', 'forte'),
  }),
  $defs: {
    angle: { anyOf: [objet({ x: nombre, egout: nombre, sol: nombre, confiance: ref('confiance') }), terme('indetermine')] },
    etendue: objet({ debut: nombre, fin: nombre }),
    confiance: terme('forte', 'moyenne', 'faible', 'indetermine'),
    compte: { anyOf: [{ type: 'integer' }, terme('indetermine')] },
  },
};

/** Le run d'une facade : son prompt et son schema, tels que le serveur les sert (usage `facade`). */
export const RUN_FACADE: { prompt: string; schema: SchemaJson } = { prompt: PROMPT, schema: SCHEMA };
