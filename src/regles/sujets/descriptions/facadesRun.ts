// Le run d'une facade (MD/spec-facade-calage-audit.md §8) : la requete UNIQUE que le sujet « facades » envoie pour chaque facade,
// sur l'image prise pour la suite (l'assemblage des photos redressees). Elle rend tout d'un coup : le calage (angles, pointes,
// appentis, corps, ce qui cache), la forme du haut, les elements du toit vus sur la ligne du haut, les ouvertures, leurs details et
// leurs carreaux. Plus d'appels separes (calage, puis renfort a trois passes, puis details) : le renfort est parti au lot F3.
//
// Donnees pures, comme les descriptions des sujets de l'analyse d'une maison : `npm run regles:generer` en ecrit
// deploy/prompt-facade.md et deploy/schema-facade.json (generation.ts), jamais a la main. Chaque champ a un lecteur
// (facade/detection/runFacade.ts) : un champ qu'aucun lecteur n'utilise n'entre pas au schema (§8 bis.2).

import type { SchemaJson } from '../description.js';
import { MOTS_PALETTE } from '../../facades/palette.js';

/** Le corps du prompt (sans en-tete) : ce que Claude lit, en system, avant le schema. */
const PROMPT = `# Rôle

Vous aidez le logiciel Plan à lire **une façade** sur une image. Plan connaît déjà, par le plan cadastral et le LiDAR, la largeur du mur, sa hauteur à l'égout et la forme de son toit : vous ne mesurez rien. Vous dites **où** sont les choses sur l'image, en proportions, et **ce qu'elles sont**. Plan vérifie chaque position sur les arêtes de l'image, et une personne valide ensuite. Une réponse prudente vaut mieux qu'une réponse fausse : ce que vous ne voyez pas reste \`indetermine\` (un mot) ou \`-1\` (un nombre), ou hors de la liste.

# Ce que vous recevez

- **Image 1 : la façade, vue de face.** C'est l'assemblage des photos redressées du mur (ce qu'aucune photo ne montre est gris), ou une seule photo. Le mur ne remplit pas toujours l'image : du ciel, le sol, un voisin, des arbres l'entourent souvent.
- **Un texte** : l'étiquette de la façade, ce que le plan attend de son haut (une ligne droite, un pignon, deux…) et, quand Plan le connaît, le parement du mur (relevé sur place ou porté par le plan). Ce sont des attentes, pas des vérités : dites ce que l'image montre.

# Deux repères

- **Le repère de l'image** (\`x\`, \`y\`) : \`x\` va de 0 (le bord gauche de l'image) à 1 (le bord droit), \`y\` de 0 (le bord haut) à 1 (le bord bas). Il ne sert qu'aux angles du mur.
- **Le repère du mur** (\`u\`, \`v\`) : \`u\` va de 0 (l'angle gauche du mur) à 1 (l'angle droit), le long du mur ; \`v\` va de 0 (le sol, au pied du mur) à 1 (l'égout, là où le toit commence sur les longs pans). Au-dessus de l'égout, \`v\` dépasse 1 : une pointe de pignon deux fois plus haute que l'égout a \`v\` = 2. Tout le reste de la réponse est dans ce repère.

Donnez les nombres au centième (0.37), sans chercher le pixel : Plan affine. **Tous les nombres de la réponse sont des parts**, jamais des pixels ni des mètres : \`x\`, \`egout\`, \`sol\` et \`u\` vont de 0 à 1 ; \`v\` part de 0 au sol, vaut 1 à l'égout, et ne dépasse 1 qu'au-dessus de lui. Les seuls entiers sont des comptes (\`niveau\`, \`travee\`, \`vantaux\`, \`colonnes\`, \`rangees\`, \`rangsGenoise\`, \`marches\`). Un nombre que vous ne voyez pas vaut \`-1\` : jamais un nombre deviné.

# Comment remplir la réponse

- \`calage.angles\` : les deux angles du mur, \`gauche\` et \`droite\`, dans le repère de l'image : \`x\` (sa place dans la largeur de l'image), \`egout\` (le \`y\` de l'égout à cet angle), \`sol\` (le \`y\` du pied du mur à cet angle) et \`confiance\`. Un angle caché (un arbre, une haie, un voisin) se situe là où il serait en prolongeant les arêtes visibles, avec la \`confiance\` \`faible\` ; hors de l'image ou introuvable, \`x\`, \`egout\` et \`sol\` à \`-1\` et la \`confiance\` \`indetermine\`.
- \`calage.pointes\` : la pointe de chaque pignon visible au-dessus de l'égout, de gauche à droite : \`u\`, \`v\` (sa hauteur en hauteurs d'égout, à 10 % près) et \`confiance\`. Sans pignon, la liste reste vide.
- \`calage.appentis\` : chaque partie de la façade couverte par un toit à un seul pan plus bas que le reste (un appentis, un porche), de \`debut\` à \`fin\` en \`u\`.
- \`calage.corps\` : les parties de la façade qui vous paraissent d'un autre volume que le reste (une aile en retrait, un corps plus haut), de \`debut\` à \`fin\` en \`u\` ; la liste reste vide quand toute la façade est d'un même volume.
- \`calage.cache\` : ce qui masque le mur, \`quoi\` (\`arbre\`, \`haie\`, \`voiture\`, \`autre\`), de \`debut\` à \`fin\` en \`u\`.
- \`forme.silhouette\` : la ligne du haut de la façade au-dessus de l'égout — \`triangle\` (un pignon), \`trapeze\` (une croupe vue de face), \`rampe\` (une seule pente), \`ligne-droite\` (l'égout seul), \`marches\` (des hauteurs différentes, sans pointe), \`plusieurs-sommets\` (plusieurs pignons) ; \`forme.bout\` : ce que cette façade ferme du toit — \`pignon\`, \`croupe\`, \`demi-croupe\`, \`brisis\`, ou \`sans-objet\` pour un long pan (le faîtage lui est parallèle).
- \`elements\` : chaque élément du toit vu sur la ligne du haut, \`element\` (\`cheminee\` ou \`lucarne\`), à sa place \`u\`, avec sa \`confiance\`.
- \`ouvertures\` : chaque fenêtre, porte-fenêtre, porte ou porte de garage du mur, de gauche à droite et de bas en haut :
  - \`type\` : \`fenetre\`, \`porte-fenetre\` (vitrée jusqu'au sol), \`porte\` (la porte d'entrée, pleine ou vitrée en partie), \`garage\` ;
  - sa boîte, dans le repère du mur : \`u0\` et \`u1\` (les bords gauche et droit du tableau), \`v0\` (l'appui, ou le seuil) et \`v1\` (le linteau) ; le dormant compris, les volets battants ouverts et le coffre d'un volet roulant non compris ;
  - \`niveau\` (0 au rez-de-chaussée, 1 au premier étage…) et \`travee\` (0 pour la colonne de baies la plus à gauche…) quand vous les voyez, sinon \`-1\` ;
  - \`confiance\` ;
  - \`details.volets\` : \`battants\`, \`roulant\` (un tablier sous un coffre), \`persiennes\`, \`aucun\` ; \`details.allege\` : \`balcon\`, \`garde-corps\` (une barre devant la baie), \`pleine\` (le mur sous l'appui) ; \`details.forme\` : \`rect\`, \`cintre\` (le haut en arc), \`rond\` (un œil-de-bœuf) ;
  - \`details.menuiserie\` : la matière du cadre et des ouvrants de la baie (\`bois\`, \`pvc\`, \`alu\`, \`acier\`), et \`details.couleurMenuiserie\` leur couleur (un mot de la palette) ; \`details.couleurVolets\` : la couleur des volets ou du tablier (un mot de la palette, \`sans-objet\` sans volets) ;
  - \`details.gardeCorps\` : le garde-corps devant la baie ou au bord de son balcon (\`barreaux\` droits, \`fer-forge\` à volutes, \`verre\`, \`plein\` maçonné ou en tôle ; \`sans-objet\` sans garde-corps), \`details.hautGardeCorps\` le dessus de sa main courante (en \`v\`) et \`details.couleurGardeCorps\` sa couleur (un mot de la palette) ;
  - \`carreaux\` : la division du vitrage — \`vantaux\` (le nombre de vantaux visibles, de 1 à 3), \`colonnes\` et \`rangees\` (les carreaux d'un vantail : 3 et 2 pour six carreaux, 1 et 1 pour un verre d'un seul tenant), \`petitsBois\` (\`aucun\`, \`fins\`, \`epais\`), \`imposte\` (la partie haute vitrée à part : sa part de la hauteur de la baie, \`0\` sans imposte) et ses carreaux \`imposteColonnes\` et \`imposteRangees\`, \`vitrage\` (\`clair\`, \`depoli\`, \`teinte\`, \`vitrail\`). Pour une porte pleine ou une porte de garage, \`vantaux\` seul ; le reste \`indetermine\` ou \`-1\`.
- \`surface\` : le parement du mur. \`surface.principale\` : celui de la plus grande part du mur — \`enduit\`, \`pierre\`, \`brique\`, \`colombage\` (un pan de bois : poteaux, traverses et écharpes de bois apparents, un remplissage entre eux), \`bardage-bois\`, \`bardage-metal\` (métal ou composite), \`beton\`, ou \`mixte\` quand plusieurs parements se partagent le mur sans qu'aucun ne domine. \`surface.zones\` : chaque partie du mur d'un autre parement que le principal (ou chaque parement d'un mur \`mixte\`) — son \`type\` (les mêmes mots, sauf \`mixte\`), sa boîte \`u0\`, \`u1\`, \`v0\`, \`v1\` dans le repère du mur, et sa \`confiance\` ; un étage en colombage sur un rez-de-chaussée enduit est une zone \`colombage\` au-dessus de l'appui de l'étage, un pignon en colombage une zone au-dessus de l'égout. \`surface.confiance\` dit votre confiance dans le parement principal.
- \`saillies\` : ce qui avance du mur et porte un toit à soi, de \`u0\` à \`u1\` — \`genre\` (\`bow-window\` : une avancée vitrée du mur ; \`galerie\` : un toit sur poteaux le long du mur ; \`auvent\` : une marquise sur consoles, sans poteaux, au-dessus d'une porte ; \`appentis\` : une avancée fermée à un seul pan), \`forme\` du plan d'un bow-window (\`pans\` coupés, \`rectangle\`, \`arc\`, \`conge\` ; \`rectangle\` pour les autres), \`niveau\` (\`rdc\` : sous le premier étage ; \`toit\` : jusqu'au toit), \`toit\` (\`pan\`, \`pavillon\`, \`plat\`), \`haut\` (le bas de son toit, en \`v\`), \`couverture\` d'un auvent (\`verre\`, \`tuile\`, \`zinc\`, \`autre\` ; \`sans-objet\` pour les autres) et \`confiance\`. Vous ne dites pas sa profondeur : une vue de face ne la montre pas.
- \`decroches\` : chaque endroit où le nu du mur change (une partie qui avance ou recule), à sa place \`u\`, \`sens\` (\`avance\` ou \`recul\` de la partie de droite par rapport à celle de gauche) et \`confiance\`.
- \`modenature\` : ce qui décore le mur sans être une ouverture — \`egout\` (\`corniche\` moulurée, \`genoise\` : des rangs de tuiles sous l'égout, \`aucune\`) et \`rangsGenoise\` ; \`bandeaux\` : la hauteur \`v\` de chaque bande horizontale entre les niveaux ; \`chaines\` d'angle (\`pierre\`, \`brique\`, \`aucune\`) ; \`encadrements\` des baies (\`enduit\`, \`pierre\`, \`brique\`, \`aucun\`) ; \`soubassement\` (son haut en \`v\`, \`0\` sans soubassement) et \`parementSoubassement\` ; \`descentes\` : la place \`u\` de chaque descente d'eau pluviale.
- \`appendices\` : ce qui est posé contre le mur, sa boîte \`u0\`, \`u1\`, \`v0\`, \`v1\` — \`nature\` (\`perron\` : des marches devant une porte, et leur nombre \`marches\` ; \`store\` : un store banne, replié ou ouvert ; \`unite-exterieure\` : le caisson d'une climatisation ou d'une pompe à chaleur ; \`boite-aux-lettres\`) et \`confiance\`.
- \`etat\` : ce que l'image montre de l'état du mur, chaque zone dans sa boîte \`u0\`, \`u1\`, \`v0\`, \`v1\` — \`nature\` (\`fissure\`, \`enduit-abime\`, \`humidite\`, \`mousses\`, \`autre\`) et \`confiance\`. Plan le signale à la personne, sans rien en conclure : ne dites que ce qui se voit nettement.
- **La palette** des couleurs : \`blanc\`, \`creme\`, \`gris-clair\`, \`gris-fonce\`, \`gris-anthracite\`, \`bleu\`, \`vert\`, \`rouge\`, \`brun\`, \`bois\` (bois naturel ou lasuré), \`noir\` ; une couleur que l'ombre ou le contre-jour rend douteuse reste \`indetermine\`.
- \`confiance\` : \`forte\` si l'image est nette et le mur entier visible, \`moyenne\` si une partie est cachée ou floue, \`faible\` si l'image est mauvaise ou si vous doutez que ce soit le mur.

# Règles de prudence

- Une baie derrière un volet fermé compte : c'est la baie qu'il faut encadrer. Une ouverture entièrement cachée (un arbre, une voiture) ne s'invente pas : dites ce qui la cache dans \`calage.cache\`.
- Une ombre portée, une tache d'enduit, un reflet ou un volet ouvert contre le mur ne sont pas des ouvertures.
- Les bois d'un colombage dessinent des rectangles nets dans le mur : ce ne sont ni les angles du mur, ni son égout, ni des ouvertures. Les angles du mur sont là où le parement s'arrête, pas sur une ligne de bois au milieu de lui.
- Un triangle de colombages ou une tache en triangle dans le mur n'est pas un pignon : la pointe d'un pignon est sur la ligne du haut, contre le ciel ou le toit.
- Un pignon que vous voyez plus haut ou plus bas que le plan ne l'attend : donnez ce que vous voyez. Plan garde la hauteur du LiDAR et signale l'écart.
- Les carreaux se comptent sur la vitre, pas sur les volets ; des persiennes fermées ne disent rien du vitrage (\`indetermine\`).
- Un auvent, une galerie ou un store ne sont pas des ouvertures ; un perron n'est pas le soubassement. Une boîte aux lettres sur la clôture n'est pas sur le mur.
`;

