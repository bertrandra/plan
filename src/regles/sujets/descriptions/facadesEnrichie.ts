// La facade enrichie (lot L1 de MD/spec-lecture-ia-elargie.md §4.1) : la SECONDE requete de la lecture d'une facade, sur la meme
// image que le run (facadesRun.ts). Elle lit ce que le run ne lit pas : la menuiserie, les volets et le garde-corps de chaque baie ;
// les saillies et les decroches ; la modenature ; ce qui est pose contre le mur ; l'etat du mur.
//
// Pourquoi une requete a part (decision du proprietaire, 30 octobre 2026) : la sortie structuree compile le schema en grammaire, et
// celle du run avec ces champs depasse la limite de l'API (« The compiled grammar is too large », dix essais du 30 octobre 2026, meme
// sans aucune enumeration). Le run garde donc les champs de 5.1.0, et ceux-ci ont leur schema, accepte seul. Les deux requetes ne se
// lisent pas l'une l'autre : une baie de cette lecture se rapporte a une ouverture du run par sa boite (facade/regles/facades/
// voteEnrichi.ts), et un echec de celle-ci laisse le run intact.
//
// Donnees pures : `npm run regles:generer` en ecrit deploy/prompt-facade-enrichie.md et deploy/schema-facade-enrichie.json
// (generation.ts), jamais a la main. Chaque champ a un lecteur (regles/facades/observations.ts, lireLectureEnrichie).

import type { SchemaJson } from '../description.js';
import { MOTS_PALETTE } from '../../facades/palette.js';