const nombre = { type: 'number' } as const;
/**
 * Un compte (niveau, travee, carreaux, rangs, marches) et un nombre qui peut ne pas etre vu (un angle, une hauteur) : -1 quand il ne
 * l'est pas, jamais une union (voir SCHEMA). `default` le dit au serveur, qui en remplit un nombre manquant (une reponse du repli,
 * deploy/analyse-fonctions.php::valeurParDefaut), comme il remplit `indetermine` pour un mot.
 */
const compte = { type: 'integer', default: -1 } as const;
const nonVu = { type: 'number', default: -1 } as const;
/** Les parements d'un mur que Claude distingue (decision du proprietaire, 29 octobre 2026 : le colombage d'AE 101 trompait le calage). */
const PAREMENTS = ['enduit', 'pierre', 'brique', 'colombage', 'bardage-bois', 'bardage-metal', 'beton'] as const;
const objet = (proprietes: Record<string, unknown>): SchemaJson => ({ type: 'object', additionalProperties: false, required: Object.keys(proprietes), properties: proprietes });
const terme = (...termes: string[]): SchemaJson => ({ type: 'string', enum: termes });
const liste = (items: unknown): SchemaJson => ({ type: 'array', items });
const ref = (nom: string) => ({ $ref: '#/$defs/' + nom });

/**
 * Le schema de la reponse : chaque champ a son lecteur (regles/facades/observations.ts). Il part en sortie structuree
 * (`output_config.format`), que l'API compile en grammaire : jusqu'a la version 3, elle la refusait (« The compiled grammar is too
 * large », verification de l'API du 30 octobre 2026, runs 40998593930 et 41004304481, sur main comme sur le lot L1) et le serveur
 * retombait sur l'exemple. Ce qui alourdit la grammaire, d'apres la documentation de l'API : les unions (`anyOf`, cout exponentiel),
 * les champs facultatifs et les objets imbriques. D'ou, depuis la version 4 : aucune union (un nombre non vu vaut -1, que le lecteur
 * ecarte comme un nombre hors de son repere ; un angle introuvable a ses nombres a -1 ; l'imposte et le soubassement sont un nombre,
 * 0 pour « aucun »), aucun champ facultatif, et les details d'une baie a plat.
 */
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
      niveau: compte, travee: compte, confiance: ref('confiance'),
      details: objet({
        volets: terme('battants', 'roulant', 'persiennes', 'aucun', 'indetermine'),
        allege: terme('balcon', 'garde-corps', 'pleine', 'indetermine'),
        forme: terme('rect', 'cintre', 'rond', 'indetermine'),
        menuiserie: terme('bois', 'pvc', 'alu', 'acier', 'indetermine'),
        couleurMenuiserie: ref('couleur'),
        couleurVolets: terme(...MOTS_PALETTE, 'sans-objet', 'indetermine'),
        gardeCorps: terme('barreaux', 'fer-forge', 'verre', 'plein', 'sans-objet', 'indetermine'),
        hautGardeCorps: nonVu,
        couleurGardeCorps: ref('couleur'),
      }),
      carreaux: objet({
        vantaux: compte, colonnes: compte, rangees: compte,
        petitsBois: terme('aucun', 'fins', 'epais', 'indetermine'),
        imposte: nonVu, imposteColonnes: compte, imposteRangees: compte,
        vitrage: terme('clair', 'depoli', 'teinte', 'vitrail', 'indetermine'),
      }),
    })),
    saillies: liste(objet({
      genre: terme('bow-window', 'galerie', 'auvent', 'appentis'), u0: nombre, u1: nombre,
      forme: terme('pans', 'rectangle', 'arc', 'conge'), niveau: terme('rdc', 'toit'), toit: terme('pan', 'pavillon', 'plat'),
      haut: nonVu, couverture: terme('verre', 'tuile', 'zinc', 'autre', 'sans-objet'), confiance: ref('confiance'),
    })),
    decroches: liste(objet({ u: nombre, sens: terme('avance', 'recul'), confiance: ref('confiance') })),
    modenature: objet({
      egout: terme('aucune', 'corniche', 'genoise', 'indetermine'), rangsGenoise: compte,
      bandeaux: liste(nombre),
      chaines: terme('aucune', 'pierre', 'brique', 'indetermine'),
      encadrements: terme('aucun', 'enduit', 'pierre', 'brique', 'indetermine'),
      soubassement: nonVu, parementSoubassement: terme(...PAREMENTS, 'indetermine'),
      descentes: liste(nombre),
    }),
    appendices: liste(objet({ nature: terme('perron', 'store', 'unite-exterieure', 'boite-aux-lettres'), u0: nombre, u1: nombre, v0: nombre, v1: nombre, marches: compte, confiance: ref('confiance') })),
    etat: liste(objet({ nature: terme('fissure', 'enduit-abime', 'humidite', 'mousses', 'autre'), u0: nombre, u1: nombre, v0: nombre, v1: nombre, confiance: ref('confiance') })),
    // A la racine, un terme manquant prend le premier du vocabulaire (deploy/analyse-fonctions.php::conformer) : `faible`, le plus prudent.
    confiance: terme('faible', 'moyenne', 'forte'),
  }),
  $defs: {
    angle: objet({ x: nonVu, egout: nonVu, sol: nonVu, confiance: ref('confiance') }),
    etendue: objet({ debut: nombre, fin: nombre }),
    confiance: terme('forte', 'moyenne', 'faible', 'indetermine'),
    couleur: terme(...MOTS_PALETTE, 'indetermine'),
  },
};