/** Le corps du prompt (sans en-tete) : ce que Claude lit, en system, avant le schema. */
const PROMPT = `# Rôle

Vous aidez le logiciel Plan à lire **une façade** sur une image, dans ses détails : ses menuiseries, ses saillies, son décor, ce qui est posé contre elle et son état. Plan connaît déjà, par le plan cadastral et le LiDAR, la largeur du mur et sa hauteur à l'égout, et une autre lecture situe ses angles et ses ouvertures : vous ne mesurez rien. Vous dites **où** sont les choses sur l'image, en proportions, et **ce qu'elles sont**. Une personne valide ensuite. Une réponse prudente vaut mieux qu'une réponse fausse : ce que vous ne voyez pas reste \`indetermine\` (un mot) ou \`-1\` (un nombre), ou hors de la liste.

# Ce que vous recevez

- **Image 1 : la façade, vue de face.** C'est l'assemblage des photos redressées du mur (ce qu'aucune photo ne montre est gris), ou une seule photo. Le mur ne remplit pas toujours l'image : du ciel, le sol, un voisin, des arbres l'entourent souvent.
- **Un texte** : l'étiquette de la façade, et ce que l'image montre du mur.

# Le repère du mur

\`u\` va de 0 (l'angle gauche du mur) à 1 (l'angle droit), le long du mur ; \`v\` va de 0 (le sol, au pied du mur) à 1 (l'égout, là où le toit commence sur les longs pans). Au-dessus de l'égout, \`v\` dépasse 1. Donnez les nombres au centième (0.37), sans chercher le pixel. **Tous les nombres de la réponse sont des parts**, jamais des pixels ni des mètres ; les seuls entiers sont des comptes (\`rangsGenoise\`, \`marches\`). Un nombre que vous ne voyez pas vaut \`-1\` : jamais un nombre deviné.

# Comment remplir la réponse

- \`baies\` : chaque fenêtre, porte-fenêtre, porte ou porte de garage du mur, de gauche à droite et de bas en haut, dans sa boîte \`u0\`, \`u1\` (les bords gauche et droit du tableau), \`v0\` (l'appui, ou le seuil) et \`v1\` (le linteau), et :
  - \`menuiserie\` : la matière du cadre et des ouvrants (\`bois\`, \`pvc\`, \`alu\`, \`acier\`), et \`couleurMenuiserie\` leur couleur (un mot de la palette) ; \`couleurVolets\` : la couleur des volets ou du tablier (un mot de la palette, \`sans-objet\` sans volets) ;
  - \`gardeCorps\` : le garde-corps devant la baie ou au bord de son balcon (\`barreaux\` droits, \`fer-forge\` à volutes, \`verre\`, \`plein\` maçonné ou en tôle ; \`sans-objet\` sans garde-corps), \`hautGardeCorps\` le dessus de sa main courante (en \`v\`) et \`couleurGardeCorps\` sa couleur (un mot de la palette).
- \`saillies\` : ce qui avance du mur et porte un toit à soi, de \`u0\` à \`u1\` — \`genre\` (\`bow-window\` : une avancée vitrée du mur ; \`galerie\` : un toit sur poteaux le long du mur ; \`auvent\` : une marquise sur consoles, sans poteaux, au-dessus d'une porte ; \`appentis\` : une avancée fermée à un seul pan), \`forme\` du plan d'un bow-window (\`pans\` coupés, \`rectangle\`, \`arc\`, \`conge\` ; \`rectangle\` pour les autres), \`niveau\` (\`rdc\` : sous le premier étage ; \`toit\` : jusqu'au toit), \`toit\` (\`pan\`, \`pavillon\`, \`plat\`), \`haut\` (le bas de son toit, en \`v\`), \`couverture\` d'un auvent (\`verre\`, \`tuile\`, \`zinc\`, \`autre\` ; \`sans-objet\` pour les autres) et \`confiance\`. Vous ne dites pas sa profondeur : une vue de face ne la montre pas.
- \`decroches\` : chaque endroit où le nu du mur change (une partie qui avance ou recule), à sa place \`u\`, \`sens\` (\`avance\` ou \`recul\` de la partie de droite par rapport à celle de gauche) et \`confiance\`.
- \`modenature\` : ce qui décore le mur sans être une ouverture — \`egout\` (\`corniche\` moulurée, \`genoise\` : des rangs de tuiles sous l'égout, \`aucune\`) et \`rangsGenoise\` ; \`bandeaux\` : la hauteur \`v\` de chaque bande horizontale entre les niveaux ; \`chaines\` d'angle (\`pierre\`, \`brique\`, \`aucune\`) ; \`encadrements\` des baies (\`enduit\`, \`pierre\`, \`brique\`, \`aucun\`) ; \`soubassement\` (son haut en \`v\`, \`0\` sans soubassement) et \`parementSoubassement\` (\`enduit\`, \`pierre\`, \`brique\`, \`colombage\`, \`bardage-bois\`, \`bardage-metal\`, \`beton\`) ; \`descentes\` : la place \`u\` de chaque descente d'eau pluviale.
- \`appendices\` : ce qui est posé contre le mur, sa boîte \`u0\`, \`u1\`, \`v0\`, \`v1\` — \`nature\` (\`perron\` : des marches devant une porte, et leur nombre \`marches\` ; \`store\` : un store banne, replié ou ouvert ; \`unite-exterieure\` : le caisson d'une climatisation ou d'une pompe à chaleur ; \`boite-aux-lettres\`) et \`confiance\`.
- \`etat\` : ce que l'image montre de l'état du mur, chaque zone dans sa boîte \`u0\`, \`u1\`, \`v0\`, \`v1\` — \`nature\` (\`fissure\`, \`enduit-abime\`, \`humidite\`, \`mousses\`, \`autre\`) et \`confiance\`. Plan le signale à la personne, sans rien en conclure : ne dites que ce qui se voit nettement.
- **La palette** des couleurs : \`blanc\`, \`creme\`, \`gris-clair\`, \`gris-fonce\`, \`gris-anthracite\`, \`bleu\`, \`vert\`, \`rouge\`, \`brun\`, \`bois\` (bois naturel ou lasuré), \`noir\` ; une couleur que l'ombre ou le contre-jour rend douteuse reste \`indetermine\`.
- \`confiance\` : \`forte\` si l'image est nette et l'élément entier visible, \`moyenne\` si une partie est cachée ou floue, \`faible\` si vous doutez.

# Règles de prudence

- Les volets se décrivent ouverts ou fermés, la menuiserie sur le cadre de la baie, pas sur les volets.
- Un auvent, une galerie ou un store ne sont pas des baies ; un perron n'est pas le soubassement. Une boîte aux lettres sur la clôture n'est pas sur le mur.
- Une ombre portée, une tache d'enduit ou un reflet ne sont ni une fissure ni de l'humidité.
`;

const nombre = { type: 'number' } as const;
/** Un compte (rangs, marches) et un nombre qui peut ne pas etre vu (une hauteur) : -1 quand il ne l'est pas (facadesRun.ts). */
const compte = { type: 'integer', default: -1 } as const;
const nonVu = { type: 'number', default: -1 } as const;
/** Les parements d'un soubassement (les memes mots que le parement du run). */
const PAREMENTS = ['enduit', 'pierre', 'brique', 'colombage', 'bardage-bois', 'bardage-metal', 'beton'] as const;
const objet = (proprietes: Record<string, unknown>): SchemaJson => ({ type: 'object', additionalProperties: false, required: Object.keys(proprietes), properties: proprietes });
const terme = (...termes: string[]): SchemaJson => ({ type: 'string', enum: termes });
const liste = (items: unknown): SchemaJson => ({ type: 'array', items });
const ref = (nom: string) => ({ $ref: '#/$defs/' + nom });

/**
 * Le schema de la reponse, en sortie structuree : sans union ni champ facultatif, une baie a plat. Accepte par l'API seul (essai du
 * 30 octobre 2026) ; avec le run, il ne l'etait pas.
 */
const SCHEMA: SchemaJson = {
  ...objet({
    baies: liste(objet({
      u0: nombre, u1: nombre, v0: nombre, v1: nombre,
      menuiserie: terme('bois', 'pvc', 'alu', 'acier', 'indetermine'),
      couleurMenuiserie: ref('couleur'),
      couleurVolets: terme(...MOTS_PALETTE, 'sans-objet', 'indetermine'),
      gardeCorps: terme('barreaux', 'fer-forge', 'verre', 'plein', 'sans-objet', 'indetermine'),
      hautGardeCorps: nonVu,
      couleurGardeCorps: ref('couleur'),
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
  }),
  $defs: {
    confiance: terme('forte', 'moyenne', 'faible', 'indetermine'),
    couleur: terme(...MOTS_PALETTE, 'indetermine'),
  },
};

/**
 * Un EXEMPLE de reponse, pour une facade inventee : ce que le serveur montre a Claude quand la sortie structuree ne sert pas (son repli,
 * un batch), a la place du schema (comme pour le run). Il a la forme du schema (tests/unit/regles/sujets/generation.test.ts) ; ses
 * valeurs ne disent rien d'une vraie facade.
 */
const EXEMPLE = {
  baies: [
    { u0: 0.2, u1: 0.3, v0: 0, v1: 0.42, menuiserie: 'bois', couleurMenuiserie: 'vert', couleurVolets: 'sans-objet', gardeCorps: 'sans-objet', hautGardeCorps: -1, couleurGardeCorps: 'indetermine' },
    { u0: 0.62, u1: 0.74, v0: 0.18, v1: 0.42, menuiserie: 'bois', couleurMenuiserie: 'blanc', couleurVolets: 'bleu', gardeCorps: 'sans-objet', hautGardeCorps: -1, couleurGardeCorps: 'indetermine' },
    { u0: 0.44, u1: 0.56, v0: 0.62, v1: 0.88, menuiserie: 'pvc', couleurMenuiserie: 'blanc', couleurVolets: 'blanc', gardeCorps: 'fer-forge', hautGardeCorps: 0.78, couleurGardeCorps: 'noir' },
  ],
  saillies: [{ genre: 'auvent', u0: 0.17, u1: 0.33, forme: 'rectangle', niveau: 'rdc', toit: 'pan', haut: 0.47, couverture: 'verre', confiance: 'moyenne' }],
  decroches: [],
  modenature: { egout: 'corniche', rangsGenoise: -1, bandeaux: [0.52], chaines: 'aucune', encadrements: 'enduit', soubassement: 0.12, parementSoubassement: 'pierre', descentes: [0.97] },
  appendices: [{ nature: 'perron', u0: 0.18, u1: 0.32, v0: 0, v1: 0.06, marches: 2, confiance: 'moyenne' }],
  etat: [],
};

/** La lecture enrichie d'une facade : son prompt, son schema et l'exemple du repli, tels que le serveur les sert (usage `facade-enrichie`). */
export const LECTURE_FACADE_ENRICHIE: { prompt: string; schema: SchemaJson; exemple: object } = { prompt: PROMPT, schema: SCHEMA, exemple: EXEMPLE };