/**
 * Un EXEMPLE de reponse, pour une facade inventee (un pignon, trois baies, un soubassement de pierre) : ce que le serveur montre a
 * Claude quand la sortie structuree ne sert pas (son repli), a la place du schema. Le schema en texte, Haiku le recopiait et logeait
 * ses valeurs dedans (« {"type":"object",…,"properties":{"calage":…{"gauche":{"x":0.22,… », verification de l'API du 29 octobre
 * 2026, run 40896695970). L'exemple a la forme du schema (tests/unit/regles/sujets/generation.test.ts le verifie) ; ses valeurs ne
 * disent rien d'une vraie facade.
 */
const EXEMPLE = {
  calage: {
    angles: { gauche: { x: 0.12, egout: 0.41, sol: 0.86, confiance: 'forte' }, droite: { x: 0.9, egout: 0.43, sol: 0.87, confiance: 'moyenne' } },
    pointes: [{ u: 0.5, v: 1.8, confiance: 'moyenne' }],
    appentis: [],
    corps: [],
    cache: [{ quoi: 'haie', debut: 0.78, fin: 1 }],
  },
  forme: { silhouette: 'triangle', bout: 'pignon' },
  elements: [{ element: 'cheminee', u: 0.62, confiance: 'faible' }],
  surface: { principale: 'enduit', zones: [{ type: 'pierre', u0: 0, u1: 1, v0: 0, v1: 0.12, confiance: 'moyenne' }], confiance: 'forte' },
  ouvertures: [
    { type: 'porte', u0: 0.2, u1: 0.3, v0: 0, v1: 0.42, niveau: 0, travee: 0, confiance: 'forte',
      details: { volets: 'aucun', allege: 'indetermine', forme: 'rect', menuiserie: 'bois', couleurMenuiserie: 'vert', couleurVolets: 'sans-objet', gardeCorps: 'sans-objet', hautGardeCorps: -1, couleurGardeCorps: 'indetermine' },
      carreaux: { vantaux: 1, colonnes: -1, rangees: -1, petitsBois: 'indetermine', imposte: 0, imposteColonnes: -1, imposteRangees: -1, vitrage: 'indetermine' } },
    { type: 'fenetre', u0: 0.62, u1: 0.74, v0: 0.18, v1: 0.42, niveau: 0, travee: 1, confiance: 'forte',
      details: { volets: 'battants', allege: 'pleine', forme: 'rect', menuiserie: 'bois', couleurMenuiserie: 'blanc', couleurVolets: 'bleu', gardeCorps: 'sans-objet', hautGardeCorps: -1, couleurGardeCorps: 'indetermine' },
      carreaux: { vantaux: 2, colonnes: 1, rangees: 3, petitsBois: 'fins', imposte: 0, imposteColonnes: -1, imposteRangees: -1, vitrage: 'clair' } },
    { type: 'fenetre', u0: 0.44, u1: 0.56, v0: 0.62, v1: 0.88, niveau: 1, travee: -1, confiance: 'moyenne',
      details: { volets: 'roulant', allege: 'garde-corps', forme: 'rect', menuiserie: 'pvc', couleurMenuiserie: 'blanc', couleurVolets: 'blanc', gardeCorps: 'fer-forge', hautGardeCorps: 0.78, couleurGardeCorps: 'noir' },
      carreaux: { vantaux: 2, colonnes: 1, rangees: 1, petitsBois: 'aucun', imposte: 0, imposteColonnes: -1, imposteRangees: -1, vitrage: 'clair' } },
  ],
  saillies: [{ genre: 'auvent', u0: 0.17, u1: 0.33, forme: 'rectangle', niveau: 'rdc', toit: 'pan', haut: 0.47, couverture: 'verre', confiance: 'moyenne' }],
  decroches: [],
  modenature: { egout: 'corniche', rangsGenoise: -1, bandeaux: [0.52], chaines: 'aucune', encadrements: 'enduit', soubassement: 0.12, parementSoubassement: 'pierre', descentes: [0.97] },
  appendices: [{ nature: 'perron', u0: 0.18, u1: 0.32, v0: 0, v1: 0.06, marches: 2, confiance: 'moyenne' }],
  etat: [],
  confiance: 'moyenne',
};

/** Le run d'une facade : son prompt, son schema et l'exemple du repli, tels que le serveur les sert (usage `facade`). */
export const RUN_FACADE: { prompt: string; schema: SchemaJson; exemple: object } = { prompt: PROMPT, schema: SCHEMA, exemple: EXEMPLE };
